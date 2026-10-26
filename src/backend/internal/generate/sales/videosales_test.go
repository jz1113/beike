package sales

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestLegacySalesRoutesRequireCurrentWorkflow(t *testing.T) {
	body, _ := json.Marshal(map[string]any{"productName": "纸巾", "allowFallback": true, "textProtocol": "openai"})
	for _, handler := range []http.Handler{Analyze(config.Config{}), Script(config.Config{}), Select(config.Config{}), Finalize(config.Config{})} {
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body)))
		if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "请使用当前工作室流程") {
			t.Fatalf("%d %s", rec.Code, rec.Body.String())
		}
	}
}

func TestLimitVisionImagesPrefersMain(t *testing.T) {
	images := []CatalogImage{
		{Index: 10, URL: "https://example.com/detail.jpg", Role: "detail"},
		{Index: 2, URL: "https://example.com/sku.jpg", Role: "sku"},
		{Index: 0, URL: "https://example.com/main.jpg", Role: "main"},
		{Index: 3, URL: "https://example.com/main.jpg", Role: "main"},
	}
	limited := LimitVisionImages(images, 2)
	if len(limited) != 2 || limited[0].Role != "main" || limited[1].Role != "sku" {
		t.Fatalf("unexpected vision order: %+v", limited)
	}
}

func TestRetiredSalesOperationsNeverCallModels(t *testing.T) {
	for _, operation := range []string{"compose", "validate-assets"} {
		payload := workflowPayload()
		payload["operation"] = operation
		handler := Finalize(config.Config{})
		if operation == "compose" {
			handler = Compose(config.Config{})
		}
		rec := postSales(t, handler, "/", payload)
		if rec.Code != http.StatusGone || !strings.Contains(rec.Body.String(), "已停用") {
			t.Fatalf("%s: %d %s", operation, rec.Code, rec.Body.String())
		}
	}
}

func TestSalesCreationRejectsOtherCategoriesBeforeModelCalls(t *testing.T) {
	for _, category := range []string{"", "home", "beauty", "food", "tech", "other"} {
		for _, handler := range []http.Handler{Analyze(config.Config{}), Script(config.Config{}), Finalize(config.Config{})} {
			payload := workflowPayload()
			payload["category"] = category
			payload["operation"] = "finalize"
			rec := postSales(t, handler, "/", payload)
			if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "category 必须为 fashion") {
				t.Fatalf("%s: %d %s", category, rec.Code, rec.Body.String())
			}
		}
	}
}
