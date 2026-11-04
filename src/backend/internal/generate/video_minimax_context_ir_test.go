package generate

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"

	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
)

func TestMetasoH3ContextIRPreservesDefaultAndExplicitChoiceInSubmissionAndReceipt(t *testing.T) {
	for _, item := range []struct {
		name           string
		explicit, want bool
	}{
		{"default", false, true}, {"enabled", true, true}, {"disabled", true, false},
	} {
		t.Run(item.name, func(t *testing.T) {
			store := &wanReferenceObjectStore{}
			root := setupWanStorage(t, store, "")
			writeReferenceWav(t, root, "local/audio/voice.wav", 3)
			var submissions atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				submissions.Add(1)
				var body map[string]any
				if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
					t.Error(err)
				}
				if r.URL.Path != "/api/minimax/v2/video_generation" || body["context_ir_enabled"] != item.want || body["content"] == nil {
					t.Errorf("IR Context choice missing from actual Metaso request: %s %#v", r.URL.Path, body)
				}
				_, _ = w.Write([]byte(`{"task_id":"context-ir-task"}`))
			}))
			defer server.Close()
			cfg := videoSubmissionTestConfig(t, server)
			cfg.Root = audioTestProjectRoot(t)
			target, _ := url.Parse(server.URL)
			gateway.ModelHTTP = func() *http.Client {
				return &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
					local := request.Clone(request.Context())
					local.URL.Scheme, local.URL.Host = target.Scheme, target.Host
					return http.DefaultTransport.RoundTrip(local)
				})}
			}
			payload := map[string]any{
				"prompt": "音频只提供音色", "model": "MiniMax-H3", "duration": 15, "resolution": "1080P", "ref_mode": "omni", "audio": true,
				"audios": []string{"/storage/local/audio/voice.wav"}, "clientTaskId": "context-ir-" + item.name,
				"customBaseUrl": "https://metaso.cn/api", "customApiKey": "test-context-key", "storageConfig": json.RawMessage(wanOSSStorageJSON),
			}
			if item.explicit {
				payload["context_ir_enabled"] = item.want
			}
			handler := Video(cfg)
			post := func() *httptest.ResponseRecorder {
				encoded, _ := json.Marshal(payload)
				req := httptest.NewRequest(http.MethodPost, "/api/generate/video", bytes.NewReader(encoded))
				req = req.WithContext(httpx.WithWorkspace(req.Context(), "local"))
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, req)
				return response
			}
			first := post()
			var result struct {
				RecordID   string                      `json:"recordId"`
				Diagnostic *videoSubmissionDiagnostics `json:"submissionDiagnostics"`
			}
			if err := json.Unmarshal(first.Body.Bytes(), &result); err != nil || first.Code != 200 || result.Diagnostic == nil || result.Diagnostic.ContextIREnabled == nil || *result.Diagnostic.ContextIREnabled != item.want || submissions.Load() != 1 || store.calls != 1 {
				t.Fatalf("context IR generation/receipt failed: %d %s err=%v", first.Code, first.Body.String(), err)
			}
			saved := readVideoSubmissionDiagnostics(cfg, "local", result.RecordID)
			if saved == nil || saved.ContextIREnabled == nil || *saved.ContextIREnabled != item.want {
				t.Fatal("durable diagnostic lost the actual IR Context choice", saved)
			}
			// Omitting the option and explicitly enabling it represent the same
			// effective request. Reusing an accepted task must not upload or charge.
			payload["context_ir_enabled"] = item.want
			repeated := post()
			if repeated.Code != 200 || !strings.Contains(repeated.Body.String(), `"reused":true`) || submissions.Load() != 1 || store.calls != 1 {
				t.Fatal("unchanged effective context IR choice resubmitted", repeated.Code, repeated.Body.String())
			}
			payload["context_ir_enabled"] = !item.want
			conflict := post()
			if conflict.Code != http.StatusConflict || !strings.Contains(conflict.Body.String(), `"idempotencyConflict":true`) || submissions.Load() != 1 || store.calls != 1 {
				t.Fatal("changed context IR choice reused or charged the existing task", conflict.Code, conflict.Body.String())
			}
		})
	}
}

func TestMetasoH3RejectsInvalidContextIRBeforeUploadsOrGeneration(t *testing.T) {
	store := &wanReferenceObjectStore{}
	root := setupWanStorage(t, store, "")
	writeReferenceWav(t, root, "local/audio/voice.wav", 3)
	var submissions atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		submissions.Add(1)
		_, _ = w.Write([]byte(`{"task_id":"must-not-submit"}`))
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	cfg.Root = audioTestProjectRoot(t)
	handler := Video(cfg)
	for _, invalid := range []any{nil, "true", "false", "", 1, 0, []any{true}, map[string]any{"enabled": true}} {
		body, _ := json.Marshal(map[string]any{
			"prompt": "口播", "model": "MiniMax-H3", "context_ir_enabled": invalid, "audios": []string{"/storage/local/audio/voice.wav"},
			"customBaseUrl": "https://metaso.cn/api", "customApiKey": "test-context-key", "storageConfig": json.RawMessage(wanOSSStorageJSON),
		})
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/video", bytes.NewReader(body)))
		if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "Expected boolean") || store.calls != 0 || submissions.Load() != 0 {
			t.Fatalf("invalid context IR value accepted or caused upload/submission: %#v %d %s", invalid, response.Code, response.Body.String())
		}
	}
}
