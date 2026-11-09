package generate

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
	"encoding/base64"
	"encoding/json"
	"image/color"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
)

func TestGrokVoiceIDsSchema(t *testing.T) {
	for _, value := range []any{nil, "eve", []any{1}, []string{""}, []string{"  "}, []string{strings.Repeat("a", 65)}, []string{"eve", "leo", "ara", "rex"}} {
		body := map[string]json.RawMessage{"prompt": rawJSON(t, "口播"), "voice_ids": rawJSON(t, value)}
		if message := videoBodyError(body); message == "" {
			t.Fatalf("malformed voice_ids accepted: %#v", value)
		}
	}
	for _, ids := range [][]string{{}, {"eve"}, {" EVE ", "Leo", "new-preset"}} {
		if message := videoBodyError(map[string]json.RawMessage{"prompt": rawJSON(t, "口播"), "voice_ids": rawJSON(t, ids)}); message != "" {
			t.Fatalf("valid voice_ids rejected: %v %s", ids, message)
		}
	}
}

func TestGrokVoiceIDsCapability(t *testing.T) {
	for _, mode := range []string{"omni", "text", "first_frame", "first_last_frame"} {
		payload := map[string]json.RawMessage{"voice_ids": rawJSON(t, []string{"eve"}), "resolution": rawJSON(t, "720P")}
		if message := grokVoiceInputError(payload, "grok-imagine-video-1.5", mode); message != "" {
			t.Fatalf("Grok generation mode %s rejected: %s", mode, message)
		}
	}
	for _, item := range []struct {
		model, mode, field, message string
		value                       any
	}{
		{"grok-imagine-video", "omni", "", "仅支持", nil},
		{"grok-imagine-video-1.5-lite", "omni", "", "仅支持", nil},
		{"veo3.1", "omni", "", "仅支持", nil},
		{"grok-imagine-video-1.5", "edit", "", "编辑和延长", nil},
		{"grok-imagine-video-1.5", "extend", "", "编辑和延长", nil},
		{"grok-imagine-video-1.5", "omni", "audio", "开启生成声音", false},
		{"grok-imagine-video-1.5", "first_frame", "resolution", "最高支持 720P", "1080p"},
		{"grok-imagine-video-1.5", "omni", "audios", "不能与自定义声音样本同时使用", []string{"https://cdn.example/voice.mp3"}},
	} {
		payload := map[string]json.RawMessage{"voice_ids": rawJSON(t, []string{"eve"})}
		if item.field != "" {
			payload[item.field] = rawJSON(t, item.value)
		}
		if message := grokVoiceInputError(payload, item.model, item.mode); !strings.Contains(message, item.message) {
			t.Fatalf("%s %s message=%q want=%q", item.model, item.mode, message, item.message)
		}
	}
	if message := videoAudioInputError(map[string]json.RawMessage{"audios": rawJSON(t, []string{"https://cdn.example/voice.mp3"})}, "grok-imagine-video-1.5", "omni", 1); !strings.Contains(message, "xAI 专门权限") {
		t.Fatalf("Grok custom audio must explain the permission limitation: %s", message)
	}
}

func TestGrokVoiceValidationRejectsBeforeUpstream(t *testing.T) {
	for _, body := range []string{
		`{"prompt":"口播","model":"grok-imagine-video-1.5","voice_ids":["eve"],"audio":false}`,
		`{"prompt":"口播","model":"grok-imagine-video-1.5","voice_ids":["eve"],"resolution":"1080P"}`,
		`{"prompt":"口播","model":"grok-imagine-video-1.5","audios":["https://cdn.example/voice.mp3"]}`,
		`{"prompt":"口播","model":"grok-imagine-video-1.5","voice_ids":["eve","leo","ara","rex"]}`,
	} {
		response := httptest.NewRecorder()
		Video(config.Config{}).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/video", strings.NewReader(body)))
		if response.Code != http.StatusBadRequest || strings.Contains(response.Body.String(), "API Key") || strings.Contains(response.Body.String(), "任务保存失败") {
			t.Fatalf("invalid voice request reached submission: %d %s", response.Code, response.Body.String())
		}
	}
}

