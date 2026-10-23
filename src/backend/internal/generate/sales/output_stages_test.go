package sales

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestSalesStagesRecoverAndStillValidateDomainResults(t *testing.T) {
	for _, tc := range []struct {
		name, operation, reply string
		handler                http.Handler
		status                 int
	}{
		{"script", "", validWorkflowScript(), Script(config.Config{}), 200},
		{"wrong duration", "", strings.Replace(validWorkflowScript(), `"duration":15`, `"duration":14`, 1), Script(config.Config{}), 502},
		{"select", "", `{"assignments":[{"shotId":1,"imageIndex":2,"reason":"白色商品主图"}]}`, Select(config.Config{}), 200},
		{"finalize", "finalize", `{"fullPrompt":"图片1商品，图片2场景","prompts":[{"shotId":1,"prompt":"展示图片1商品"}]}`, Finalize(config.Config{}), 200},
		{"invented reference", "finalize", `{"fullPrompt":"图片99商品","prompts":[{"shotId":1,"prompt":"展示商品"}]}`, Finalize(config.Config{}), 502},
		{"validate", "validate-assets", `{"validations":[{"id":"table","status":"uncertain","reason":"看不清"},{"id":"product_white","status":"passed","reason":"白色包装"}]}`, Finalize(config.Config{}), 200},
	} {
		t.Run(tc.name, func(t *testing.T) {
			calls := 0
			server := recoveryServer(t, func(w http.ResponseWriter, r *http.Request) {
				calls++
				if calls == 1 {
					recoveryReply(w, "openai", `{"incomplete":`, true)
				} else {
					recoveryReply(w, "openai", tc.reply, false)
				}
			})
			payload := workflowPayload()
			attachGateway(payload, server.URL)
			if tc.operation != "" {
				payload["operation"] = tc.operation
			}
			rec := postSales(t, tc.handler, "/", payload)
			if rec.Code != tc.status || calls != 2 {
				t.Fatalf("status=%d calls=%d body=%s", rec.Code, calls, rec.Body.String())
			}
		})
	}
}

func TestSalesAnalysisAggregatesAllBatchesAndRecoveryUsage(t *testing.T) {
	calls := 0
	server := recoveryServer(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		if calls == 1 {
			recoveryReply(w, "openai", `{"productName":`, true)
		} else {
			recoveryReply(w, "openai", salesAnalysisJSON, false)
		}
	})
	payload := map[string]any{
		"workflowVersion": 3, "model": "m", "textProtocol": "openai", "category": "fashion",
		"imageCatalog": salesImages(5), "eligibleImageIndexes": []int{1, 2, 3, 4, 5},
		"customBaseUrl": server.URL, "customApiKey": "test",
	}
	rec := postSales(t, Analyze(config.Config{}), "/", payload)
	var response struct {
		Usage map[string]float64 `json:"usage"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &response)
	if rec.Code != 200 || calls != 4 || response.Usage["totalTokens"] != 20 {
		t.Fatalf("status=%d calls=%d body=%s", rec.Code, calls, rec.Body.String())
	}
}
