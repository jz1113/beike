package sales

import (
	"context"
	"database/sql"
	"testing"
)

func TestStudioActionsOnlyIncludeWorkspaceMaterials(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`CREATE TABLE "ActionAsset" (
 "id" TEXT, "workspaceId" TEXT, "title" TEXT, "action" TEXT, "shotType" TEXT,
 "camera" TEXT, "tags" TEXT, "coverUrl" TEXT,
 "mediaType" TEXT DEFAULT 'image', "mediaUrl" TEXT DEFAULT '', "sourceUrl" TEXT DEFAULT '',
 "productCategoryIds" TEXT DEFAULT '[]', "isFavorite" INTEGER, "usageCount" INTEGER, "createdAt" TEXT
 );
 INSERT INTO "ActionAsset" ("id","workspaceId","title","action","shotType","productCategoryIds","isFavorite") VALUES
 ('local','mine','本地动作','转身展示{{商品}}','全景','["taxonomy_cat1"]',1),
 ('public','official','预置动作','手部展示{{商品}}','近景','[]',0),
 ('private','other','私有动作','不可读取','近景','[]',0)`)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`INSERT INTO "ActionAsset" ("id","workspaceId","title","action","shotType","mediaType","mediaUrl","sourceUrl")
 VALUES ('depth','mine','深度转身','','全景','depth-video','/depth.mp4','/original.mp4')`)
	if err != nil {
		t.Fatal(err)
	}
	actions, err := queryStudioActions(context.Background(), db, "mine")
	if err != nil {
		t.Fatal(err)
	}
	if len(actions) != 2 || actions[0].ID != "local" || actions[0].Action != "转身展示{{商品}}" || actions[0].CategoryID != "taxonomy_cat1" {
		t.Fatalf("unexpected actions: %+v", actions)
	}
	if actions[0].MediaType != "image" || actions[1].MediaType != "depth-video" || actions[1].MediaURL != "/depth.mp4" || actions[1].SourceURL != "/original.mp4" {
		t.Fatalf("media not preserved: %+v", actions)
	}
}