func TestGrokPresetVoiceReachesUpstreamWithoutAudioFiles(t *testing.T) {
	const prompt = "<IMAGE_0>中的人物使用<AUDIO_0>的声音说：欢迎光临。"
	root := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", root)
	imagePath, imageBytes := writeViduReferencePNG(t, root, "local/person.png", color.RGBA{R: 180, A: 255})
	inline := "data:image/png;base64," + base64.StdEncoding.EncodeToString(imageBytes)
	var calls, queries atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			queries.Add(1)
			if r.URL.Path != "/v1/videos/grok-voice-task" {
				t.Errorf("unexpected Grok poll route: %s", r.URL.Path)
			}
			_, _ = w.Write([]byte(`{"status":"done","video":{"url":"https://cdn.example/grok-voice.mp4"}}`))
			return
		}
		calls.Add(1)
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		voices, _ := body["reference_audios"].([]any)
		if len(voices) != 2 || voices[0].(map[string]any)["voice_id"] != "eve" || voices[1].(map[string]any)["voice_id"] != "leo" {
			t.Errorf("preset voices missing or not normalized: %#v", body)
		}
		images, _ := body["reference_images"].([]any)
		if len(images) != 1 || images[0].(map[string]any)["url"] != inline {
			t.Errorf("local Grok reference image was not prepared: %#v", body)
		}
		if r.Method != http.MethodPost || r.URL.Path != "/v1/videos/generations" || body["voice_ids"] != nil || body["audios"] != nil || body["prompt"] != prompt {
			t.Errorf("unexpected Grok preset voice request: %s %s %#v", r.Method, r.URL.Path, body)
		}
		_, _ = w.Write([]byte(`{"request_id":"grok-voice-task"}`))
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	videoQueries = sync.Map{}
	target, _ := url.Parse(server.URL)
	gateway.ModelHTTP = func() *http.Client {
		return &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
			if request.URL.Host != "api.x.ai" {
				t.Errorf("request did not target the official xAI host: %s", request.URL.Host)
			}
			local := request.Clone(request.Context())
			local.URL.Scheme, local.URL.Host = target.Scheme, target.Host
			return http.DefaultTransport.RoundTrip(local)
		})}
	}
	body, _ := json.Marshal(map[string]any{
		"prompt": prompt, "model": "grok-imagine-video-1.5", "duration": 5, "resolution": "720P",
		"ref_mode": "omni", "audio": true, "images": []string{"/storage/local/person.png"},
		"voice_ids": []string{" EVE ", "Leo"}, "preserve_prompt": true,
		"customBaseUrl": "https://api.x.ai/v1", "customApiKey": "test-key", "clientTaskId": "grok-voice-reference",
	})
	post := func() *httptest.ResponseRecorder {
		request := httptest.NewRequest(http.MethodPost, "/api/generate/video", strings.NewReader(string(body)))
		request = request.WithContext(httpx.WithWorkspace(request.Context(), "local"))
		response := httptest.NewRecorder()
		Video(cfg).ServeHTTP(response, request)
		return response
	}
	response := post()
	if response.Code != http.StatusOK || calls.Load() != 1 || !strings.Contains(response.Body.String(), `"taskId":"grok-voice-task"`) {
		t.Fatalf("Grok voice request failed: %d %s calls=%d", response.Code, response.Body.String(), calls.Load())
	}
	var receipt struct {
		RecordID   string                      `json:"recordId"`
		Diagnostic *videoSubmissionDiagnostics `json:"submissionDiagnostics"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &receipt); err != nil || receipt.Diagnostic == nil {
		t.Fatalf("Grok voice diagnostic missing: %s %v", response.Body.String(), err)
	}
	diagnostic := receipt.Diagnostic
	if diagnostic.AudioReferenceCount != 2 || len(diagnostic.AudioReferences) != 2 || diagnostic.Endpoint == nil || diagnostic.Endpoint.Host != "api.x.ai" || diagnostic.Endpoint.Path != "/v1/videos/generations" {
		t.Fatalf("Grok voice transport evidence missing: %+v", diagnostic)
	}
	for index, id := range []string{"eve", "leo"} {
		voice := diagnostic.AudioReferences[index]
		if voice.Role != "reference_voice" || voice.SourceType != "preset" || voice.VoiceID != id || voice.ReferenceSHA256 != videoDiagnosticDigest([]byte(id)) || voice.SourceDurationSeconds != 0 || voice.SourceSHA256 != "" {
			t.Fatalf("preset voice was recorded as a file reference: %+v", voice)
		}
	}
	if saved := readVideoSubmissionDiagnostics(cfg, "local", receipt.RecordID); saved == nil || saved.AudioReferences[0].VoiceID != "eve" {
		t.Fatalf("preset voice diagnostic was not saved: %+v", saved)
	}
	if err := os.Remove(imagePath); err != nil {
		t.Fatal(err)
	}
	repeated := post()
	if repeated.Code != http.StatusOK || calls.Load() != 1 || !strings.Contains(repeated.Body.String(), `"reused":true`) {
		t.Fatalf("accepted Grok retry reprocessed local media or resubmitted: %d %s calls=%d", repeated.Code, repeated.Body.String(), calls.Load())
	}
	// Polling after route memory is cleared must still use the official path.
	videoQueries = sync.Map{}
	request := httptest.NewRequest(http.MethodGet, "/api/generate/video?taskId=grok-voice-task&model=grok-imagine-video-1.5", nil)
	request = request.WithContext(httpx.WithWorkspace(request.Context(), "local"))
	request.Header.Set("x-custom-base-url", "https://api.x.ai/v1")
	request.Header.Set("x-custom-api-key", "test-key")
	polled := httptest.NewRecorder()
	Video(cfg).ServeHTTP(polled, request)
	if polled.Code != http.StatusOK || queries.Load() != 1 || !strings.Contains(polled.Body.String(), `"status":"SUCCESS"`) || !strings.Contains(polled.Body.String(), "https://cdn.example/grok-voice.mp4") {
		t.Fatalf("Grok request_id/video.url polling failed: %d %s queries=%d", polled.Code, polled.Body.String(), queries.Load())
	}
}

func TestGrokRoutesOfficialAndProxyBases(t *testing.T) {
	for _, item := range []struct {
		base, root string
	}{
		{"https://api.x.ai", "https://api.x.ai"},
		{"https://api.x.ai/v1/", "https://api.x.ai"},
		{"https://us.api.x.ai/v1", "https://us.api.x.ai"},
		{"https://gateway.example/v1", "https://gateway.example/xai"},
		{"https://gateway.example/xai/v1", "https://gateway.example/xai"},
		{"https://api.x.ai.proxy.example", "https://api.x.ai.proxy.example/xai"},
	} {
		for _, mode := range []string{"omni", "first_frame", "first_last_frame", "text", "edit", "extend"} {
			submit, query := routeGrokEndpoints(item.base, mode)
			if len(submit) != 1 || submit[0] != item.root+"/v1/videos/"+grokSubmitPath(mode) {
				t.Fatalf("%s %s submit %v", item.base, mode, submit)
			}
			if len(query) != 1 || query[0] != item.root+"/v1/videos/{taskId}" {
				t.Fatalf("%s query %v", item.base, query)
			}
		}
		poll := videoPollURLs(item.base, "request-123", "grok-imagine-video-1.5", "")
		if len(poll) == 0 || poll[0] != item.root+"/v1/videos/request-123" {
			t.Fatalf("%s poll %v", item.base, poll)
		}
		if grokOfficialHost(item.base) && len(poll) != 1 {
			t.Fatalf("official poll tried unrelated APIs: %v", poll)
		}
	}
}

func TestGrokOfficialClipModesDoNotSilentlyChangeModels(t *testing.T) {
	if message := videoInputError(map[string]json.RawMessage{"ref_mode": rawJSON(t, "text")}, "grok-imagine-video-1.5", "https://us.api.x.ai/v1"); !strings.Contains(message, "区域端点") {
		t.Fatalf("US endpoint should fail before submission: %s", message)
	}
	for _, mode := range []string{"edit", "extend"} {
		payload := map[string]json.RawMessage{
			"ref_mode": rawJSON(t, mode), "videos": rawJSON(t, []string{"https://cdn.example/clip.mp4"}),
			"duration": rawJSON(t, 6), "resolution": rawJSON(t, "720P"),
		}
		if message := videoInputError(payload, "grok-imagine-video-1.5", "https://api.x.ai/v1"); !strings.Contains(message, "暂不支持") {
			t.Fatalf("%s official 1.5: %s", mode, message)
		}
		if message := videoInputError(payload, "grok-imagine-video", "https://api.x.ai/v1"); message != "" {
			t.Fatalf("%s official legacy: %s", mode, message)
		}
		if message := videoInputError(payload, "grok-imagine-video-1.5", "https://gateway.example"); message != "" {
			t.Fatalf("%s proxy alias: %s", mode, message)
		}
	}
}

func TestGrokReferenceResolutionMatchesOfficialLimit(t *testing.T) {
	for _, mode := range []string{"omni", "first_last_frame"} {
		if message := videoSpecError("grok-imagine-video-1.5", mode, "1080P", "9:16", 5); message == "" {
			t.Fatalf("%s accepted 1080p reference generation", mode)
		}
		if message := videoSpecError("grok-imagine-video-1.5", mode, "720P", "9:16", 5); message != "" {
			t.Fatalf("%s 720p: %s", mode, message)
		}
	}
	for _, mode := range []string{"text", "first_frame"} {
		if message := videoSpecError("grok-imagine-video-1.5", mode, "1080P", "9:16", 5); message != "" {
			t.Fatalf("%s 1080p: %s", mode, message)
		}
	}
}
