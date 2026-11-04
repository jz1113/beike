package sales

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/gateway"
)

func TestSpokenReviewOnlyPreservesManualWordingAndNeverCallsWriter(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	cfg := setupSalesTestConfig(t)
	// A manual review never executes a writing prompt, so only the independent
	// reviewer needs to be configured and no writing version may be invented.
	reviewer := customizePrompt(t, cfg, "spoken-review")
	var input map[string]any
	if err := json.Unmarshal([]byte(spokenCopyTestRequest), &input); err != nil {
		t.Fatal(err)
	}
	input["reviewOnly"] = true
	input["beats"].([]any)[0].(map[string]any)["spokenLine"] = "  条纹配纯色就行。 "
	input["beats"].([]any)[0].(map[string]any)["subtitle"] = "条纹搭纯色"
	input["beats"].([]any)[1].(map[string]any)["spokenLine"] = "领口还有装饰扣。"
	input["beats"].([]any)[1].(map[string]any)["subtitle"] = "领口装饰扣"
	raw, _ := json.Marshal(input)
	calls := 0
	response := httptest.NewRecorder()
	spokenCopyHandler(cfg, func(_ context.Context, request gateway.TextRequest, _ bool) (int, map[string]any, error) {
		calls++
		assertRequestPrompt(t, request, reviewer.Prompt)
		return 200, spokenReviewDecision(t, request, true), nil
	}).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/sales/spoken-copy", strings.NewReader(string(raw))))
	var result struct {
		Beats               []spokenCopyBeatOutput `json:"beats"`
		PromptVersion       string                 `json:"promptVersion"`
		ReviewPromptVersion string                 `json:"reviewPromptVersion"`
	}
	if response.Code != 200 || json.Unmarshal(response.Body.Bytes(), &result) != nil || calls != 1 || len(result.Beats) != 2 || result.Beats[0].SpokenLine != "  条纹配纯色就行。 " || result.PromptVersion != "" || result.ReviewPromptVersion != reviewer.Version {
		t.Fatalf("reviewOnly changed manual words or skipped review: %d calls=%d %s", response.Code, calls, response.Body.String())
	}
}

func TestSpokenReviewOnlyKeepsRejectedOrInvalidDraftWithoutRewriting(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	for _, kind := range []string{"semantic", "overlong", "unsupported_part"} {
		t.Run(kind, func(t *testing.T) {
			cfg := setupSalesTestConfig(t)
			customizePrompt(t, cfg, "spoken-copy")
			reviewer := customizePrompt(t, cfg, "spoken-review")
			var input map[string]any
			if err := json.Unmarshal([]byte(spokenCopyTestRequest), &input); err != nil {
				t.Fatal(err)
			}
			input["reviewOnly"] = true
			line := "条纹配纯色就行。"
			if kind == "overlong" {
				line = strings.Repeat("条纹", 20)
			}
			if kind == "unsupported_part" {
				line = "内胆能拆卸。"
			}
			input["beats"].([]any)[0].(map[string]any)["spokenLine"] = line
			raw, _ := json.Marshal(input)
			calls := 0
			response := httptest.NewRecorder()
			spokenCopyHandler(cfg, func(_ context.Context, request gateway.TextRequest, _ bool) (int, map[string]any, error) {
				calls++
				assertRequestPrompt(t, request, reviewer.Prompt)
				return 200, spokenReviewDecision(t, request, false), nil
			}).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/sales/spoken-copy", strings.NewReader(string(raw))))
			wantCalls := 0
			if kind == "semantic" {
				wantCalls = 1
			}
			if response.Code != 422 || calls != wantCalls || !strings.Contains(response.Body.String(), "原稿已保留") || strings.Contains(response.Body.String(), "reviewPromptVersion") || strings.Contains(response.Body.String(), `"beats"`) {
				t.Fatalf("reviewOnly rewrote or accepted failed draft: %d calls=%d %s", response.Code, calls, response.Body.String())
			}
		})
	}
}
