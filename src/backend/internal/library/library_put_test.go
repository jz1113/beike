package library

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/database"
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
	"beike.local/cloud/src/backend/internal/platform/database/migrate"
)

func TestLibraryPutRejectsInvalidEdits(t *testing.T) {
	handler := libraryPutHandler(config.Config{})
	status, body := putLibrary(t, handler, `{}`)
	if status != http.StatusBadRequest || body["error"] != "缺少 assetType、id 或 data" || body["success"] != nil {
		t.Fatalf("missing %d %#v", status, body)
	}
	status, body = putLibrary(t, handler, `{"assetType":"video","id":"1","data":{"title":"a"}}`)
	if status != http.StatusBadRequest || body["success"] != false || body["error"] != "不支持的资产类型" {
		t.Fatalf("type %d %#v", status, body)
	}
	status, body = putLibrary(t, handler, `{"assetType":"scene","id":"1","data":{"nope":"a"}}`)
	if status != http.StatusBadRequest || body["error"] != "不允许更新字段: nope" {
		t.Fatalf("field %d %#v", status, body)
	}
	status, body = putLibrary(t, handler, `{"assetType":"scene","id":"1","data":{"usageCount":1.5}}`)
	if status != http.StatusBadRequest || body["error"] != "字段数值不正确: usageCount" {
		t.Fatalf("number %d %#v", status, body)
	}
	status, body = putLibrary(t, handler, `{"assetType":"persona","id":"1","data":{"dimensions":"{\"audience\":\"adult_unisex\"}"}}`)
	if status != http.StatusBadRequest || body["error"] != "人群二级分类无效" {
		t.Fatalf("audience %d %#v", status, body)
	}
	status, body = putLibrary(t, handler, `{`)
	if status != http.StatusInternalServerError || body["error"] != "请求数据格式异常" {
		t.Fatalf("json %d %#v", status, body)
	}
}

func putLibrary(t *testing.T, handler http.Handler, body string) (int, map[string]any) {
	t.Helper()
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPut, "/api/catalog/assets/library", bytes.NewBufferString(body))
	handler.ServeHTTP(response, request)
	decoded := map[string]any{}
	if err := json.Unmarshal(response.Body.Bytes(), &decoded); err != nil {
		t.Fatal(err)
	}
	return response.Code, decoded
}

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

func TestLibraryPutPersonaViewsPreservesExistingDescription(t *testing.T) {
	root, err := filepath.Abs(filepath.Join("..", "..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "personas.db")
	if err := migrate.Run(path, root, false); err != nil {
		t.Fatal(err)
	}
	db, err := database.OpenWrite(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	raw, err := dblibrary.CreateLibraryAsset(context.Background(), db, "local", "persona", map[string]any{
		"name": "人物", "description": "保留历史描述", "avatarUrl": "/old-face", "sourceImages": `["/main","/old-face"]`,
	})
	if err != nil {
		t.Fatal(err)
	}
	var created struct{ ID string }
	if err := json.Unmarshal(raw, &created); err != nil {
		t.Fatal(err)
	}
	dimensions := `{"audience":"adult_female","personaViews":{"main":"/main","face":"/face","side":"/side","front":"/front"}}`
	images := `["/main","/face","/side","/front"]`
	payload, _ := json.Marshal(map[string]any{"assetType": "persona", "id": created.ID, "data": map[string]any{
		"name": "已更新人物", "avatarUrl": "/face", "sourceImages": images, "dimensions": dimensions,
	}})
	status, body := putLibrary(t, libraryPutHandler(config.Config{DatabaseURL: "file:" + path, Root: root}), string(payload))
	if status != http.StatusOK || body["success"] != true {
		t.Fatalf("save: %d %#v", status, body)
	}
	var avatar, sources, dims, description string
	err = db.QueryRow(`SELECT "avatarUrl","sourceImages","dimensions","description" FROM "PersonaAsset" WHERE "id"=?`, created.ID).Scan(&avatar, &sources, &dims, &description)
	if err != nil {
		t.Fatal(err)
	}
	if avatar != "/face" || sources != images || dims != dimensions || description != "保留历史描述" {
		t.Fatalf("lost persona fields: %s %s %s %s", avatar, sources, dims, description)
	}
}
