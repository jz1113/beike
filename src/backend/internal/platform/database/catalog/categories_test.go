package catalog

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestListServerSubCategoriesUsesDefaultsThenRows(t *testing.T) {
	db, err := database.OpenWrite(filepath.Join(t.TempDir(), "categories.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.Exec(`CREATE TABLE "AssetProductCategory" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "parentId" TEXT, "name" TEXT NOT NULL,
		"position" INTEGER NOT NULL DEFAULT 0, "keywords" TEXT NOT NULL DEFAULT '[]', "anatomy" TEXT NOT NULL DEFAULT '[]'
	)`); err != nil {
		t.Fatal(err)
	}
	defaults := filepath.Join(repoRoot(t), "src/shared/data/defaultSubCategories.json")
	empty, err := ListServerSubCategories(context.Background(), db, "local", defaults)
	if err != nil {
		t.Fatal(err)
	}
	if keys := objectKeys(t, empty); keys[0] != "jewelry" || keys[len(keys)-1] != "universal" {
		t.Fatalf("keys %#v", keys)
	}
	categories := map[string][]map[string]any{}
	if err := json.Unmarshal(empty, &categories); err != nil {
		t.Fatal(err)
	}
	if categories["jewelry"][0]["id"] != "necklace" || len(categories["bag"]) != 0 {
		t.Fatalf("defaults %#v", categories["jewelry"][0])
	}
	if _, err := db.Exec(`INSERT INTO "AssetProductCategory" ("id","workspaceId","parentId","name","position","keywords","anatomy") VALUES
		('custom','local','jewelry','定制项链',0,'["项链",1]','["neck"]'),
		('foreign','other','jewelry','其他工作区',0,'[]','[]'),
		('root','local','', '父级',0,'[]','[]')`); err != nil {
		t.Fatal(err)
	}
	replaced, err := ListServerSubCategories(context.Background(), db, "local", defaults)
	if err != nil {
		t.Fatal(err)
	}
	categories = map[string][]map[string]any{}
	if err := json.Unmarshal(replaced, &categories); err != nil {
		t.Fatal(err)
	}
	item := categories["jewelry"][0]
	if len(categories["jewelry"]) != 1 || item["id"] != "custom" || item["shortLabel"] != "定制项链" || item["anatomy"] != "neck" {
		t.Fatalf("replaced %#v", categories["jewelry"])
	}
	keywords, _ := item["keywords"].([]any)
	if len(keywords) != 1 || keywords[0] != "项链" {
		t.Fatalf("keywords %#v", item["keywords"])
	}
	if _, ok := categories["root"]; ok {
		t.Fatal("没有父级的类目不应出现")
	}
	if len(categories["apparel"]) == 0 {
		t.Fatal("没有数据库记录的类目应保留默认清单")
	}
}

func objectKeys(t *testing.T, raw []byte) []string {
	t.Helper()
	decoder := json.NewDecoder(bytes.NewReader(raw))
	if _, err := decoder.Token(); err != nil {
		t.Fatal(err)
	}
	keys := []string{}
	for decoder.More() {
		token, err := decoder.Token()
		if err != nil {
			t.Fatal(err)
		}
		var skip json.RawMessage
		if err := decoder.Decode(&skip); err != nil {
			t.Fatal(err)
		}
		keys = append(keys, token.(string))
	}
	return keys
}

func repoRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatal("找不到仓库根目录")
		}
		dir = parent
	}
}
