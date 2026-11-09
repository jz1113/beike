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
	"beike.local/cloud/src/backend/internal/gateway"
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

func TestEditorAdaptContractRoundTripsExpressionAndTransition(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	cfg := setupPromptExecutionTestConfig(t)
	items := parsePromptList(t, requestPrompt(promptTestMux(cfg), "GET", "/api/sales/prompts", "", "local"))
	var published salesPrompt
	for _, item := range items {
		if item.ID == "plan-adapt" {
			published = item
		}
	}
	_, after, found := strings.Cut(published.Prompt, "```json\n")
	example, _, closed := strings.Cut(after, "```")
	if !found || !closed {
		t.Fatal("prompt editor must expose the adaptation JSON contract")
	}
	var contract struct {
		Beats []map[string]any `json:"beats"`
	}
	if err := json.Unmarshal([]byte(example), &contract); err != nil || len(contract.Beats) != 1 {
		t.Fatalf("editor contract is not a valid single-beat example: %v", err)
	}
	for _, field := range []string{"expression", "transition"} {
		if value, ok := contract.Beats[0][field].(string); !ok || strings.TrimSpace(value) == "" {
			t.Fatalf("editor contract omits independent %s", field)
		}
	}
	rec := httptest.NewRecorder()
	planAdaptHandler(cfg, func(_ context.Context, req gateway.TextRequest, _ bool) (int, map[string]any, error) {
		assertRequestPrompt(t, req, published.Prompt)
		return 200, scriptCompletion(example, "stop"), nil
	}).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/sales/plan-adapt", strings.NewReader(`{"productName":"商品","model":"gpt-4o","presentationMode":"clean_visual","voiceMode":"none","beats":[{"index":0,"start":0,"end":3,"refAction":"双手先交叠，再放松回落","expression":"先看手，再抬眼浅笑","transition":"笑意回落，保持末姿势"}]}`)))
	var result struct {
		Beats []map[string]any `json:"beats"`
	}
	if rec.Code != http.StatusOK || json.Unmarshal(rec.Body.Bytes(), &result) != nil || len(result.Beats) != 1 {
		t.Fatalf("editor contract was rejected by adaptation: %d %s", rec.Code, rec.Body.String())
	}
	for field, want := range map[string]string{"action": "双手先交叠，再放松回落", "expression": "先看手，再抬眼浅笑", "transition": "笑意回落，保持末姿势"} {
		if result.Beats[0][field] != want {
			t.Fatalf("model following editor contract replaces reference %s in API response", field)
		}
	}
}

// Seed editable overrides for tests that mutate their stored text directly.
func seedPromptTemplates(t *testing.T, cfg config.Config, workspace string) {
	t.Helper()
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, d := range promptDefinitions() {
		if _, err := db.Exec(`INSERT INTO "SalesPromptOverride" ("workspaceId","promptId","prompt","updatedAt","templateVersion") VALUES (?,?,?,'test',?) ON CONFLICT("workspaceId","promptId") DO NOTHING`, workspace, d.id, d.text, d.resolve(nil).Version); err != nil {
			t.Fatal(err)
		}
	}
}

func setupPromptExecutionTestConfig(t *testing.T) config.Config {
	t.Helper()
	cfg := setupSalesTestConfig(t)
	seedPromptTemplates(t, cfg, "local")
	return cfg
}

