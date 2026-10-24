package migrate

import (
	"context"
	"database/sql"
	"encoding/json"
	"path/filepath"
	"testing"
)

func TestReferenceFolderRepairRestoresOnlyNeededFolderAndRequiresSubjectEvidence(t *testing.T) {
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "folders.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, schema := range []string{
		`CREATE TABLE "AssetProductCategory" ("id" TEXT PRIMARY KEY,"name" TEXT,"parentId" TEXT,"workspaceId" TEXT,"isArchived" INTEGER DEFAULT 0)`,
		`INSERT INTO "AssetProductCategory" VALUES ('digital_3c','手机',NULL,'local',0),('prompt_subcategory:digital_3c:case','壳','digital_3c','local',1),('prompt_subcategory:digital_3c:earphone','耳机','digital_3c','local',1)`,
		`CREATE TABLE "FullPromptAsset" ("id" TEXT,"workspaceId" TEXT,"shotPromptsJson" TEXT,"productCategoryIds" TEXT,"productSubcategory" TEXT)`,
	} {
		if _, err := db.Exec(schema); err != nil {
			t.Fatal(err)
		}
	}
	for _, test := range []struct{ id, prompt string }{{"case", "【主体】金黄色编织手机壳\n【物体细节】圆角与镜头开孔"}, {"phone", "【主体】手机本体与屏幕\n【物体细节】搭配手机壳"}} {
		shots := []map[string]any{}
		for i := 0; i < 4; i++ {
			shots = append(shots, map[string]any{"prompt": test.prompt})
		}
		raw, _ := json.Marshal(shots)
		if _, err := db.Exec(`INSERT INTO "FullPromptAsset" VALUES (?,'local',?,'["digital_3c"]','phone')`, test.id, string(raw)); err != nil {
			t.Fatal(err)
		}
	}
	if err := applyReferenceFolderRepair(context.Background(), db); err != nil {
		t.Fatal(err)
	}
	for id, want := range map[string]string{"case": "case", "phone": "phone"} {
		var got string
		if err := db.QueryRow(`SELECT "productSubcategory" FROM "FullPromptAsset" WHERE "id"=?`, id).Scan(&got); err != nil || got != want {
			t.Fatal(id, got, err)
		}
	}
	var archived int
	if err := db.QueryRow(`SELECT "isArchived" FROM "AssetProductCategory" WHERE "id"='prompt_subcategory:digital_3c:earphone'`).Scan(&archived); err != nil || archived != 1 {
		t.Fatal("unrelated archived folder changed", err)
	}
}
