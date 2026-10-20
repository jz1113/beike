package system

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/modelgw"
)

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
	if modelgw.TextProtocol(modelgw.WithTextProtocol(context.Background(), "openai"), "gemini-4-argon") != "openai" {
		t.Fatal("explicit compatible protocol ignored")
	}
}
