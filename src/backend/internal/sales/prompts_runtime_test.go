package sales

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
)

func customizePrompt(t *testing.T, cfg config.Config, id string) salesPrompt {
	t.Helper()
	d, found := findPromptDefinition(id)
	if !found {
		t.Fatal("unknown prompt", id)
	}
	text := d.text + "\n本次自定义规则：自然拍摄节奏。"
	item, err := saveSalesPrompt(context.Background(), cfg, "local", d, &text, d.resolve(nil).Version)
	if err != nil {
		t.Fatal(err)
	}
	return item
}

func assertRequestPrompt(t *testing.T, req gateway.TextRequest, want string) {
	t.Helper()
	messages := req.Payload["messages"].([]any)
	content := messages[0].(map[string]any)["content"]
	var actual string
	switch v := content.(type) {
	case string:
		actual = v
	case []any:
		actual = v[0].(map[string]any)["text"].(string)
	}
	if actual != want {
		t.Fatal("model received different prompt than editor")
	}
}

func TestSavedPromptsDriveSummaryNormalizeAndAdapt(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	cfg := setupSalesTestConfig(t)
	summary := customizePrompt(t, cfg, "summary")
	rec := serveSummary(summaryHandler(cfg, func(_ context.Context, req gateway.TextRequest, _ bool) (int, map[string]any, error) {
		assertRequestPrompt(t, req, summary.Prompt)
		return 200, summaryCompletion(exampleSummaryResult()), nil
	}, func(context.Context, string, string) ([]byte, error) { return []byte("image"), nil }), exampleSummaryRequest())
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), summary.Version) {
		t.Fatal("summary version", rec.Code, rec.Body.String())
	}

	normalize := customizePrompt(t, cfg, "script-normalize")
	rec = httptest.NewRecorder()
	scriptNormalizeHandler(cfg, func(_ context.Context, req gateway.TextRequest, _ bool) (int, map[string]any, error) {
		assertRequestPrompt(t, req, normalize.Prompt)
		return 200, scriptCompletion(validScript, "stop"), nil
	}).ServeHTTP(rec, httptest.NewRequest("POST", "/api/sales/script-normalize", strings.NewReader(`{"rawText":"第一段起身，第二段转身","model":"gpt-4o"}`)))
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), normalize.Version) {
		t.Fatal("normalize version", rec.Code, rec.Body.String())
	}

	adapt := customizePrompt(t, cfg, "plan-adapt")
	rec = httptest.NewRecorder()
	planAdaptHandler(cfg, func(_ context.Context, req gateway.TextRequest, _ bool) (int, map[string]any, error) {
		assertRequestPrompt(t, req, adapt.Prompt)
		return 200, scriptCompletion(`{"beats":[{"index":0,"subject":"条纹开衫","action":"看镜头微笑展示门襟","spokenLine":"","subtitle":""}]}`, "stop"), nil
	}).ServeHTTP(rec, httptest.NewRequest("POST", "/api/sales/plan-adapt", strings.NewReader(`{"productName":"条纹开衫","model":"gpt-4o","beats":[{"index":0,"start":0,"end":3}]}`)))
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), adapt.Version) {
		t.Fatal("adapt version", rec.Code, rec.Body.String())
	}
}

func TestSavedAnalysisPromptInvalidatesOldCache(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	cfg := setupSalesTestConfig(t)
	video := "data:video/mp4;base64,AA=="
	digest := sha256.Sum256([]byte(video))
	videoHash := hex.EncodeToString(digest[:16])
	var script map[string]any
	if err := json.Unmarshal([]byte(validScript), &script); err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(map[string]any{"videoHash": videoHash, "script": script, "model": "gemini-2.5-pro", "promptVersion": scriptPromptVersion(), "status": "draft"})
	created := httptest.NewRecorder()
	Scripts(cfg).ServeHTTP(created, httptest.NewRequest(http.MethodPost, "/api/sales/scripts", strings.NewReader(string(body))))
	if created.Code != 200 {
		t.Fatal(created.Body.String())
	}
	custom := customizePrompt(t, cfg, "script-analysis")
	called := false
	rec := httptest.NewRecorder()
	scriptAnalysisHandler(cfg, func(_ context.Context, req gateway.TextRequest, _ bool) (int, map[string]any, error) {
		called = true
		assertRequestPrompt(t, req, custom.Prompt)
		return 200, scriptCompletion(validScript, "stop"), nil
	}, func(string, string) (string, error) { return video, nil }).ServeHTTP(rec,
		httptest.NewRequest("POST", "/api/sales/script-analysis", strings.NewReader(`{"videoUrl":"/storage/local/ref.mp4","model":"gemini-2.5-pro","textProtocol":"gemini"}`)))
	if !called || rec.Code != 200 || !strings.Contains(rec.Body.String(), custom.Version) || !strings.Contains(rec.Body.String(), `"cached":false`) {
		t.Fatal("old cache reused", called, rec.Code, rec.Body.String())
	}
}

func TestPromptHTTPUpdatesApplyToRunningAndRecreatedHandlers(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	cfg := setupSalesTestConfig(t)
	mux := promptTestMux(cfg)
	definition, _ := findPromptDefinition("plan-adapt")
	want := definition.resolve(nil)
	calls := 0
	complete := func(_ context.Context, req gateway.TextRequest, _ bool) (int, map[string]any, error) {
		calls++
		assertRequestPrompt(t, req, want.Prompt)
		return 200, scriptCompletion(`{"beats":[{"index":0,"subject":"开衫","action":"举手","expression":"先抬眼浅笑再回落","transition":"手臂落下保持距离"}]}`, "stop"), nil
	}
	// Construct before saving: handlers must not capture startup defaults.
	handler := planAdaptHandler(cfg, complete)
	call := func(handler http.Handler) *httptest.ResponseRecorder {
		return requestPrompt(handler, "POST", "/api/sales/plan-adapt", `{"productName":"开衫","model":"gpt-4o","beats":[{"index":0,"start":0,"end":3,"expression":"先抬眼浅笑再回落","transition":"手臂落下保持距离"}]}`, "local")
	}
	for _, rule := range []string{"第一版保存规则", "第二版保存规则"} {
		text := definition.text + "\n" + rule
		saved := requestPrompt(mux, "PUT", "/api/sales/prompts/plan-adapt", promptUpdateJSON(&text, want.Version), "local")
		var response struct {
			Prompt salesPrompt `json:"prompt"`
		}
		if saved.Code != 200 || json.Unmarshal(saved.Body.Bytes(), &response) != nil || !response.Prompt.Customized {
			t.Fatal("HTTP save failed", saved.Code, saved.Body.String())
		}
		want = response.Prompt
		if rec := call(handler); rec.Code != 200 || !strings.Contains(rec.Body.String(), want.Version) {
			t.Fatal("running handler did not load saved version", rec.Code, rec.Body.String())
		}
	}
	if rec := call(planAdaptHandler(cfg, complete)); rec.Code != 200 || !strings.Contains(rec.Body.String(), want.Version) || calls != 3 {
		t.Fatal("recreated handler lost saved rules", rec.Code, rec.Body.String(), calls)
	}
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`DROP TABLE "SalesPromptOverride"`); err != nil {
		t.Fatal(err)
	}
	if rec := call(handler); rec.Code != 500 || calls != 3 {
		t.Fatal("storage failure fell back to a model request", rec.Code, rec.Body.String(), calls)
	}
}
