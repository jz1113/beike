package database

import (
	"context"
	"strings"
	"testing"
)

func TestListPromptGroupsUsesLibraryNumbers(t *testing.T) {
	db := openPromptCreateDB(t)
	if _, err := db.Exec(`CREATE TABLE "FullPromptImageReplacement" (
		"motherAssetId" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "FullPromptAsset"
		("id","workspaceId","title","provenance","groupIndex","createdAt","isFavorite","usageCount") VALUES
		('later','local','街景母组','manual',1,'2026-01-02T00:00:00.000Z',0,0),
		('early','local','窗边母组','manual',1,'2026-01-01T00:00:00.000Z',1,9),
		('old','local','旧单图','legacy_single',NULL,'2026-01-03T00:00:00.000Z',1,9),
		('raw','local','未成组','deconstructed',NULL,'2026-01-04T00:00:00.000Z',1,9)`); err != nil {
		t.Fatal(err)
	}
	list, err := ListLibraryAssets(context.Background(), db, "local", "full_prompt", 1, 1, "", false, "", "", true, "")
	if err != nil || list.Total != 2 || len(list.Items) != 1 || !strings.Contains(string(list.Items[0]), `"id":"early"`) || !strings.Contains(string(list.Items[0]), `"displayNumber":1`) || !strings.Contains(string(list.Items[0]), `"code":"R-arly"`) {
		t.Fatalf("page %d %#v %v", list.Total, list.Items, err)
	}
	keyword, err := ListLibraryAssets(context.Background(), db, "local", "full_prompt", 1, 50, "街景", false, "", "", true, "")
	if err != nil || keyword.Total != 1 || !strings.Contains(string(keyword.Items[0]), `"id":"later"`) {
		t.Fatalf("keyword %d %#v %v", keyword.Total, keyword.Items, err)
	}
}