func TestGridPromptsReplaceSingleViewPromptsAndIgnoreTheirOverrides(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	retired := []string{"script-normalize", "persona-face", "persona-side", "persona-front", "scene-left", "scene-right", "scene-reverse"}
	for _, id := range retired {
		if _, err := db.Exec(`INSERT INTO "SalesPromptOverride" ("workspaceId","promptId","prompt","updatedAt") VALUES (?,?,?,?)`, "local", id, "旧的单图规则：不要拼图", "old"); err != nil {
			t.Fatal(err)
		}
	}
	items := parsePromptList(t, requestPrompt(promptTestMux(cfg), "GET", "/api/sales/prompts", "", "local"))
	want := []string{"summary", "script-analysis", "plan-adapt", "spoken-copy", "spoken-review", "persona-grid", "scene-grid", "final-video", "final-video-depth"}
	for i, id := range want {
		if items[i].ID != id || items[i].Customized || strings.Contains(items[i].Prompt, "旧的单图规则") {
			t.Fatalf("unexpected active prompt: %+v", items[i])
		}
	}
	for _, id := range retired {
		if _, found := findPromptDefinition(id); found {
			t.Fatal("retired prompt still registered", id)
		}
		if _, err := loadSalesPrompt(context.Background(), cfg, "local", id); err == nil {
			t.Fatal("retired override still loadable", id)
		}
		if rec := requestPrompt(promptTestMux(cfg), "PUT", "/api/sales/prompts/"+id, promptUpdateJSON(nil, "old"), "local"); rec.Code != 404 {
			t.Fatal("retired prompt can still be saved", id, rec.Code)
		}
	}
	// Every current workflow keeps independent editable content, including both new grids.
	for _, item := range items {
		custom := item.DefaultPrompt + "\n保留用户补充的当前规则。"
		if rec := requestPrompt(promptTestMux(cfg), "PUT", "/api/sales/prompts/"+item.ID, promptUpdateJSON(&custom, item.Version), "local"); rec.Code != 200 {
			t.Fatal("current prompt no longer editable", item.ID, rec.Code, rec.Body.String())
		}
		loaded, err := loadSalesPrompt(context.Background(), cfg, "local", item.ID)
		if err != nil || loaded.Prompt != custom || !loaded.Customized {
			t.Fatal("current prompt was not preserved", item.ID, err)
		}
	}
}

func TestGridPromptOrderMatchesCropSlots(t *testing.T) {
	for _, item := range []struct {
		id, ratio string
		labels    []string
	}{
		{"persona-grid", "1 行 × 4 列", []string{"正面全身", "侧面全身", "背面全身", "脸部特写"}},
		{"scene-grid", "4:3", []string{"左侧视角", "右侧视角", "反向视角", "正面广角", "左侧广角", "右侧广角", "反向左侧", "反向右侧", "局部细节"}},
	} {
		d, found := findPromptDefinition(item.id)
		if !found {
			t.Fatal("grid prompt missing", item.id)
		}
		rules := []string{"一次只生成 1 张", item.ratio}
		if item.id == "scene-grid" {
			rules = append(rules, "3 行 × 3 列", "九格等宽等高", "格间间隙", "三分之一和三分之二", "只输出这一张九宫格")
		} else {
			rules = append(rules, "四格等宽", "四分之三", "人物不跨格")
		}
		for _, rule := range rules {
			if !strings.Contains(d.text, rule) {
				t.Errorf("%s missing crop contract %q", item.id, rule)
			}
		}
		if strings.Contains(d.text, "不要拼图") {
			t.Fatal("grid prompt retained conflicting single-view rule", item.id)
		}
		previous := -1
		for _, label := range item.labels {
			next := strings.Index(d.text, "（"+label+"）")
			if next <= previous {
				t.Fatal("crop-slot order differs from prompt", item.id, label)
			}
			previous = next
		}
	}
}

func TestPersonaGridKeepsOriginalMakeupAndDoesNotInventPerformance(t *testing.T) {
	d, found := findPromptDefinition("persona-grid")
	if !found {
		t.Fatal("persona grid prompt missing")
	}
	for _, rule := range []string{"以参考图锁定同一张脸", "妆容依照参考图与年龄", "自然神态", "自然融合", "光影自然匹配", "自然肤质和纹理", "标准清晰"} {
		if !strings.Contains(d.text, rule) {
			t.Errorf("persona grid lost original-appearance rule %q", rule)
		}
	}
}

func disablePrompt(t *testing.T, cfg config.Config, workspace, id string) {
	t.Helper()
	d, _ := findPromptDefinition(id)
	current, err := loadSalesPrompt(t.Context(), cfg, workspace, id)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = saveSalesPrompt(t.Context(), cfg, workspace, d, nil, current.Version); err != nil {
		t.Fatal(err)
	}
}

