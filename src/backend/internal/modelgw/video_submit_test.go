package modelgw

import (
	"context"
	"net/http"
	"net/http/httptest"
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
