package gateway

import (
	"context"
	"encoding/json"
	"io"
	"mime"
	"net/http"
	"net/http/httptest"
	"reflect"
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

func TestSubmitVideoRetainsBilledFailureWithoutEndpointRetry(t *testing.T) {
	for _, status := range []int{http.StatusOK, http.StatusBadRequest, http.StatusNotFound, http.StatusRequestTimeout, http.StatusInternalServerError} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			attempts := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				attempts++
				w.WriteHeader(status)
				_, _ = io.WriteString(w, `{"message":"Missing required parameter 'input'","usage":{"prompt_tokens":5,"completion_tokens":7,"total_tokens":12}}`)
			}))
			defer server.Close()
			result := SubmitVideo(context.Background(), SubmitCommand{
				Endpoints: []string{server.URL + "/first", server.URL + "/fallback"}, PayloadJSON: `{}`, Client: server.Client(), RetryOnMissingInput: true,
			})
			usage := NormalizeUsage(result.Data)
			if attempts != 1 || result.Outcome != Unknown || usage == nil || usage["totalTokens"] != float64(12) {
				t.Fatalf("billed response lost or replayed: result=%+v attempts=%d", result, attempts)
			}
		})
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

func TestPresentVideoErrorRedactsSignedOSSURLsBeforeClipping(t *testing.T) {
	signedURL := "https://jinzhuo11.oss-cn-beijing.aliyuncs.com/seedance/refs/202610/%E8%A7%86%E9%A2%91%E5%8F%82%E8%80%831.mp4?x-oss-credential=LTAI5t6uxgrYLFmsaBCUc1SX%2F20261031%2Fcn-beijing%2Foss%2Faliyun_v4_request&x-oss-date=20261031T080000Z&x-oss-expires=86400&x-oss-signature=abcdef1234567890"
	withTrailingReason := presentVideoError(signedURL + ": Input material may contain sensitive content: videoUrls[0]")
	if strings.Contains(withTrailingReason, "x-oss-credential") || !strings.Contains(withTrailingReason, "视频参考1.mp4") || !strings.Contains(withTrailingReason, "参考视频未通过安全检测") {
		t.Fatalf("unexpected formatted error: %s", withTrailingReason)
	}
	bareURL := presentVideoError(signedURL[:180])
	if strings.Contains(bareURL, "x-oss-credential") || !strings.Contains(bareURL, "【参考视频：视频参考1.mp4】处理失败") {
		t.Fatalf("unexpected bare url fallback: %s", bareURL)
	}
}

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
