package generate

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestSynthesizeSpeechBinaryJSONAndFailure(t *testing.T) {
	audio := []byte("ID3unit-test-audio")
	var mode string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch mode {
		case "binary":
			w.Header().Set("Content-Type", "audio/mpeg")
			_, _ = w.Write(audio)
		case "json":
			_, _ = w.Write([]byte(`{"data":{"audio":"` + hex.EncodeToString(audio) + `"}}`))
		default:
			w.WriteHeader(http.StatusBadGateway)
			_, _ = w.Write([]byte(`{"message":"quota exceeded"}`))
		}
	}))
	defer server.Close()
	previous := gateway.ModelHTTP
	gateway.ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { gateway.ModelHTTP = previous })

	req := SpeechRequest{Base: server.URL, APIKey: "secret", Model: "speech-01-hd", Text: "你好", Voice: "alloy", Format: "mp3"}
	mode = "binary"
	binary, err := SynthesizeSpeech(context.Background(), req)
	if err != nil || string(binary.Bytes) != string(audio) {
		t.Fatalf("binary %#v %v", binary, err)
	}
	mode = "json"
	encoded, err := SynthesizeSpeech(context.Background(), req)
	if err != nil || string(encoded.Bytes) != string(audio) {
		t.Fatalf("json %#v %v", encoded, err)
	}
	mode = "fail"
	_, err = SynthesizeSpeech(context.Background(), req)
	if err == nil || !strings.Contains(err.Error(), "quota exceeded") {
		t.Fatalf("failure %v", err)
	}
}

func TestSynthesizeSpeechFallbackOnlyForUnsupportedEndpoint(t *testing.T) {
	audio := []byte("ID3fallback-audio")
	var hits []string
	status := http.StatusNotFound
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits = append(hits, r.URL.Path)
		if r.URL.Path == "/v1/t2a_v2" {
			w.WriteHeader(status)
			_, _ = w.Write([]byte(`{"message":"upstream down"}`))
			return
		}
		w.Header().Set("Content-Type", "audio/mpeg")
		_, _ = w.Write(audio)
	}))
	defer server.Close()
	previous := gateway.ModelHTTP
	gateway.ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { gateway.ModelHTTP = previous })

	for _, firstStatus := range []int{http.StatusNotFound, http.StatusBadGateway} {
		status = firstStatus
		hits = nil
		result, err := SynthesizeSpeech(context.Background(), SpeechRequest{
			Base: server.URL, APIKey: "secret", Model: "speech-2.8-hd", Text: "你好", Voice: "alloy", Format: "mp3",
		})
		if firstStatus == http.StatusBadGateway {
			var submissionErr *SpeechSubmissionError
			if !errors.As(err, &submissionErr) || !submissionErr.Unknown || len(result.Bytes) != 0 || len(hits) != 1 {
				t.Fatalf("uncertain submission retried or accepted: %#v %v hits %v", result, err, hits)
			}
			continue
		}
		if err != nil || string(result.Bytes) != string(audio) {
			t.Fatalf("fallback %#v %v hits %v", result, err, hits)
		}
		if len(hits) != 2 || hits[0] != "/v1/t2a_v2" || hits[1] != "/v1/audio/speech" {
			t.Fatalf("hits %v", hits)
		}
	}
}

func TestSpeechFamilyRouting(t *testing.T) {
	if speechFamily("speech-2.8-hd") != "minimax" || speechFamily("eleven_multilingual_v2") != "elevenlabs" {
		t.Fatal("family names")
	}
	if speechFamily("cosyvoice-v2") != "cosyvoice" || speechFamily("doubao-tts") != "doubao" || speechFamily("tts-1") != "openai" {
		t.Fatal("family names")
	}
	attempts := speechAttempts(SpeechRequest{Base: "https://gw.example", Model: "speech-2.8-hd", Text: "你好", Voice: "female"})
	if len(attempts) != 2 || !strings.Contains(attempts[0].Endpoint, "/v1/t2a_v2") || !strings.Contains(attempts[1].Endpoint, "/v1/audio/speech") {
		t.Fatalf("minimax attempts %#v", attempts)
	}
	eleven := speechAttempts(SpeechRequest{Base: "https://gw.example", Model: "eleven_multilingual_v2", Text: "hi", Voice: "voice_1"})
	if !strings.Contains(eleven[0].Endpoint, "/v1/text-to-speech/voice_1") {
		t.Fatalf("eleven endpoint %s", eleven[0].Endpoint)
	}
}

