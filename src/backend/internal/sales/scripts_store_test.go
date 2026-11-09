package sales

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
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
CREATE TABLE "SalesPromptOverride" ("workspaceId" TEXT NOT NULL, "promptId" TEXT NOT NULL, "prompt" TEXT NOT NULL, "updatedAt" TEXT NOT NULL, "templateVersion" TEXT NOT NULL DEFAULT '', PRIMARY KEY ("workspaceId", "promptId"));
CREATE TABLE "SalesReferenceScript" (
  "id" TEXT NOT NULL PRIMARY KEY, "workspaceId" TEXT NOT NULL, "title" TEXT NOT NULL,
  "depthVideoUrl" TEXT NOT NULL DEFAULT '', "depthTaskId" TEXT NOT NULL DEFAULT '', "depthOperationId" TEXT NOT NULL DEFAULT '',
  "videoUrl" TEXT NOT NULL DEFAULT '', "videoHash" TEXT NOT NULL DEFAULT '', "durationSec" REAL NOT NULL DEFAULT 0,
  "format" TEXT NOT NULL DEFAULT 'presenter', "voiceMode" TEXT NOT NULL DEFAULT 'speech', "status" TEXT NOT NULL DEFAULT 'draft',
  "analysisKey" TEXT NOT NULL DEFAULT '', "scriptJson" TEXT NOT NULL, "model" TEXT NOT NULL DEFAULT '', "promptVersion" TEXT NOT NULL DEFAULT '',
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
	seedPromptTemplates(t, cfg, "local")
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

	// A manually saved or legacy script has no execution fingerprint.
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	calls := 0
	handler := scriptAnalysisHandler(cfg, func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
		calls++
		return 200, scriptCompletion(validScript, "stop"), nil
	}, func(string, string) (string, error) { return videoURI, nil })
	for i, effort := range []string{"low", "low", "high", "high"} {
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/sales/script-analysis", strings.NewReader(`{"videoUrl":"/storage/local/ref.mp4","model":"gemini-2.5-pro","textProtocol":"gemini","reasoningEffort":"`+effort+`"}`)))
		if rec.Code != 200 || calls != 1+i/2 {
			t.Fatalf("analysis %d calls=%d: %s", i, calls, rec.Body.String())
		}
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

func TestConcurrentScriptEditsRetainLatestVersion(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	var script map[string]any
	json.Unmarshal([]byte(validScript), &script)
	saved, err := persistAnalyzedScript(cfg, "local", "", "hash", "model", "prompt", "route", script, false)
	if err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for i, title := range []string{"已确认新版本", "另一个标签的旧稿"} {
		rec := httptest.NewRecorder()
		patchReferenceScript(rec, httptest.NewRequest("PATCH", "/", strings.NewReader(`{"title":"`+title+`","expectedVersion":1}`)), db, "local", saved.ID)
		if i == 0 && rec.Code != 200 || i == 1 && rec.Code != 409 {
			t.Fatal(rec.Code, rec.Body.String())
		}
	}
	current, err := readReferenceScriptByID(t.Context(), db, "local", saved.ID)
	if err != nil || current.Version != 2 || current.Title != "已确认新版本" {
		t.Fatal(current.Title, current.Version, err)
	}
}

func TestScriptCompletionRejectsPerformanceDataThatWouldBeLost(t *testing.T) {
	for _, field := range []string{"expression", "transition"} {
		for _, value := range []any{map[string]any{"eyes": "先抬眼再垂眼"}, []string{"浅笑", "回落"}, true, 42, strings.Repeat("字", 601)} {
			var script map[string]any
			if err := json.Unmarshal([]byte(validScript), &script); err != nil {
				t.Fatal(err)
			}
			beat := script["shots"].([]any)[0].(map[string]any)["beats"].([]any)[0].(map[string]any)
			beat[field] = value
			raw, _ := json.Marshal(script)
			if _, err := parseScriptCompletion(scriptCompletion(string(raw), "stop")); err == nil {
				t.Fatalf("accepted malformed %s: %T", field, value)
			}
		}
	}
	var script map[string]any
	_ = json.Unmarshal([]byte(validScript), &script)
	beat := script["shots"].([]any)[0].(map[string]any)["beats"].([]any)[0].(map[string]any)
	beat["expression"], beat["transition"] = strings.Repeat("表", 600), strings.Repeat("接", 400)
	raw, _ := json.Marshal(script)
	parsed, err := parseScriptCompletion(scriptCompletion(string(raw), "stop"))
	if err != nil {
		t.Fatal("valid performance data rejected", err)
	}
	actual := parsed["shots"].([]any)[0].(map[string]any)["beats"].([]any)[0].(map[string]any)
	if actual["expression"] != beat["expression"] || actual["transition"] != beat["transition"] {
		t.Fatal("performance data was truncated")
	}
}

func TestInvalidCachedPerformanceIsReplacedWithoutOverwritingHistory(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	var script map[string]any
	_ = json.Unmarshal([]byte(validScript), &script)
	first, err := persistAnalyzedScript(cfg, "local", "", "hash", "model", "prompt", "route", script, false)
	if err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	// Reproduce a historical response previously accepted as the current-version cache.
	broken := strings.Replace(validScript, `"action":"坐姿看镜头"`, `"action":"坐姿看镜头","expression":{"eyes":"抬眼"}`, 1)
	if _, err := db.Exec(`UPDATE "SalesReferenceScript" SET "scriptJson"=?,"status"='verified' WHERE "id"=?`, broken, first.ID); err != nil {
		t.Fatal(err)
	}
	if cached := lookupCachedScriptAnalysis(context.Background(), cfg.SQLiteFile(), "local", "hash", "prompt", "route"); cached != nil {
		t.Fatal("invalid performance cache was reused")
	}
	second, err := persistAnalyzedScript(cfg, "local", "", "hash", "model", "prompt", "route", script, false)
	if err != nil || second.ID == first.ID {
		t.Fatal("replacement did not get its own saved row", second.ID, err)
	}
	if _, err := validateScriptObject(second.Script); err != nil {
		t.Fatal("replacement content is invalid", err)
	}
	if cached := lookupCachedScriptAnalysis(context.Background(), cfg.SQLiteFile(), "local", "hash", "prompt", "route"); cached == nil || cached.ID != second.ID {
		t.Fatal("historical invalid cache hid the valid replacement", cached)
	}
	var preserved, status string
	if err := db.QueryRow(`SELECT "scriptJson","status" FROM "SalesReferenceScript" WHERE "id"=?`, first.ID).Scan(&preserved, &status); err != nil || preserved != broken || status != "verified" {
		t.Fatal("historical confirmed script was overwritten", err)
	}
}

func TestScriptSavePreservesLinkedVideo(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	cache := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", cache)
	rel := "local/azhuo/refs/sales-script/test/source.mp4"
	file := filepath.Join(cache, rel)
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, []byte("reference fixture"), 0o600); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`CREATE TRIGGER reject_script BEFORE INSERT ON "SalesReferenceScript" BEGIN SELECT RAISE(ABORT,'test write failure'); END`); err != nil {
		t.Fatal(err)
	}
	requestBody := `{"videoUrl":"/storage/` + rel + `","script":` + validScript + `}`
	rec := httptest.NewRecorder()
	Scripts(cfg).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/sales/scripts", strings.NewReader(requestBody)))
	if rec.Code != 500 {
		t.Fatalf("expected failure: %d %s", rec.Code, rec.Body.String())
	}
	if _, err := os.Stat(file); err != nil {
		t.Fatalf("failed save removed retry source: %v", err)
	}
	if _, err := db.Exec(`DROP TRIGGER reject_script`); err != nil {
		t.Fatal(err)
	}
	rec = httptest.NewRecorder()
	Scripts(cfg).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/sales/scripts", strings.NewReader(requestBody)))
	if rec.Code != 200 {
		t.Fatalf("retry failed: %d %s", rec.Code, rec.Body.String())
	}
	if _, err := os.Stat(file); err != nil {
		t.Fatalf("successful save must retain the linked source: %v", err)
	}
}