func TestEverySalesPromptStartsWithCurrentTemplate(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	items, err := loadSalesPrompts(t.Context(), cfg, "local")
	if err != nil || len(items) != 11 {
		t.Fatal(err, len(items))
	}
	for _, item := range items {
		current, err := loadSalesPrompt(t.Context(), cfg, "local", item.ID)
		if err != nil || !current.Configured || current.Prompt == "" || current.Prompt != item.DefaultPrompt {
			t.Fatalf("latest template missing for %s: %v", item.ID, err)
		}
	}
}

func TestUnconfiguredTextWorkflowsStopBeforeModelAndMediaReads(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	cfg := setupSalesTestConfig(t)
	complete := func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
		t.Fatal("unconfigured workspace must not execute a model")
		return 0, nil, nil
	}
	summaryRaw, _ := json.Marshal(exampleSummaryRequest())
	cases := []struct {
		id, body string
		handler  http.Handler
	}{
		{"summary", string(summaryRaw), summaryHandler(cfg, complete, func(context.Context, string, string) ([]byte, error) {
			t.Fatal("must fail before reading images")
			return nil, nil
		})},
		{"script-analysis", `{"videoUrl":"/storage/local/video.mp4","model":"gemini-2.5-pro","textProtocol":"gemini"}`, scriptAnalysisHandler(cfg, complete, func(string, string) (string, error) { t.Fatal("must fail before reading video"); return "", nil })},
		{"plan-adapt", `{"productName":"开衫","model":"gpt-4o","beats":[{"index":0,"start":0,"end":3}]}`, planAdaptHandler(cfg, complete)},
		{"spoken-copy", `{"sourceCopy":"条纹配纯色下装","voiceMode":"speech","duration":3,"model":"gpt-4o","beats":[{"index":0,"start":0,"end":3}]}`, spokenCopyHandler(cfg, complete)},
	}
	for _, test := range cases {
		t.Run(test.id, func(t *testing.T) {
			disablePrompt(t, cfg, "local", test.id)
			response := httptest.NewRecorder()
			test.handler.ServeHTTP(response, httptest.NewRequest("POST", "/api/sales/"+test.id, strings.NewReader(test.body)))
			if response.Code != 400 || !strings.Contains(response.Body.String(), `"code":"sales_prompt_unconfigured"`) || !strings.Contains(response.Body.String(), `"promptId":"`+test.id+`"`) {
				t.Fatalf("missing prompt was hidden: %d %s", response.Code, response.Body.String())
			}
		})
	}
}

func TestWhitespaceStoredPromptIsNotAnExecutableFallback(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	d, _ := findPromptDefinition("plan-adapt")
	if _, err := db.Exec(`INSERT INTO "SalesPromptOverride" VALUES ('local','plan-adapt','  ','test',?)`, d.resolve(nil).Version); err != nil {
		t.Fatal(err)
	}
	if _, err := loadSalesPrompt(t.Context(), cfg, "local", "plan-adapt"); err == nil {
		t.Fatal("blank stored text fell back to the starter")
	}
}

func TestUnconfiguredGridPromptStopsBeforeQueuingOrSavingAssets(t *testing.T) {
	cfg, db := setupAssetViewJobs(t)
	disablePrompt(t, cfg, "mine", "scene-grid")
	response := requestPrompt(AssetViewJobs(cfg), "POST", "/api/sales/asset-view-jobs", `{"key":"unconfigured","kind":"scene","data":{"title":"场景","coverUrl":"/main.jpg"},"generation":{"model":"gpt-image-1","prompt":"客户端文本不得替代未保存规则"}}`, "mine")
	if response.Code != 400 || !strings.Contains(response.Body.String(), `"code":"sales_prompt_unconfigured"`) {
		t.Fatalf("unconfigured grid was queued: %d %s", response.Code, response.Body.String())
	}
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM "SalesAssetViewJob"`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("unconfigured execution left a job: %d %v", count, err)
	}
}
