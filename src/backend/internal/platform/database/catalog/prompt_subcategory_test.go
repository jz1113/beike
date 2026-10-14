package catalog

import (
	"context"
	"strings"
	"testing"
)

func TestSavePromptSubcategory(t *testing.T) {
	db := openFolderDB(t)
	if _, err := db.Exec(`INSERT INTO "AssetProductCategory" ("id","workspaceId","name","parentId","position","isArchived","aliases","keywords","anatomy") VALUES
		('jewelry','local','珠宝',NULL,0,0,'[]','[]','[]'),
		('digital_3c','local','数码',NULL,1,0,'[]','[]','[]'),
		('official','official','官方',NULL,2,0,'[]','[]','[]')`); err != nil {
		t.Fatal(err)
	}
	if _, err := SavePromptSubcategory(context.Background(), db, "local", "jewelry", "", "定制"); err != nil {
		t.Fatal(err)
	}
	var id, parent string
	if err := db.QueryRow(`SELECT "id", "parentId" FROM "AssetProductCategory" WHERE "name" = '定制'`).Scan(&id, &parent); err != nil {
		t.Fatal(err)
	}
	if parent != "jewelry" || !strings.HasPrefix(id, "prompt_subcategory:") {
		t.Fatalf("custom %s %s", id, parent)
	}
	if _, err := SavePromptSubcategory(context.Background(), db, "local", "jewelry", id, "定制夹"); err != nil {
		t.Fatal(err)
	}
	if _, err := SavePromptSubcategory(context.Background(), db, "local", "jewelry", "", "定制夹"); err == nil || err.Error() != "同级文件夹名称已存在" {
		t.Fatalf("duplicate %v", err)
	}
	if _, err := SavePromptSubcategory(context.Background(), db, "local", "jewelry", "phone", "手机"); err == nil || err.Error() != "数码细分只能用于手机数码" {
		t.Fatalf("phone %v", err)
	}
	if _, err := SavePromptSubcategory(context.Background(), db, "local", "digital_3c", "", "手机本体"); err != nil {
		t.Fatal(err)
	}
	var builtin string
	if err := db.QueryRow(`SELECT "id" FROM "AssetProductCategory" WHERE "name" = '手机本体'`).Scan(&builtin); err != nil || builtin != "prompt_subcategory:digital_3c:phone" {
		t.Fatalf("builtin %s err %v", builtin, err)
	}
	if _, err := SavePromptSubcategory(context.Background(), db, "local", "official", "", "新文件夹"); err == nil || err.Error() != "商品大类不存在或不可编辑" {
		t.Fatalf("official %v", err)
	}
}
