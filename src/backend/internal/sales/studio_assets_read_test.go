package sales

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func setupStudioCatalogTestConfig(t *testing.T) config.Config {
	t.Helper()
	cfg := setupSalesTestConfig(t)
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`
CREATE TABLE "PersonaAsset" (
 "id" TEXT, "workspaceId" TEXT, "name" TEXT, "description" TEXT DEFAULT '', "tags" TEXT DEFAULT '',
 "avatarUrl" TEXT DEFAULT '', "sourceImages" TEXT DEFAULT '[]', "dimensions" TEXT DEFAULT '',
 "isFavorite" INTEGER DEFAULT 0, "usageCount" INTEGER DEFAULT 0, "createdAt" TEXT DEFAULT ''
);
CREATE TABLE "SceneAsset" (
 "id" TEXT, "workspaceId" TEXT, "title" TEXT, "description" TEXT DEFAULT '', "lighting" TEXT DEFAULT '',
 "category" TEXT DEFAULT '', "spatialType" TEXT DEFAULT '', "tags" TEXT DEFAULT '',
 "suitableCategories" TEXT DEFAULT '[]', "coverUrl" TEXT DEFAULT '', "sourceImages" TEXT DEFAULT '[]',
 "dimensions" TEXT DEFAULT '', "isFavorite" INTEGER DEFAULT 0, "usageCount" INTEGER DEFAULT 0, "createdAt" TEXT DEFAULT ''
);
CREATE TABLE "ActionAsset" (
 "id" TEXT, "workspaceId" TEXT, "title" TEXT, "action" TEXT DEFAULT '', "shotType" TEXT DEFAULT '',
 "camera" TEXT DEFAULT '', "tags" TEXT DEFAULT '', "coverUrl" TEXT DEFAULT '',
 "mediaType" TEXT DEFAULT 'image', "mediaUrl" TEXT DEFAULT '', "sourceUrl" TEXT DEFAULT '',
 "productCategoryIds" TEXT DEFAULT '[]', "isFavorite" INTEGER DEFAULT 0, "usageCount" INTEGER DEFAULT 0, "createdAt" TEXT DEFAULT ''
);`)
	if err != nil {
		t.Fatal(err)
	}
	return cfg
}

func TestStudioAssetsDistinguishesEmptyCatalogFromReadFailure(t *testing.T) {
	for _, table := range []string{"", "PersonaAsset", "AvatarCharacter", "SceneAsset", "ActionAsset", "AvatarVoice", "SalesProductionPreset"} {
		name := table
		if name == "" {
			name = "empty"
		}
		t.Run(name, func(t *testing.T) {
			cfg := setupStudioCatalogTestConfig(t)
			if table != "" {
				db, err := sql.Open("sqlite", cfg.SQLiteFile())
				if err != nil {
					t.Fatal(err)
				}
				defer db.Close()
				if _, err := db.Exec(`DROP TABLE "` + table + `"`); err != nil {
					t.Fatal(err)
				}
			}
			rec := httptest.NewRecorder()
			StudioAssets(cfg).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/sales/studio-assets", nil))
			var response map[string]any
			_ = json.Unmarshal(rec.Body.Bytes(), &response)
			if table != "" {
				if rec.Code != 500 || response["success"] != false || response["personas"] != nil || strings.Contains(rec.Body.String(), "SQL") {
					t.Fatalf("broken %s must not masquerade as empty/deleted assets: %d %s", table, rec.Code, rec.Body.String())
				}
				return
			}
			if rec.Code != 200 || response["success"] != true {
				t.Fatalf("empty workspace should succeed: %d %s", rec.Code, rec.Body.String())
			}
			for _, key := range []string{"personas", "scenes", "actions", "voices", "bgms"} {
				if items, ok := response[key].([]any); !ok || len(items) != 0 {
					t.Fatalf("expected empty %s array: %s", key, rec.Body.String())
				}
			}
		})
	}
}

func TestStudioAssetsDoesNotSilentlyDropUnreadableRows(t *testing.T) {
	cfg := setupStudioCatalogTestConfig(t)
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	// A malformed stored row used to be skipped, clearing a previously selected action.
	if _, err := db.Exec(`INSERT INTO "ActionAsset" ("id","workspaceId","title","action") VALUES ('a','local','动作',NULL)`); err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	StudioAssets(cfg).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/sales/studio-assets", nil))
	if rec.Code != 500 {
		t.Fatalf("scan failure must fail the catalog: %d %s", rec.Code, rec.Body.String())
	}
}
