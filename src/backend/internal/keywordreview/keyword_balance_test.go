package keywordreview

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestKeywordBalanceValidation(t *testing.T) {
	cases := []struct {
		body   string
		status int
		error  string
	}{
		{body: "", status: http.StatusBadRequest, error: "请求数据格式异常"},
		{body: "[]", status: http.StatusBadRequest, error: "Expected object, received array"},
		{body: `{"customBaseUrl":"https://example.com","customApiKey":"key"}`, status: http.StatusBadRequest, error: "关键词审核只接受 DeepSeek 官方接口，请到设置里填写 DeepSeek API Key"},
		{body: `{"customBaseUrl":"https://api.deepseek.com/v1/"}`, status: http.StatusBadRequest, error: "未配置 DeepSeek API Key，请到设置里的 DeepSeek 官方服务填写"},
		{body: `{"customApiKey":true}`, status: http.StatusBadRequest, error: "customApiKey: Expected string, received boolean"},
	}
	for _, item := range cases {
		status, body := keywordBalance(httptest.NewRequest(http.MethodPost, "/api/generate/keyword-review/balance", strings.NewReader(item.body)), nil)
		if status != item.status || body["error"] != item.error {
			t.Fatalf("body %s status %d result %#v", item.body, status, body)
		}
	}
}

func TestKeywordBalanceReadsOfficialAccount(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/api/generate/keyword-review/balance", strings.NewReader(`{"customBaseUrl":"https://api.deepseek.com","customApiKey":" secret "}`))
	status, body := keywordBalance(request, func(_ context.Context, apiKey string) (map[string]any, int, error) {
		if apiKey != "secret" {
			t.Fatalf("api key %q", apiKey)
		}
		return map[string]any{
			"is_available": true,
			"balance_infos": []any{
				map[string]any{"currency": "USD", "total_balance": "1", "granted_balance": "0", "topped_up_balance": "1"},
				map[string]any{"currency": "CNY", "total_balance": "12.5", "granted_balance": "2", "topped_up_balance": "10.5"},
			},
		}, http.StatusOK, nil
	})
	if status != http.StatusOK || body["currency"] != "CNY" || body["total"] != "12.5" || body["available"] != true {
		t.Fatalf("status %d body %#v", status, body)
	}
}

func TestKeywordBalanceReportsUpstreamFailure(t *testing.T) {
	request := func() *http.Request {
		return httptest.NewRequest(http.MethodPost, "/api/generate/keyword-review/balance", strings.NewReader(`{"customBaseUrl":"https://api.deepseek.com","customApiKey":"secret"}`))
	}
	status, body := keywordBalance(request(), func(context.Context, string) (map[string]any, int, error) {
		return map[string]any{"error": map[string]any{"message": "invalid"}}, http.StatusUnauthorized, nil
	})
	if status != http.StatusUnauthorized || body["code"] != "deepseek_api_error" || !strings.Contains(body["error"].(string), "接口原因：invalid") {
		t.Fatalf("status %d body %#v", status, body)
	}
	status, body = keywordBalance(request(), func(context.Context, string) (map[string]any, int, error) {
		return map[string]any{"is_available": false, "balance_infos": []any{}}, http.StatusOK, nil
	})
	if status != http.StatusBadGateway || body["error"] != "未能读取 DeepSeek 余额" {
		t.Fatalf("missing balance status %d body %#v", status, body)
	}
}
