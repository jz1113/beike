package keywordreview

import (
	"context"
	"fmt"
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

func TestDeepSeekFailureReportsGatewayCutoff(t *testing.T) {
	for _, status := range []int{http.StatusGatewayTimeout, 524} {
		message := deepSeekFailure(status, nil, "模型网关")
		if strings.Contains(message, "请求失败") || !strings.Contains(message, "模型网关在约 120 秒切断了响应") || !strings.Contains(message, fmt.Sprintf("HTTP %d", status)) {
			t.Fatalf("status %d message %q", status, message)
		}
	}
	official := deepSeekFailure(http.StatusGatewayTimeout, nil, "DeepSeek")
	if !strings.Contains(official, "DeepSeek 在约 120 秒切断了响应") || !strings.Contains(official, "HTTP 504") {
		t.Fatalf("official message %q", official)
	}
	detailed := deepSeekFailure(524, map[string]any{"error": "origin timeout"}, "模型网关")
	if !strings.Contains(detailed, "约 120 秒") || !strings.Contains(detailed, "接口原因：origin timeout") || strings.Contains(detailed, "HTTP 524") {
		t.Fatalf("detailed message %q", detailed)
	}
	if got := deepSeekFailure(http.StatusBadGateway, nil, "模型网关"); got != "模型网关请求失败，请稍后重试" {
		t.Fatalf("generic message %q", got)
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