// Delay the request body until another operation has changed the record that
// PATCH already read, so the interleaving is deterministic without goroutine sleeps.
type interleavedScriptBody struct {
	reader io.Reader
	before func()
}

func (body *interleavedScriptBody) Read(data []byte) (int, error) {
	if body.before != nil {
		before := body.before
		body.before = nil
		before()
	}
	return body.reader.Read(data)
}

func TestScriptUsagePreservesConcurrentEdits(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	create := httptest.NewRecorder()
	Scripts(cfg).ServeHTTP(create, httptest.NewRequest(http.MethodPost, "/api/sales/scripts", strings.NewReader(`{"id":"concurrent","title":"原脚本","script":`+validScript+`}`)))
	if create.Code != 200 {
		t.Fatal(create.Body.String())
	}
	updatedScript := strings.Replace(validScript, "起身转身", "展示袖口", 1)
	body := &interleavedScriptBody{reader: strings.NewReader(`{"recordUse":true}`), before: func() {
		_, err := db.Exec(`UPDATE "SalesReferenceScript" SET "title"='已重新归类',"status"='verified',"scriptJson"=?,"version"=2,"useCount"=3 WHERE "id"='concurrent'`, updatedScript)
		if err != nil {
			t.Fatal(err)
		}
	}}
	rec := httptest.NewRecorder()
	patchReferenceScript(rec, httptest.NewRequest(http.MethodPatch, "/api/sales/scripts/concurrent", body), db, "local", "concurrent")
	var response struct {
		Item storedReferenceScript `json:"item"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &response)
	raw, _ := json.Marshal(response.Item.Script)
	if rec.Code != 200 || response.Item.Title != "已重新归类" || response.Item.Status != "verified" || response.Item.Version != 2 || response.Item.UseCount != 4 || !strings.Contains(string(raw), "展示袖口") {
		t.Fatalf("recording use overwrote a concurrent edit: %d %s", rec.Code, rec.Body.String())
	}
}

func TestScriptEditsPreserveConcurrentUsage(t *testing.T) {
	for _, recordUse := range []bool{false, true} {
		t.Run(map[bool]string{false: "edit", true: "edit-and-use"}[recordUse], func(t *testing.T) {
			cfg := setupSalesTestConfig(t)
			db, err := sql.Open("sqlite", cfg.SQLiteFile())
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			create := httptest.NewRecorder()
			Scripts(cfg).ServeHTTP(create, httptest.NewRequest(http.MethodPost, "/api/sales/scripts", strings.NewReader(`{"id":"concurrent","script":`+validScript+`}`)))
			if create.Code != 200 {
				t.Fatal(create.Body.String())
			}
			var script map[string]any
			_ = json.Unmarshal([]byte(validScript), &script)
			raw, _ := json.Marshal(map[string]any{"script": script, "recordUse": recordUse})
			body := &interleavedScriptBody{reader: strings.NewReader(string(raw)), before: func() {
				if _, err := db.Exec(`UPDATE "SalesReferenceScript" SET "useCount"=3,"lastUsedAt"='concurrent-use' WHERE "id"='concurrent'`); err != nil {
					t.Fatal(err)
				}
			}}
			rec := httptest.NewRecorder()
			patchReferenceScript(rec, httptest.NewRequest(http.MethodPatch, "/api/sales/scripts/concurrent", body), db, "local", "concurrent")
			var response struct {
				Item storedReferenceScript `json:"item"`
			}
			_ = json.Unmarshal(rec.Body.Bytes(), &response)
			wantCount := 3
			if recordUse {
				wantCount++
			}
			if rec.Code != 200 || response.Item.UseCount != wantCount || response.Item.Version != 2 || (!recordUse && response.Item.LastUsedAt != "concurrent-use") {
				t.Fatalf("editing reset concurrent use statistics: %d %s", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestScriptUsageReportsConcurrentDeletion(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	create := httptest.NewRecorder()
	Scripts(cfg).ServeHTTP(create, httptest.NewRequest(http.MethodPost, "/api/sales/scripts", strings.NewReader(`{"id":"concurrent","script":`+validScript+`}`)))
	if create.Code != 200 {
		t.Fatal(create.Body.String())
	}
	body := &interleavedScriptBody{reader: strings.NewReader(`{"recordUse":true}`), before: func() {
		if _, err := db.Exec(`DELETE FROM "SalesReferenceScript" WHERE "id"='concurrent'`); err != nil {
			t.Fatal(err)
		}
	}}
	rec := httptest.NewRecorder()
	patchReferenceScript(rec, httptest.NewRequest(http.MethodPatch, "/api/sales/scripts/concurrent", body), db, "local", "concurrent")
	if rec.Code != 404 {
		t.Fatalf("concurrent deletion must not return an empty successful record: %d %s", rec.Code, rec.Body.String())
	}
}