func TestS10CanvasSpeechDisconnectQueriesOriginalWorkspaceReceipt(t *testing.T) {
	started, release := make(chan struct{}), make(chan struct{})
	var calls atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		close(started)
		<-release
		_, _ = w.Write([]byte(`{"audio_url":"https://media.example/canvas.mp3","usage":{"total_tokens":7}}`))
	}))
	defer upstream.Close()
	cfg := videoSubmissionTestConfig(t, upstream)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	r := httptest.NewRequest(http.MethodPost, "/api/generate/audio", strings.NewReader(`{"model":"speech-2.8-hd","prompt":"hello","clientTaskId":"studio-canvas-original"}`))
	r = r.WithContext(httpx.WithWorkspace(ctx, "canvas-owner"))
	r.Header.Set("x-custom-base-url", upstream.URL)
	r.Header.Set("x-custom-api-key", "test-only")
	r.Header.Set("x-idempotency-key", "studio-canvas-original")
	done := make(chan struct{})
	go func() { defer close(done); Audio(cfg).ServeHTTP(httptest.NewRecorder(), r) }()
	select {
	case <-started:
	case <-time.After(3 * time.Second):
		close(release)
		t.Fatal("canvas speech did not dispatch")
	}
	poll := func(workspace string) *httptest.ResponseRecorder {
		request := httptest.NewRequest(http.MethodGet, "/api/generate/audio?taskKey=studio-canvas-original", nil)
		request = request.WithContext(httpx.WithWorkspace(request.Context(), workspace))
		// Recovery reads the original receipt even if today's channel is absent or changed.
		request.Header.Set("x-custom-base-url", "https://changed.invalid")
		request.Header.Set("x-custom-api-key", "changed-test-only")
		response := httptest.NewRecorder()
		Audio(cfg).ServeHTTP(response, request)
		return response
	}
	pending := poll("canvas-owner")
	if !strings.Contains(pending.Body.String(), `"submissionUnknown":true`) || calls.Load() != 1 {
		t.Errorf("pending receipt: %d %s calls=%d", pending.Code, pending.Body.String(), calls.Load())
	}
	cancel()
	close(release)
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("disconnected canvas speech did not settle")
	}
	for i := 0; i < 2; i++ {
		recovered := poll("canvas-owner")
		if recovered.Code != 200 || !strings.Contains(recovered.Body.String(), "canvas.mp3") || !strings.Contains(recovered.Body.String(), `"totalTokens":7`) {
			t.Fatalf("recovered receipt: %d %s", recovered.Code, recovered.Body.String())
		}
	}
	other := poll("another-workspace")
	if strings.Contains(other.Body.String(), "canvas.mp3") || calls.Load() != 1 {
		t.Fatalf("workspace leak or resubmission: %s calls=%d", other.Body.String(), calls.Load())
	}
}

