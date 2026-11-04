package gateway

import (
	"context"
	"io"
	"mime"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
)

func TestSubmitVideoMultipartPreservesReferencesAcrossEndpointRetry(t *testing.T) {
	fields := map[string][]string{
		"model":     {"MiniMax-H3"},
		"prompt":    {"人物说：你好，参考音频1的音色。"},
		"seconds":   {"5"},
		"audioUrls": {`["https://media.example/voice.mp3?signature=a+b%2Fc&expires=15"]`},
		"labels":    {"first", "second"},
	}
	attempts := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		mediaType, parameters, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
		if err != nil || mediaType != "multipart/form-data" || parameters["boundary"] == "" {
			t.Errorf("multipart content type: %q (%v)", r.Header.Get("Content-Type"), err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			t.Errorf("parse multipart: %v", err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		defer r.MultipartForm.RemoveAll()
		if !reflect.DeepEqual(r.MultipartForm.Value, fields) {
			t.Errorf("fields = %#v, want %#v", r.MultipartForm.Value, fields)
		}
		if len(r.MultipartForm.File) != 0 || r.Header.Get("Authorization") != "Bearer test-key" || r.Header.Get("X-Test-Provider") != "comfly" {
			t.Errorf("unexpected files or headers: %#v %#v", r.MultipartForm.File, r.Header)
		}
		if attempts == 1 {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		_, _ = io.WriteString(w, `{"task_id":"multipart-task"}`)
	}))
	defer server.Close()
	result := SubmitVideo(context.Background(), SubmitCommand{
		Endpoints: []string{server.URL + "/missing", server.URL + "/v1/videos"}, APIKey: "test-key",
		PayloadJSON: `{"must_not_be_sent":true}`, MultipartFields: fields,
		Headers: map[string]string{"X-Test-Provider": "comfly"}, Client: server.Client(),
		ReadTaskID: func(data map[string]any) string { id, _ := data["task_id"].(string); return id },
	})
	if result.Outcome != Accepted || result.TaskID != "multipart-task" || result.EndpointAttempts != 2 || attempts != 2 {
		t.Fatalf("result = %#v, attempts = %d", result, attempts)
	}
}

func TestSubmitVideoJSONDefaultIsUnchanged(t *testing.T) {
	want := `{"model":"MiniMax-H3","content":[{"type":"text","text":"你好"}]}`
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		if r.Header.Get("Content-Type") != "application/json" || string(body) != want {
			t.Errorf("content type = %q, body = %s", r.Header.Get("Content-Type"), body)
		}
		_, _ = io.WriteString(w, `{"task_id":"json-task"}`)
	}))
	defer server.Close()
	result := SubmitVideo(context.Background(), SubmitCommand{
		Endpoints: []string{server.URL}, PayloadJSON: want, Client: server.Client(),
		ReadTaskID: func(data map[string]any) string { id, _ := data["task_id"].(string); return id },
	})
	if result.Outcome != Accepted || result.TaskID != "json-task" {
		t.Fatalf("result = %#v", result)
	}
}

func TestSubmitVideoMultipartDoesNotRetryUnknownSubmission(t *testing.T) {
	attempts := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		w.WriteHeader(http.StatusBadGateway)
		_, _ = io.WriteString(w, `{"message":"upstream unavailable"}`)
	}))
	defer server.Close()
	result := SubmitVideo(context.Background(), SubmitCommand{
		Endpoints: []string{server.URL + "/a", server.URL + "/b"}, Client: server.Client(),
		MultipartFields: map[string][]string{"model": {"MiniMax-H3"}},
	})
	if result.Outcome != Unknown || result.EndpointAttempts != 1 || attempts != 1 {
		t.Fatalf("result = %#v, attempts = %d", result, attempts)
	}
}
