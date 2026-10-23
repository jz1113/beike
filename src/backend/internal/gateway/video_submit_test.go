package gateway

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSubmitVideoStopsOnServerError(t *testing.T) {
	attempts := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte(`{"message":"上游繁忙"}`))
	}))
	defer server.Close()
	result := SubmitVideo(context.Background(), SubmitCommand{
		Endpoints:   []string{server.URL + "/a", server.URL + "/b"},
		APIKey:      "key",
		PayloadJSON: `{}`,
		Client:      server.Client(),
	})
	if result.Outcome != Unknown || result.EndpointAttempts != 1 || result.Error != "上游繁忙" {
		t.Fatalf("%#v attempts %d", result, attempts)
	}
}

func TestSubmitVideoSwitchesOnlyOn404(t *testing.T) {
	seen := []string{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = append(seen, r.URL.Path)
		if r.URL.Path == "/missing" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		if r.Header.Get("X-DashScope-Async") != "enable" {
			t.Errorf("dashscope header %q", r.Header.Get("X-DashScope-Async"))
		}
		_, _ = w.Write([]byte(`{"id":"task-1"}`))
	}))
	defer server.Close()
	result := SubmitVideo(context.Background(), SubmitCommand{
		Endpoints:   []string{server.URL + "/missing", server.URL + "/video-generation/submit"},
		PayloadJSON: `{}`,
		Client:      server.Client(),
		ReadTaskID: func(data map[string]any) string {
			id, _ := data["id"].(string)
			return id
		},
	})
	if result.Outcome != Accepted || result.TaskID != "task-1" || result.EndpointAttempts != 2 || len(seen) != 2 {
		t.Fatalf("%#v seen %v", result, seen)
	}
}

func TestSubmitVideoExplainsProviderErrors(t *testing.T) {
	raw := `undefined failed: 400, {"code":400,"reason":"FieldInvalid","message":"mode is not supported","metadata":{"fields":"model"}}`
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"message":` + jsonQuote(raw) + `}`))
	}))
	defer server.Close()
	result := SubmitVideo(context.Background(), SubmitCommand{
		Endpoints: []string{server.URL}, PayloadJSON: `{}`, Client: server.Client(),
	})
	if result.Outcome != Rejected || !strings.Contains(result.Error, "该渠道不接受当前型号或参考方式") || !strings.Contains(result.Error, "mode is not supported") || strings.Contains(result.Error, "undefined failed") {
		t.Fatalf("%#v", result)
	}
	missing := presentVideoError("submit algo service error: Missing required parameter 'input'")
	if !strings.Contains(missing, "万相官方请求未被接受") || !strings.Contains(missing, "input") {
		t.Fatalf("wan: %s", missing)
	}
}

func jsonQuote(value string) string {
	data, _ := json.Marshal(value)
	return string(data)
}

func TestSubmitVideoRetriesOnlyMissingWanInput(t *testing.T) {
	seen := []string{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = append(seen, r.URL.Path)
		if r.URL.Path == "/wan" {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"message":"submit algo service error: Missing required parameter 'input'!"}`))
			return
		}
		_, _ = w.Write([]byte(`{"task_id":"wan-2"}`))
	}))
	defer server.Close()
	retried := SubmitVideo(context.Background(), SubmitCommand{
		Endpoints: []string{server.URL + "/wan", server.URL + "/native"}, PayloadJSON: `{}`, Client: server.Client(),
		RetryOnMissingInput: true,
		ReadTaskID: func(data map[string]any) string {
			id, _ := data["task_id"].(string)
			return id
		},
	})
	if retried.Outcome != Accepted || retried.TaskID != "wan-2" || retried.EndpointAttempts != 2 || len(seen) != 2 {
		t.Fatalf("retry %#v seen %v", retried, seen)
	}
	stopped := SubmitVideo(context.Background(), SubmitCommand{
		Endpoints: []string{server.URL + "/wan", server.URL + "/native"}, PayloadJSON: `{}`, Client: server.Client(),
	})
	if stopped.Outcome != Rejected || stopped.EndpointAttempts != 1 || !strings.Contains(stopped.Error, "input") {
		t.Fatalf("stop %#v", stopped)
	}
}

func TestSubmitVideoRejectsClientError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":"参数无效"}`))
	}))
	defer server.Close()
	result := SubmitVideo(context.Background(), SubmitCommand{
		Endpoints: []string{server.URL + "/a", server.URL + "/b"}, PayloadJSON: `{}`, Client: server.Client(),
	})
	if result.Outcome != Rejected || result.EndpointAttempts != 1 || result.Error != "参数无效" {
		t.Fatalf("%#v", result)
	}
}