func TestAudioValidationAndSubmission(t *testing.T) {
	handler := Audio(config.Config{NodeEnv: "production", DatabaseURL: "file:" + imageTaskDatabase(t), Root: t.TempDir()})

	emptyReq := httptest.NewRequest(http.MethodPost, "/api/generate/audio", strings.NewReader(`{"prompt":"  "}`))
	emptyResp := httptest.NewRecorder()
	handler.ServeHTTP(emptyResp, emptyReq)
	if emptyResp.Code != http.StatusBadRequest || !strings.Contains(emptyResp.Body.String(), "音频生成文本不能为空") {
		t.Fatalf("expected 400 for empty prompt, got %d: %s", emptyResp.Code, emptyResp.Body.String())
	}

	missingReq := httptest.NewRequest(http.MethodPost, "/api/generate/audio", strings.NewReader(`{"prompt":"欢迎使用贝壳云图音频生成","model":"speech-2.8-hd","format":"mp3"}`))
	missingResp := httptest.NewRecorder()
	handler.ServeHTTP(missingResp, missingReq)
	if missingResp.Code != http.StatusBadRequest || !strings.Contains(missingResp.Body.String(), "未配置音频接口") {
		t.Fatalf("expected 400 without gateway, got %d: %s", missingResp.Code, missingResp.Body.String())
	}
	if !strings.Contains(missingResp.Body.String(), `"submissionRejected":true`) || !strings.Contains(missingResp.Body.String(), `"submissionUnknown":false`) {
		t.Fatalf("missing credentials must be rejected before submission: %s", missingResp.Body.String())
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/t2a_v2" {
			t.Errorf("path %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "audio/mpeg")
		_, _ = w.Write([]byte("ID3fake-audio"))
	}))
	defer server.Close()
	previous := gateway.ModelHTTP
	gateway.ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { gateway.ModelHTTP = previous })
	handler = Audio(config.Config{NodeEnv: "production", DatabaseURL: "file:" + imageTaskDatabase(t)})
	validReq := httptest.NewRequest(http.MethodPost, "/api/generate/audio", strings.NewReader(`{"prompt":"欢迎使用贝壳云图音频生成","model":"speech-2.8-hd","format":"mp3","customBaseUrl":"`+server.URL+`","customApiKey":"secret"}`))
	validResp := httptest.NewRecorder()
	handler.ServeHTTP(validResp, validReq)
	if validResp.Code != http.StatusOK || !strings.Contains(validResp.Body.String(), `"success":true`) || !strings.Contains(validResp.Body.String(), "/storage/") {
		t.Fatalf("expected saved audio, got %d: %s", validResp.Code, validResp.Body.String())
	}

	// 3. GET 缺少参数
	missingPollReq := httptest.NewRequest(http.MethodGet, "/api/generate/audio", nil)
	missingPollResp := httptest.NewRecorder()
	handler.ServeHTTP(missingPollResp, missingPollReq)
	if missingPollResp.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing poll params, got %d", missingPollResp.Code)
	}

	// 4. POST 非法音频格式拦截
	badFormatReq := httptest.NewRequest(http.MethodPost, "/api/generate/audio", strings.NewReader(`{"prompt":"测试格式校验","model":"speech-2.8-hd","format":"../sh"}`))
	badFormatResp := httptest.NewRecorder()
	handler.ServeHTTP(badFormatResp, badFormatReq)
	if badFormatResp.Code != http.StatusBadRequest || !strings.Contains(badFormatResp.Body.String(), "不支持的音频格式") {
		t.Fatalf("expected 400 for unsupported audio format, got %d: %s", badFormatResp.Code, badFormatResp.Body.String())
	}
}

