package sales

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
)

func setupSalesTestConfig(t *testing.T) config.Config {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "sales.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	schema := `
CREATE TABLE "SalesPromptOverride" ("workspaceId" TEXT NOT NULL, "promptId" TEXT NOT NULL, "prompt" TEXT NOT NULL, "updatedAt" TEXT NOT NULL, PRIMARY KEY ("workspaceId", "promptId"));
CREATE TABLE "SalesReferenceScript" (
  "id" TEXT NOT NULL PRIMARY KEY, "workspaceId" TEXT NOT NULL, "title" TEXT NOT NULL,
  "depthVideoUrl" TEXT NOT NULL DEFAULT '', "depthTaskId" TEXT NOT NULL DEFAULT '', "depthOperationId" TEXT NOT NULL DEFAULT '',
  "videoUrl" TEXT NOT NULL DEFAULT '', "videoHash" TEXT NOT NULL DEFAULT '', "durationSec" REAL NOT NULL DEFAULT 0,
  "format" TEXT NOT NULL DEFAULT 'presenter', "voiceMode" TEXT NOT NULL DEFAULT 'speech', "status" TEXT NOT NULL DEFAULT 'draft',
  "scriptJson" TEXT NOT NULL, "model" TEXT NOT NULL DEFAULT '', "promptVersion" TEXT NOT NULL DEFAULT '',
  "version" INTEGER NOT NULL DEFAULT 1, "useCount" INTEGER NOT NULL DEFAULT 0, "lastUsedAt" TEXT NOT NULL DEFAULT '',
  "createdAt" TEXT NOT NULL, "updatedAt" TEXT NOT NULL
);
CREATE TABLE "SalesProductionPreset" (
  "id" TEXT NOT NULL PRIMARY KEY, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'all', "configJson" TEXT NOT NULL, "isDefault" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TEXT NOT NULL, "updatedAt" TEXT NOT NULL
);
CREATE TABLE "SalesProduct" (
  "id" TEXT NOT NULL PRIMARY KEY, "workspaceId" TEXT NOT NULL, "title" TEXT NOT NULL DEFAULT '',
  "productUrl" TEXT NOT NULL DEFAULT '', "collectedProductUrl" TEXT NOT NULL DEFAULT '',
  "platform" TEXT NOT NULL DEFAULT '', "sku" TEXT NOT NULL DEFAULT '', "brand" TEXT NOT NULL DEFAULT '',
  "category" TEXT NOT NULL DEFAULT 'other', "categorySource" TEXT NOT NULL DEFAULT 'auto',
  "audience" TEXT NOT NULL DEFAULT 'unknown', "audienceSource" TEXT NOT NULL DEFAULT 'auto',
  "coverUrl" TEXT NOT NULL DEFAULT '', "imageCount" INTEGER NOT NULL DEFAULT 0,
  "selectedImageCount" INTEGER NOT NULL DEFAULT 0, "hasSummary" INTEGER NOT NULL DEFAULT 0,
  "outputCount" INTEGER NOT NULL DEFAULT 0, "draftJson" TEXT NOT NULL DEFAULT '{}',
  "lastOpenedAt" TEXT NOT NULL DEFAULT '', "createdAt" TEXT NOT NULL, "updatedAt" TEXT NOT NULL
);
CREATE TABLE "AvatarCharacter" (
  "id" TEXT NOT NULL PRIMARY KEY, "workspaceId" TEXT NOT NULL DEFAULT 'legacy', "name" TEXT NOT NULL,
  "status" INTEGER NOT NULL DEFAULT 1, "coverUrl" TEXT NOT NULL DEFAULT '', "description" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "AvatarCharacter" ("id","workspaceId","name","status","coverUrl","description") VALUES ('avatar_preset_01','legacy','车模·若曦',1,'/a.jpg','带货主播');
CREATE TABLE "AvatarVoice" (
  "id" TEXT NOT NULL PRIMARY KEY, "workspaceId" TEXT NOT NULL DEFAULT 'legacy', "name" TEXT NOT NULL,
  "status" INTEGER NOT NULL DEFAULT 1, "voiceId" TEXT NOT NULL DEFAULT '', "gender" TEXT NOT NULL DEFAULT 'female',
  "tags" TEXT NOT NULL DEFAULT '[]', "sampleAudioUrl" TEXT NOT NULL DEFAULT '', "promptText" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "AvatarVoice" ("id","workspaceId","name","status","voiceId","gender","tags") VALUES ('voice_preset_01','legacy','稳重男声',1,'v1','male','["沉稳"]');`
	if _, err := db.Exec(schema); err != nil {
		t.Fatal(err)
	}
	return config.Config{DatabaseURL: "file:" + dbPath}
}

func TestReferenceScriptsLifecycleAndCache(t *testing.T) {
	cfg := setupStudioCatalogTestConfig(t)
	mux := http.NewServeMux()
	mux.Handle("GET /api/sales/scripts", Scripts(cfg))
	mux.Handle("POST /api/sales/scripts", Scripts(cfg))
	mux.Handle("PATCH /api/sales/scripts/{id}", ScriptByID(cfg))
	mux.Handle("DELETE /api/sales/scripts/{id}", ScriptByID(cfg))
	mux.Handle("GET /api/sales/studio-assets", StudioAssets(cfg))
	mux.Handle("GET /api/sales/presets", Presets(cfg))
	mux.Handle("POST /api/sales/presets", Presets(cfg))
	mux.Handle("DELETE /api/sales/presets/{id}", PresetByID(cfg))

	videoURI := "data:video/mp4;base64,AA=="
	sum := sha256.Sum256([]byte(videoURI))
	videoHash := hex.EncodeToString(sum[:16])

	createBody := `{"title":"一镜到底开衫展示","videoUrl":"/storage/local/ref.mp4","videoHash":"` + videoHash + `","status":"draft","model":"gemini-2.5-pro","promptVersion":"` + scriptPromptVersion() + `","script":` + validScript + `}`
	req := httptest.NewRequest(http.MethodPost, "/api/sales/scripts", strings.NewReader(createBody))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("create failed: %d %s", rec.Code, rec.Body.String())
	}
	var created struct {
		Item storedReferenceScript `json:"item"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &created)
	if created.Item.ID == "" || created.Item.Version != 1 || created.Item.Status != "draft" || created.Item.VideoURL != "/storage/local/ref.mp4" {
		t.Fatalf("unexpected created script: %+v", created.Item)
	}

	// Verify script-analysis reuses cached result for identical videoHash + promptVersion without upstream model call
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	modelCalled := false
	analysisRec := httptest.NewRecorder()
	analysisReq := httptest.NewRequest(http.MethodPost, "/api/sales/script-analysis", strings.NewReader(`{"videoUrl":"/storage/local/ref.mp4","model":"gemini-2.5-pro","textProtocol":"gemini"}`))
	scriptAnalysisHandler(cfg, func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
		modelCalled = true
		return 200, nil, nil
	}, func(string, string) (string, error) { return videoURI, nil }).ServeHTTP(analysisRec, analysisReq)
	if analysisRec.Code != 200 || modelCalled {
		t.Fatalf("expected cached script analysis without upstream call: code=%d called=%v body=%s", analysisRec.Code, modelCalled, analysisRec.Body.String())
	}

	// Patch status to verified, edit script to bump version, and record usage
	updatedScript := strings.Replace(validScript, "起身转身", "转身展示衣摆与袖口", 1)
	patchReq := httptest.NewRequest(http.MethodPatch, "/api/sales/scripts/"+created.Item.ID, strings.NewReader(`{"status":"verified","recordUse":true,"script":`+updatedScript+`}`))
	patchRec := httptest.NewRecorder()
	mux.ServeHTTP(patchRec, patchReq)
	if patchRec.Code != 200 {
		t.Fatalf("patch failed: %d %s", patchRec.Code, patchRec.Body.String())
	}
	var patched struct {
		Item storedReferenceScript `json:"item"`
	}
	_ = json.Unmarshal(patchRec.Body.Bytes(), &patched)
	if patched.Item.Status != "verified" || patched.Item.Version != 2 || patched.Item.UseCount != 1 {
		t.Fatalf("expected verified v2 useCount=1: %+v", patched.Item)
	}

	// An empty workspace never inherits legacy presets or built-in materials.
	assetsRec := httptest.NewRecorder()
	mux.ServeHTTP(assetsRec, httptest.NewRequest(http.MethodGet, "/api/sales/studio-assets", nil))
	if assetsRec.Code != 200 || strings.Contains(assetsRec.Body.String(), "avatar_preset_01") || strings.Contains(assetsRec.Body.String(), "voice_preset_01") {
		t.Fatalf("expected workspace assets without presets: %d %s", assetsRec.Code, assetsRec.Body.String())
	}

	// Presets save & list
	presetRec := httptest.NewRecorder()
	mux.ServeHTTP(presetRec, httptest.NewRequest(http.MethodPost, "/api/sales/presets", strings.NewReader(`{"name":"女装真人日常","category":"fashion","isDefault":true,"config":{"aspectRatio":"9:16","voiceStrategy":"follow_script"}}`)))
	if presetRec.Code != 200 {
		t.Fatalf("preset save failed: %d %s", presetRec.Code, presetRec.Body.String())
	}
	listPresetsRec := httptest.NewRecorder()
	mux.ServeHTTP(listPresetsRec, httptest.NewRequest(http.MethodGet, "/api/sales/presets", nil))
	if listPresetsRec.Code != 200 || !strings.Contains(listPresetsRec.Body.String(), "女装真人日常") {
		t.Fatalf("preset list failed: %d %s", listPresetsRec.Code, listPresetsRec.Body.String())
	}
}
