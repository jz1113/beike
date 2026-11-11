package system

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
)

func TestModelFetchUsesApprovedFallback(t *testing.T) {
	status, body := fetchModelCatalog(context.Background(), config.Config{Root: repoRoot(t)}, httptest.NewRequest(http.MethodPost, "/", nil), map[string]any{}, nil)
	models, _ := body["models"].([]catalogModel)
	if status != http.StatusOK || body["isFallback"] != true || !containsModel(models, "gpt-image-2") {
		t.Fatalf("status %d count %v", status, body["count"])
	}
	status, body = fetchModelCatalog(context.Background(), config.Config{Root: repoRoot(t)}, httptest.NewRequest(http.MethodPost, "/", nil), map[string]any{"provider": "openai"}, nil)
	if status != http.StatusBadRequest {
		t.Fatalf("openai %d %#v", status, body["error"])
	}
}

func TestModelFetchFiltersGatewayModels(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/models" || r.Header.Get("Authorization") != "Bearer key" {
			t.Errorf("request %s", r.URL.String())
		}
		_, _ = w.Write([]byte(`{"data":[{"id":"gpt-image-2.6-sunburst"},{"id":"claude-fable-5-1"},{"id":"grok-4.6"},{"id":"viduq3"},{"id":"omni_flash-10s"},{"id":"google/gemini-omni-1.1-flash"},{"id":"not-approved"}]}`))
	}))
	defer server.Close()
	status, body := fetchModelCatalog(context.Background(), config.Config{Root: repoRoot(t)}, httptest.NewRequest(http.MethodPost, "/", nil), map[string]any{"baseUrl": server.URL, "apiKey": "key"}, server.Client())
	models, _ := body["models"].([]catalogModel)
	if status != http.StatusOK || len(models) != 2 || models[0].ID != "claude-fable-5-1" || models[1].ID != "gpt-image-2.6-sunburst" {
		t.Fatalf("status %d models %#v", status, body["models"])
	}
}

