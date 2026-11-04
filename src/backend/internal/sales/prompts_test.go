package sales

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func promptTestMux(cfg config.Config) *http.ServeMux {
	mux := http.NewServeMux()
	mux.Handle("GET /api/sales/prompts", Prompts(cfg))
	mux.Handle("PUT /api/sales/prompts/{id}", PromptByID(cfg))
	mux.Handle("GET /api/sales/script-analysis/prompt", ScriptAnalysisPrompt(cfg))
	return mux
}

func requestPrompt(mux http.Handler, method, path, body, workspace string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r = r.WithContext(httpx.WithWorkspace(r.Context(), workspace))
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	return w
}

func promptUpdateJSON(text *string, version string) string {
	body, _ := json.Marshal(map[string]any{"prompt": text, "expectedVersion": version})
	return string(body)
}

func parsePromptList(t *testing.T, rec *httptest.ResponseRecorder) []salesPrompt {
	t.Helper()
	if rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("workspace prompt response must not be cached")
	}
	var result struct {
		Prompts []salesPrompt `json:"prompts"`
	}
	if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &result) != nil || len(result.Prompts) != 11 {
		t.Fatalf("invalid prompt list: %d %s", rec.Code, rec.Body.String())
	}
	return result.Prompts
}

func TestPromptsPersistIsolateConflictAndReset(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	mux := promptTestMux(cfg)
	defaults := parsePromptList(t, requestPrompt(mux, "GET", "/api/sales/prompts", "", "first"))
	for _, item := range defaults {
		if item.Customized || !item.Configured || item.Prompt != item.DefaultPrompt || item.DefaultPrompt == "" || item.Version == "" {
			t.Fatalf("invalid default: %+v", item)
		}
	}
	original := defaults[1]
	custom := original.DefaultPrompt + "\n保持自然拍摄节奏。"
	updated := requestPrompt(mux, "PUT", "/api/sales/prompts/"+original.ID, promptUpdateJSON(&custom, original.Version), "first")
	if updated.Code != 200 {
		t.Fatal(updated.Code, updated.Body.String())
	}
	// A fresh handler reloads persisted text; another workspace retains the default.
	stored := parsePromptList(t, requestPrompt(promptTestMux(cfg), "GET", "/api/sales/prompts", "", "first"))[1]
	if stored.Prompt != custom || !stored.Customized || stored.Version == original.Version || stored.DefaultPrompt != original.DefaultPrompt {
		t.Fatalf("save not reflected: %+v", stored)
	}
	other := parsePromptList(t, requestPrompt(mux, "GET", "/api/sales/prompts", "", "second"))[1]
	if other.Prompt != original.Prompt || other.Customized {
		t.Fatal("workspace leaked")
	}
	copy := requestPrompt(mux, "GET", "/api/sales/script-analysis/prompt", "", "first")
	if copy.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("copied analysis prompt must not be cached")
	}
	var copied struct {
		Prompt  string `json:"prompt"`
		Version string `json:"promptVersion"`
	}
	if copy.Code != 200 || json.Unmarshal(copy.Body.Bytes(), &copied) != nil || copied.Prompt != stored.Prompt || copied.Version != stored.Version {
		t.Fatal("external copy did not use saved prompt", copy.Body.String())
	}
	stale := requestPrompt(mux, "PUT", "/api/sales/prompts/"+original.ID, promptUpdateJSON(nil, original.Version), "first")
	if stale.Code != 409 {
		t.Fatal("lost update accepted", stale.Code)
	}
	reset := requestPrompt(mux, "PUT", "/api/sales/prompts/"+original.ID, promptUpdateJSON(nil, stored.Version), "first")
	if reset.Code != 200 {
		t.Fatal(reset.Code, reset.Body.String())
	}
	resetItem := parsePromptList(t, requestPrompt(mux, "GET", "/api/sales/prompts", "", "first"))[1]
	if resetItem.Customized || resetItem.Configured || resetItem.Version == original.Version || resetItem.Prompt != "" {
		t.Fatal("reset failed")
	}
}

