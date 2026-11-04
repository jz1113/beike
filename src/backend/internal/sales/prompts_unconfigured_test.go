package sales

import (
	"beike.local/cloud/src/backend/internal/config"
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/gateway"
)

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