func TestModelFetchKeepsPrefixedGatewayID(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/paas/v4/models" {
			t.Errorf("unexpected model directory %s", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"data":[{"id":"vendor/gpt-image-2"},{"id":"custom/not-approved"}]}`))
	}))
	defer server.Close()
	status, body := fetchModelCatalog(context.Background(), config.Config{Root: repoRoot(t)}, httptest.NewRequest(http.MethodPost, "/", nil), map[string]any{"provider": "openai", "baseUrl": server.URL + "/api/paas/v4", "apiKey": "key"}, server.Client())
	models, _ := body["models"].([]map[string]any)
	if status != http.StatusOK || len(models) != 1 || models[0]["id"] != "vendor/gpt-image-2" {
		t.Fatalf("status %d models %#v", status, body["models"])
	}
}

func containsModel(models []catalogModel, id string) bool {
	for _, model := range models {
		if model.ID == id {
			return true
		}
	}
	return false
}

func TestModelCatalogScopesFallbackCredentialToConfiguredGateway(t *testing.T) {
	auth := make(chan string, 3)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth <- r.Header.Get("Authorization")
		_, _ = w.Write([]byte(`{"data":[{"id":"gpt-image-2"}]}`))
	}))
	defer server.Close()
	t.Setenv("AI_DRAWING_BASE_URL", server.URL+"/default/v1")
	t.Setenv("AI_DRAWING_API_KEY", "server-fallback")
	cfg := config.Config{Root: repoRoot(t)}
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	status, body := fetchModelCatalog(context.Background(), cfg, req, map[string]any{"baseUrl": server.URL + "/custom", "isPing": true}, server.Client())
	if status != http.StatusOK || body["success"] != false || len(auth) != 0 {
		t.Fatalf("custom address without a key must not contact upstream: status=%d calls=%d", status, len(auth))
	}
	status, _ = fetchModelCatalog(context.Background(), cfg, req, map[string]any{"baseUrl": server.URL + "/default"}, server.Client())
	if status != http.StatusOK || len(auth) != 1 || <-auth != "Bearer server-fallback" {
		t.Fatalf("default address did not use the fallback: status=%d calls=%d", status, len(auth))
	}
	status, _ = fetchModelCatalog(context.Background(), cfg, req, map[string]any{"baseUrl": server.URL + "/custom", "apiKey": "saved-channel"}, server.Client())
	if status != http.StatusOK || len(auth) != 1 || <-auth != "Bearer saved-channel" {
		t.Fatalf("custom address did not use its explicit credential: status=%d calls=%d", status, len(auth))
	}
}

func TestCatalogProtocolExplicitOverridePrecedesHost(t *testing.T) {
	if got := catalogNativeProtocol(map[string]any{"catalogProtocol": "openai", "providerType": "gemini"}, "https://generativelanguage.googleapis.com"); got != "" {
		t.Fatalf("explicit compatible catalog ignored: %s", got)
	}
	if got := catalogNativeProtocol(map[string]any{"catalogProtocol": "anthropic", "providerType": "openai"}, "https://relay.example"); got != "anthropic" {
		t.Fatalf("explicit native catalog ignored: %s", got)
	}
}

func TestNativeGeminiCatalogAuthenticatesAndPaginates(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/proxy/v1beta/models" || r.Header.Get("x-goog-api-key") != "test-native-key" || r.Header.Get("Authorization") != "" || r.URL.Query().Get("key") != "" {
			t.Errorf("unexpected request: %s headers=%v", r.URL, r.Header)
		}
		if calls == 1 {
			fmt.Fprint(w, `{"models":[{"name":"models/gemini-4-argon","displayName":"Gemini 4 Argon"}],"nextPageToken":"next"}`)
			return
		}
		if r.URL.Query().Get("pageToken") != "next" {
			t.Error("missing page token")
		}
		fmt.Fprint(w, `{"models":[{"name":"models/gemini-3.8-flash"}]}`)
	}))
	defer server.Close()
	list, status, message := readNativeModels(context.Background(), server.Client(), server.URL+"/proxy/v1", "test-native-key", "gemini")
	if status != 200 || message != "" || calls != 2 || len(list) != 2 || list[0].(map[string]any)["id"] != "gemini-4-argon" {
		t.Fatalf("status=%d calls=%d list=%v error=%s", status, calls, list, message)
	}
}

func TestNativeAnthropicCatalogAuthenticatesAndStopsRepeatedPage(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/models" || r.Header.Get("x-api-key") != "test-native-key" || r.Header.Get("anthropic-version") != "2023-06-01" || r.Header.Get("Authorization") != "" {
			t.Errorf("unexpected request %s %v", r.URL, r.Header)
		}
		fmt.Fprint(w, `{"data":[{"id":"claude-haiku-5-5"}],"has_more":true,"last_id":"same"}`)
	}))
	defer server.Close()
	_, status, message := readNativeModels(context.Background(), server.Client(), server.URL+"/v1", "test-native-key", "anthropic")
	if status != 502 || !strings.Contains(message, "分页未前进") {
		t.Fatalf("%d %s", status, message)
	}
}

func TestNativeCatalogDoesNotForwardCredentialsOnRedirect(t *testing.T) {
	received := false
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { received = true }))
	defer target.Close()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, target.URL, http.StatusFound) }))
	defer server.Close()
	_, _, message := readNativeModels(context.Background(), server.Client(), server.URL, "test-native-key", "anthropic")
	if received || message == "" {
		t.Fatalf("credential redirect followed=%v error=%s", received, message)
	}
}

func TestNativeConnectionProbeUsesSelectedProtocol(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1beta/models/gemini-4-argon:generateContent" || r.Header.Get("x-goog-api-key") != "test-native-key" {
			t.Errorf("unexpected probe %s %v", r.URL, r.Header)
		}
		fmt.Fprint(w, `{"candidates":[{"content":{"role":"model","parts":[{"text":"PONG"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":1,"candidatesTokenCount":1,"totalTokenCount":2}}`)
	}))
	defer server.Close()
	status, body := probeChat(context.Background(), server.Client(), server.URL, "test-native-key", "gemini-4-argon")
	if status != 200 || body["success"] != true || body["textProtocol"] != "gemini" {
		t.Fatalf("%d %v", status, body)
	}
	if gateway.TextProtocol(gateway.WithTextProtocol(context.Background(), "openai"), "gemini-4-argon") != "openai" {
		t.Fatal("explicit compatible protocol ignored")
	}
}

func TestParseDefaultGroupPrices(t *testing.T) {
	prices := parseDefaultGroupPrices(map[string]any{
		"group_ratio": map[string]any{"default": 1.0},
		"data": []any{
			map[string]any{
				"model_name": "GPT-4o", "quota_type": float64(0), "model_ratio": 2.0, "completion_ratio": 3.0,
				"enable_groups": []any{"default"},
			},
			map[string]any{
				"model_name": "skip", "quota_type": float64(1), "model_ratio": 1.0, "completion_ratio": 1.0,
				"enable_groups": []any{"default"},
			},
		},
	})
	got := prices["gpt-4o"]
	if got.PromptPer1k != 0.004 || got.CompletionPer1k != 0.012 {
		t.Fatalf("prices %#v", prices)
	}
	if _, ok := prices["skip"]; ok {
		t.Fatal("非默认计费类型不应进入报价")
	}
}

func TestGatewayUserRequiresIdentity(t *testing.T) {
	handler := gatewayUserHandler()
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/system/gateway-user", bytes.NewBufferString(`{"systemToken":"token"}`)))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "缺少用户 ID") {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
}

func TestFetchGatewayUserReadsQuota(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/user/self" || r.Header.Get("New-API-User") != "7" || r.Header.Get("Authorization") != "Bearer token" {
			t.Errorf("request %s %s", r.URL.Path, r.Header.Get("New-API-User"))
		}
		_, _ = w.Write([]byte(`{"success":true,"data":{"id":7,"username":"贝壳","quota":500000,"used_quota":0,"request_count":3,"group":"vip"}}`))
	}))
	defer server.Close()
	status, body := fetchGatewayUser(context.Background(), server.Client(), server.URL, "7", "token", "Asia/Shanghai")
	user, _ := body["user"].(map[string]any)
	if status != http.StatusOK || user["username"] != "贝壳" || user["quotaFormatted"] != 1.0 || user["quotaRmb"] != 1.2 {
		t.Fatalf("status %d body %#v", status, body)
	}
}