func TestPromptsRejectInvalidUpdatesAndStorageFailure(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	mux := promptTestMux(cfg)
	defaults := parsePromptList(t, requestPrompt(mux, "GET", "/api/sales/prompts", "", "local"))
	for _, body := range []string{`{}`, `{"expectedVersion":"x"}`, `{"prompt":42,"expectedVersion":"x"}`, `{"prompt":"","expectedVersion":"x"}`, `{"prompt":"   ","expectedVersion":"x"}`, `{"prompt":null}`, `{"prompt":null,"expectedVersion":"x"} {}`} {
		if rec := requestPrompt(mux, "PUT", "/api/sales/prompts/summary", body, "local"); rec.Code != 400 {
			t.Errorf("accepted %s: %d", body, rec.Code)
		}
	}
	oversize := strings.Repeat("字", 60001)
	if rec := requestPrompt(mux, "PUT", "/api/sales/prompts/summary", promptUpdateJSON(&oversize, defaults[0].Version), "local"); rec.Code != 400 {
		t.Fatal("accepted oversized prompt")
	}
	if rec := requestPrompt(mux, "PUT", "/api/sales/prompts/unknown", promptUpdateJSON(nil, "x"), "local"); rec.Code != 404 {
		t.Fatal("accepted unknown prompt")
	}
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`DROP TABLE "SalesPromptOverride"`); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/api/sales/prompts", "/api/sales/script-analysis/prompt"} {
		if rec := requestPrompt(mux, "GET", path, "", "local"); rec.Code != 500 {
			t.Fatal("silently fell back after storage failure", rec.Code)
		}
	}
	if rec := requestPrompt(mux, "PUT", "/api/sales/prompts/summary", promptUpdateJSON(nil, defaults[0].Version), "local"); rec.Code != 500 {
		t.Fatal("silently dropped save", rec.Code)
	}
}

func TestPromptSavingBuiltInTextPreservesContentAcrossTemplateChanges(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	mux := promptTestMux(cfg)
	original := parsePromptList(t, requestPrompt(mux, "GET", "/api/sales/prompts", "", "local"))[0]
	custom := original.DefaultPrompt + "\n保留真实商品信息。"
	if rec := requestPrompt(mux, "PUT", "/api/sales/prompts/summary", promptUpdateJSON(&custom, original.Version), "local"); rec.Code != 200 {
		t.Fatal(rec.Code, rec.Body.String())
	}
	current := parsePromptList(t, requestPrompt(mux, "GET", "/api/sales/prompts", "", "local"))[0]
	if rec := requestPrompt(mux, "PUT", "/api/sales/prompts/summary", promptUpdateJSON(&original.DefaultPrompt, current.Version), "local"); rec.Code != 200 {
		t.Fatal(rec.Code, rec.Body.String())
	}
	stored, err := loadSalesPrompt(context.Background(), cfg, "local", "summary")
	if err != nil || stored.Prompt != original.DefaultPrompt || stored.Customized {
		t.Fatal("saving the official text must follow future updates", err)
	}
	updated, _ := findPromptDefinition("summary")
	updated.text = "升级后的模板"
	next := "旧页面的编辑"
	if _, err := saveSalesPrompt(t.Context(), cfg, "local", updated, &next, stored.Version); !errors.Is(err, errPromptConflict) {
		t.Fatal("old editor overwrote a template update", err)
	}
}

func TestPromptsConcurrentEditorsCannotOverwriteEachOther(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	d, _ := findPromptDefinition("summary")
	version := d.resolve(nil).Version
	var wg sync.WaitGroup
	statuses := make(chan int, 2)
	for _, text := range []string{"第一份规则", "另一份规则"} {
		wg.Add(1)
		go func(text string) {
			defer wg.Done()
			statuses <- requestPrompt(promptTestMux(cfg), "PUT", "/api/sales/prompts/summary", promptUpdateJSON(&text, version), "local").Code
		}(text)
	}
	wg.Wait()
	close(statuses)
	counts := map[int]int{}
	for status := range statuses {
		counts[status]++
	}
	if counts[200] != 1 || counts[409] != 1 {
		t.Fatal("concurrent updates", counts)
	}
	if _, err := loadSalesPrompt(context.Background(), cfg, "local", "summary"); err != nil {
		t.Fatal(err)
	}
}
