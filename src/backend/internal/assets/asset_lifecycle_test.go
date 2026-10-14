package assets

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func TestAssetLifecycleRejectsUnknownType(t *testing.T) {
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/catalog/assets/video/asset-1/publish", nil)
	request.SetPathValue("type", "video")
	request.SetPathValue("id", "asset-1")
	assetLifecycleHandler(config.Config{}, "publish").ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "资产类型或操作不正确") {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
}

func TestAssetLifecycleDisableUsesReason(t *testing.T) {
	path := filepath.Join(t.TempDir(), "lifecycle.db")
	db, err := database.OpenWrite(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "PromptAssetRegistry" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "assetType" TEXT NOT NULL, "sourceAssetId" TEXT NOT NULL,
		"status" TEXT NOT NULL, "version" INTEGER NOT NULL, "provenance" TEXT NOT NULL,
		"sourceRef" TEXT, "qualityScore" REAL, "confidence" REAL, "publishedAt" TEXT, "disabledReason" TEXT,
		"createdAt" TEXT NOT NULL, "updatedAt" TEXT NOT NULL,
		UNIQUE ("workspaceId", "assetType", "sourceAssetId")
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "PromptAssetRegistry" (
		"id","workspaceId","assetType","sourceAssetId","status","version","provenance","createdAt","updatedAt"
	) VALUES ('reg','local','persona','asset-1','published',1,'manual','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	_ = db.Close()
	cfg := config.Config{DatabaseURL: "file:" + path}
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/catalog/assets/persona/asset-1/disable", strings.NewReader(`{"reason":"不再使用"}`))
	request.SetPathValue("type", "persona")
	request.SetPathValue("id", "asset-1")
	assetLifecycleHandler(cfg, "disable").ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"status":"disabled"`) || !strings.Contains(response.Body.String(), "不再使用") {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
	response = httptest.NewRecorder()
	request = httptest.NewRequest(http.MethodPost, "/api/catalog/assets/persona/asset-1/disable", strings.NewReader(`{"reason":1}`))
	request.SetPathValue("type", "persona")
	request.SetPathValue("id", "asset-1")
	assetLifecycleHandler(cfg, "disable").ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("invalid reason status %d", response.Code)
	}
}
