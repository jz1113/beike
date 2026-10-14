package catalog

import (
	"context"
	"testing"
)

func TestSaveAndImportPromptFolderRules(t *testing.T) {
	db := openFolderDB(t)
	if _, err := db.Exec(`INSERT INTO "AssetProductCategory" ("id","workspaceId","name","parentId","position","isArchived","aliases","keywords","anatomy") VALUES
		('digital_3c','local','数码',NULL,0,0,'[]','[]','[]'),
		('jewelry','local','珠宝',NULL,1,0,'[]','[]','[]'),
		('neck','local','项链','jewelry',0,0,'[]','["甲"]','[]')`); err != nil {
		t.Fatal(err)
	}
	if _, err := SavePromptFolderRules(context.Background(), db, "local", "prompt_subcategory:digital_3c:phone", []string{" 项链 ", "项链"}, []string{"链"}); err != nil {
		t.Fatal(err)
	}
	var name, keywords, anatomy, parent string
	if err := db.QueryRow(`SELECT "name", "parentId", "keywords", "anatomy" FROM "AssetProductCategory" WHERE "id" = 'prompt_subcategory:digital_3c:phone'`).Scan(&name, &parent, &keywords, &anatomy); err != nil {
		t.Fatal(err)
	}
	if name != "手机本体" || parent != "digital_3c" || keywords != `["项链"]` || anatomy != `["链"]` {
		t.Fatalf("builtin %s %s %s %s", name, parent, keywords, anatomy)
	}
	if _, err := SavePromptFolderRules(context.Background(), db, "local", "universal", nil, nil); err == nil || err.Error() != "系统虚拟分类不可编辑规则" {
		t.Fatalf("virtual %v", err)
	}
	parentID := "jewelry"
	result, err := ImportPromptFolderRules(context.Background(), db, "local", parentID, "append", []FolderRuleItem{
		{Name: "项链", Keywords: []string{"乙"}},
		{Name: "手链", Keywords: []string{"手"}, HasAnatomy: true, Anatomy: []string{"腕"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.CreatedCount != 1 || result.UpdatedCount != 1 {
		t.Fatalf("import %#v", result)
	}
	if err := db.QueryRow(`SELECT "keywords" FROM "AssetProductCategory" WHERE "id" = 'neck'`).Scan(&keywords); err != nil || keywords != `["甲","乙"]` {
		t.Fatalf("merged %s err %v", keywords, err)
	}
	if err := db.QueryRow(`SELECT "anatomy" FROM "AssetProductCategory" WHERE "name" = '手链'`).Scan(&anatomy); err != nil || anatomy != `["腕"]` {
		t.Fatalf("created anatomy %s err %v", anatomy, err)
	}
}
