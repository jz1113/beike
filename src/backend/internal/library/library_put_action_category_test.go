package library

import (
	"context"
	"encoding/json"
	"net/http"
	"path/filepath"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/database"
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
	"beike.local/cloud/src/backend/internal/platform/database/migrate"
)

func TestLibraryPutActionCategoryPersists(t *testing.T) {
	root, err := filepath.Abs(filepath.Join("..", "..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "actions.db")
	if err := migrate.Run(path, root, false); err != nil {
		t.Fatal(err)
	}
	db, err := database.OpenWrite(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	handler := libraryPutHandler(config.Config{DatabaseURL: "file:" + path, Root: root})
	for _, kind := range []string{"image", "video", "depth-image", "depth-video"} {
		t.Run(kind, func(t *testing.T) {
			mediaURL, sourceURL := "/storage/local/action.mp4", "/storage/local/source.mp4"
			raw, err := dblibrary.CreateLibraryAsset(context.Background(), db, "local", "action", map[string]any{
				"title": "原动作", "productCategoryIds": `["clothing"]`,
				"mediaType": kind, "mediaUrl": mediaURL, "sourceUrl": sourceURL,
			})
			if err != nil {
				t.Fatal(err)
			}
			var created struct{ ID string }
			if err := json.Unmarshal(raw, &created); err != nil {
				t.Fatal(err)
			}
			for _, categories := range []string{`["digital_3c"]`, `[]`} {
				payload, err := json.Marshal(map[string]any{
					"assetType": "action", "id": created.ID,
					"data": map[string]any{"title": "已编辑动作", "productCategoryIds": categories},
				})
				if err != nil {
					t.Fatal(err)
				}
				status, body := putLibrary(t, handler, string(payload))
				if status != http.StatusOK || body["success"] != true {
					t.Fatalf("save category %s: %d %#v", categories, status, body)
				}
				item, ok := body["item"].(map[string]any)
				if !ok || item["productCategoryIds"] != categories || item["title"] != "已编辑动作" {
					t.Fatalf("saved item: %#v", body["item"])
				}
				var storedCategories, storedTitle, storedKind, storedMedia, storedSource string
				err = db.QueryRow(`SELECT "productCategoryIds", "title", "mediaType", "mediaUrl", "sourceUrl"
					FROM "ActionAsset" WHERE "id" = ? AND "workspaceId" = 'local'`, created.ID).
					Scan(&storedCategories, &storedTitle, &storedKind, &storedMedia, &storedSource)
				if err != nil {
					t.Fatal(err)
				}
				if storedCategories != categories || storedTitle != "已编辑动作" || storedKind != kind || storedMedia != mediaURL || storedSource != sourceURL {
					t.Fatalf("persisted action: %q %q %q %q %q", storedCategories, storedTitle, storedKind, storedMedia, storedSource)
				}
			}
		})
	}
}

func TestLibraryPutActionCategoryRejectsInvalidTypes(t *testing.T) {
	handler := libraryPutHandler(config.Config{})
	for _, value := range []string{`null`, `[]`, `42`, `{}`} {
		status, body := putLibrary(t, handler, `{"assetType":"action","id":"1","data":{"productCategoryIds":`+value+`}}`)
		if status != http.StatusBadRequest || body["error"] != "字段类型不正确: productCategoryIds" {
			t.Fatalf("category %s: %d %#v", value, status, body)
		}
	}
}