func TestAudioValidationCannotBypassExistingReceipt(t *testing.T) {
	t.Setenv("AI_AUDIO_API_KEY", "")
	t.Setenv("AI_API_KEY", "")
	started, release := make(chan struct{}), make(chan struct{})
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) == 1 {
			close(started)
			<-release
		}
		_, _ = w.Write([]byte(`{"audio_url":"https://media.example/original.mp3"}`))
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	cfg.Root = t.TempDir()
	handler := Audio(cfg)
	first := make(chan *httptest.ResponseRecorder, 1)
	go func() { first <- audioSubmissionRequest(handler, server.URL, "protected", "hello", "owner") }()
	select {
	case <-started:
	case <-time.After(3 * time.Second):
		close(release)
		t.Fatal("not dispatched")
	}
	var releaseOnce sync.Once
	releaseOriginal := func() { releaseOnce.Do(func() { close(release) }) }
	defer releaseOriginal()
	variants := []map[string]any{
		{"prompt": "hello", "customBaseUrl": server.URL},
		{"prompt": "", "customBaseUrl": server.URL, "customApiKey": "test-only"},
		{"prompt": "hello", "customBaseUrl": server.URL, "customApiKey": "changed"},
	}
	for _, payload := range variants {
		payload["model"] = "speech-2.8-hd"
		payload["clientTaskId"] = "protected"
		raw, _ := json.Marshal(payload)
		r := httptest.NewRequest("POST", "/api/generate/audio", strings.NewReader(string(raw)))
		r.Header.Set("x-idempotency-key", "protected")
		r = r.WithContext(httpx.WithWorkspace(r.Context(), "owner"))
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != 409 || !strings.Contains(w.Body.String(), `"submissionUnknown":true`) || strings.Contains(w.Body.String(), `"submissionRejected":true`) {
			t.Errorf("existing receipt bypassed: %d %s", w.Code, w.Body.String())
		}
	}
	pending := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/generate/audio?taskKey=protected", nil)
	handler.ServeHTTP(pending, r.WithContext(httpx.WithWorkspace(r.Context(), "owner")))
	if pending.Code != 200 || !strings.Contains(pending.Body.String(), `"submissionUnknown":true`) || calls.Load() != 1 {
		t.Fatalf("original pending receipt lost: %d calls=%d", pending.Code, calls.Load())
	}
	releaseOriginal()
	original := <-first
	if original.Code != 200 {
		t.Fatalf("original failed: %d %s", original.Code, original.Body.String())
	}
	replay := audioSubmissionRequest(Audio(cfg), server.URL, "protected", "hello", "owner")
	if replay.Code != 200 || !strings.Contains(replay.Body.String(), `"replayed":true`) || !strings.Contains(replay.Body.String(), "original.mp3") || calls.Load() != 1 {
		t.Fatalf("original replay lost: %d %s calls=%d", replay.Code, replay.Body.String(), calls.Load())
	}
	changed := audioSubmissionRequest(Audio(cfg), server.URL, "protected", "changed", "owner")
	if changed.Code != 409 || calls.Load() != 1 {
		t.Fatalf("completed receipt allowed replacement: %d calls=%d", changed.Code, calls.Load())
	}
}

func TestAudioValidationRejectionIsDurable(t *testing.T) {
	t.Setenv("AI_AUDIO_API_KEY", "")
	t.Setenv("AI_API_KEY", "")
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1) }))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	cfg.Root = t.TempDir()
	for _, body := range []string{
		`{"clientTaskId":"missing-key","prompt":"hello"}`,
		`{"clientTaskId":"empty-prompt","prompt":"","customApiKey":"test-only"}`,
	} {
		var payload map[string]string
		_ = json.Unmarshal([]byte(body), &payload)
		for i := 0; i < 2; i++ {
			r := httptest.NewRequest("POST", "/api/generate/audio", strings.NewReader(body))
			w := httptest.NewRecorder()
			Audio(cfg).ServeHTTP(w, r)
			if w.Code != 400 || !strings.Contains(w.Body.String(), `"submissionRejected":true`) || (i == 1 && !strings.Contains(w.Body.String(), `"replayed":true`)) {
				t.Errorf("validation not durably replayed: %d %s", w.Code, w.Body.String())
			}
		}
		w := httptest.NewRecorder()
		Audio(cfg).ServeHTTP(w, httptest.NewRequest("GET", "/api/generate/audio?taskKey="+payload["clientTaskId"], nil))
		if w.Code != 400 || !strings.Contains(w.Body.String(), `"submissionRejected":true`) {
			t.Errorf("rejected receipt missing: %d %s", w.Code, w.Body.String())
		}
	}
	if calls.Load() != 0 {
		t.Fatalf("invalid requests called upstream %d times", calls.Load())
	}
}
