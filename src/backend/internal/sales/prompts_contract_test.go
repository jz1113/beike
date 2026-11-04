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
