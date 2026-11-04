package generate

import (
	"bytes"
	"context"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/system"
)

func TestViduQ4ReferenceAudioCapabilityAndLimits(t *testing.T) {
	for _, model := range []string{"viduq4-preview", "vidu-q4-preview", "viduq4"} {
		payload := map[string]json.RawMessage{
			"images":   rawJSON(t, []string{"https://cdn.example/person.jpg"}),
			"audios":   rawJSON(t, []string{"https://cdn.example/voice.mp3"}),
			"ref_mode": rawJSON(t, "omni"),
		}
		if err := videoInputError(payload, model); err != "" {
			t.Fatalf("Q4 alias rejected: %s %s", model, err)
		}
		payload["ref_mode"] = rawJSON(t, "first_frame")
		if err := videoInputError(payload, model); !strings.Contains(err, "全能参考") {
			t.Fatal("first-frame accepted reference audio", err)
		}
		payload["ref_mode"] = rawJSON(t, "omni")
		payload["audio"] = rawJSON(t, false)
		if err := videoInputError(payload, model); !strings.Contains(err, "开启生成声音") {
			t.Fatal("silent video accepted reference audio", err)
		}
		delete(payload, "audio")
		delete(payload, "images")
		if err := videoInputError(payload, model); !strings.Contains(err, "需要参考图片") {
			t.Fatal("Q4 accepted audio without an image", err)
		}
		images := make([]string, 15)
		for index := range images {
			images[index] = "https://cdn.example/person.jpg"
		}
		payload["images"] = rawJSON(t, images)
		payload["audios"] = rawJSON(t, []string{"https://cdn.example/1.mp3", "https://cdn.example/2.mp3", "https://cdn.example/3.mp3"})
		if err := videoInputError(payload, model); err != "" {
			t.Fatal("Q4 rejected 15 images with 3 sounds", err)
		}
		payload["audios"] = rawJSON(t, []string{"1.mp3", "2.mp3", "3.mp3", "4.mp3"})
		if err := videoInputError(payload, model); !strings.Contains(err, "最多支持 3 个") {
			t.Fatal("Q4 accepted a fourth sound", err)
		}
	}
}

func TestViduQ4RemoteSoundsReachReferenceEndpointAndDiagnostics(t *testing.T) {
	for _, model := range []string{"viduq4-preview", "vidu-q4-preview", "viduq4"} {
		t.Run(model, func(t *testing.T) {
			const prompt = "人物使用参考音频1的音色，按本次台词口播。"
			refs := []string{"https://cdn.example/voice1.mp3?signature=private-one", "https://cdn.example/voice2.mp3"}
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				if r.URL.Path != "/vidu/v2/reference2video" {
					t.Errorf("wrong Q4 endpoint: %s", r.URL.Path)
				}
				var sent map[string]any
				_ = json.NewDecoder(r.Body).Decode(&sent)
				sounds, _ := sent["sounds"].([]any)
				if sent["model"] != model || sent["prompt"] != prompt || sent["audio"] != true || len(sounds) != 2 || sounds[0] != refs[0] || sounds[1] != refs[1] {
					t.Error("Q4 did not receive the selected sounds in order")
				}
				for _, internal := range []string{"audios", "voice_id", "preserve_prompt", "is_rec"} {
					if _, ok := sent[internal]; ok {
						t.Error("unsupported reference request field", internal)
					}
				}
				_, _ = w.Write([]byte(`{"task_id":"q4-voice-task"}`))
			}))
			defer server.Close()
			cfg := videoSubmissionTestConfig(t, server)
			handler := Video(cfg)
			payload := map[string]any{
				"model": model, "prompt": prompt, "preserve_prompt": true,
				"ref_mode": "omni", "images": []string{"https://cdn.example/person.jpg"}, "audios": refs,
				"customBaseUrl": server.URL, "customApiKey": "test-key", "clientTaskId": "q4-remote",
			}
			post := func() *httptest.ResponseRecorder {
				body, _ := json.Marshal(payload)
				req := httptest.NewRequest(http.MethodPost, "/api/generate/video", bytes.NewReader(body))
				req = req.WithContext(httpx.WithWorkspace(req.Context(), "local"))
				w := httptest.NewRecorder()
				handler.ServeHTTP(w, req)
				return w
			}
			first := post()
			var response struct {
				RecordID   string                      `json:"recordId"`
				Diagnostic *videoSubmissionDiagnostics `json:"submissionDiagnostics"`
			}
			if err := json.Unmarshal(first.Body.Bytes(), &response); err != nil || first.Code != http.StatusOK || response.Diagnostic == nil {
				t.Fatalf("Q4 audio submit failed: %d %s %v", first.Code, first.Body.String(), err)
			}
			diagnostic := response.Diagnostic
			if diagnostic.GenerateAudio == nil || !*diagnostic.GenerateAudio || diagnostic.AudioReferenceCount != 2 || diagnostic.Endpoint == nil || diagnostic.Endpoint.Path != "/vidu/v2/reference2video" {
				t.Fatalf("Q4 actual audio transport missing from receipt: %+v", diagnostic)
			}
			if diagnostic.AudioReferences[0].Role != "reference_audio" || diagnostic.AudioReferences[0].ReferenceSHA256 != videoDiagnosticDigest([]byte(refs[0])) {
				t.Fatal("Q4 receipt lost sound order or role")
			}
			if strings.Contains(first.Body.String(), "private-one") || readVideoSubmissionDiagnostics(cfg, "local", response.RecordID) == nil {
				t.Fatal("Q4 receipt leaked audio URL or was not saved")
			}
			if repeated := post(); repeated.Code != http.StatusOK || calls.Load() != 1 || !strings.Contains(repeated.Body.String(), `"reused":true`) {
				t.Fatal("Q4 audio replay submitted another generation", repeated.Body.String())
			}
		})
	}
}

func TestViduQ4LocalVoicePipelineUploadsMP3Once(t *testing.T) {
	store := &wanReferenceObjectStore{}
	root := setupWanStorage(t, store, "")
	path := writeReferenceWav(t, root, "local/audio/q4.wav", 3)
	original, _ := os.ReadFile(path)
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		var sent map[string]any
		_ = json.NewDecoder(r.Body).Decode(&sent)
		sounds, _ := sent["sounds"].([]any)
		if len(sounds) != 1 || !strings.Contains(sounds[0].(string), ".mp3?") || sent["audio"] != true {
			t.Error("local voice did not reach Q4 as MP3")
		}
		_, _ = w.Write([]byte(`{"task_id":"q4-local-task"}`))
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	cfg.Root = audioTestProjectRoot(t)
	handler := Video(cfg)
	first := postVideoWithAudio(t, handler, server.URL, "viduq4-preview", "q4-local", "/storage/local/audio/q4.wav", "local")
	if first.Code != http.StatusOK || store.calls != 1 || store.contentType != "audio/mpeg" || calls.Load() != 1 || !strings.Contains(first.Body.String(), `"sourceType":"local"`) {
		t.Fatalf("local Q4 audio failed: %d %s uploads=%d", first.Code, first.Body.String(), store.calls)
	}
	preserved, _ := os.ReadFile(path)
	if !bytes.Equal(original, preserved) {
		t.Fatal("Q4 conversion changed the voice-library source")
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if repeated := postVideoWithAudio(t, handler, server.URL, "viduq4-preview", "q4-local", "/storage/local/audio/q4.wav", "local"); repeated.Code != http.StatusOK || store.calls != 1 || calls.Load() != 1 {
		t.Fatal("Q4 replay reuploaded or regenerated local voice", repeated.Body.String())
	}
}

func TestViduQ4AudioDurationIsPerReference(t *testing.T) {
	root := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", root)
	for _, item := range []struct {
		name    string
		seconds int
	}{{"short", 2}, {"good", 8}, {"long", 13}} {
		writeReferenceWav(t, root, "local/audio/"+item.name+".wav", item.seconds)
	}
	for _, item := range []struct {
		refs  []string
		valid bool
	}{
		{[]string{"/storage/local/audio/good.wav", "/storage/local/audio/good.wav", "/storage/local/audio/good.wav"}, true},
		{[]string{"/storage/local/audio/short.wav"}, false},
		{[]string{"/storage/local/audio/long.wav"}, true},
	} {
		err := validateLocalVideoAudioReferences(context.Background(), audioTestProjectRoot(t), "viduq4-preview", item.refs, "local", false)
		if item.valid && err != nil || !item.valid && (err == nil || !strings.Contains(err.Error(), "3")) {
			t.Fatalf("Q4 per-reference duration incorrect: %v %v", item.refs, err)
		}
	}
}

func TestViduQ4FifteenSecondVoiceIsTrimmedBeforeUploadAndGeneration(t *testing.T) {
	store := &wanReferenceObjectStore{}
	root := setupWanStorage(t, store, "")
	path := writeReferenceWav(t, root, "local/audio/fifteen.wav", 15)
	original, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.URL.Path != "/vidu/v2/reference2video" {
			t.Errorf("wrong Q4 reference endpoint: %s", r.URL.Path)
		}
		var sent map[string]any
		if err := json.NewDecoder(r.Body).Decode(&sent); err != nil {
			t.Error("decode Q4 request", err)
		}
		sounds, _ := sent["sounds"].([]any)
		if len(sounds) != 1 || !strings.Contains(sounds[0].(string), ".mp3?") || sent["audio"] != true {
			t.Error("trimmed voice did not reach Q4 as a signed MP3 reference")
		}
		_, _ = w.Write([]byte(`{"task_id":"q4-trimmed-voice-task"}`))
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	cfg.Root = audioTestProjectRoot(t)
	handler := Video(cfg)
	response := postVideoWithAudio(t, handler, server.URL, "viduq4-preview", "q4-trimmed-voice", "/storage/local/audio/fifteen.wav", "local")
	if response.Code != http.StatusOK || store.calls != 1 || calls.Load() != 1 || store.contentType != "audio/mpeg" || !strings.HasSuffix(store.key, ".mp3") {
		t.Fatalf("Q4 voice was not automatically trimmed and submitted: %d %s uploads=%d calls=%d", response.Code, response.Body.String(), store.calls, calls.Load())
	}
	uploaded := filepath.Join(t.TempDir(), "uploaded.mp3")
	if err := os.WriteFile(uploaded, store.body, 0600); err != nil {
		t.Fatal(err)
	}
	submittedDuration, err := system.ProbeAudioDuration(context.Background(), cfg.Root, uploaded)
	if err != nil || submittedDuration > 12 || submittedDuration < 11.8 {
		t.Fatalf("submitted Q4 sample was not clipped to its actual 12-second limit: %.6f %v", submittedDuration, err)
	}
	preserved, err := os.ReadFile(path)
	if err != nil || !bytes.Equal(original, preserved) {
		t.Fatal("automatic Q4 clipping changed the voice-library source", err)
	}
	sourceDuration, err := system.ProbeAudioDuration(context.Background(), cfg.Root, path)
	if err != nil || math.Abs(sourceDuration-15) > 0.001 {
		t.Fatalf("original voice no longer lasts 15 seconds: %.6f %v", sourceDuration, err)
	}
	var body struct {
		Diagnostic struct {
			AudioReferences []struct {
				SourceDurationSeconds    *float64 `json:"sourceDurationSeconds"`
				SubmittedDurationSeconds *float64 `json:"submittedDurationSeconds"`
				Trimmed                  bool     `json:"trimmed"`
			} `json:"audioReferences"`
		} `json:"submissionDiagnostics"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil || len(body.Diagnostic.AudioReferences) != 1 {
		t.Fatalf("missing Q4 audio preparation diagnostic: %s %v", response.Body.String(), err)
	}
	prepared := body.Diagnostic.AudioReferences[0]
	if !prepared.Trimmed || prepared.SourceDurationSeconds == nil || prepared.SubmittedDurationSeconds == nil || math.Abs(*prepared.SourceDurationSeconds-15) > 0.001 || math.Abs(*prepared.SubmittedDurationSeconds-submittedDuration) > 0.001 {
		t.Fatalf("Q4 diagnostic does not report source and actual trimmed duration: %s", response.Body.String())
	}
	if repeated := postVideoWithAudio(t, handler, server.URL, "viduq4-preview", "q4-trimmed-voice", "/storage/local/audio/fifteen.wav", "local"); repeated.Code != http.StatusOK || store.calls != 1 || calls.Load() != 1 || !strings.Contains(repeated.Body.String(), `"reused":true`) || !strings.Contains(repeated.Body.String(), `"trimmed":true`) {
		t.Fatal("Q4 clipped voice replay uploaded or generated again, or lost its receipt", repeated.Body.String())
	}
}

func TestViduQ4PreservesManagedFirstFramePromptWithoutChangingReferenceSchema(t *testing.T) {
	for _, mode := range []string{"first_frame", "omni"} {
		adapted := buildVideoPayload("viduq4-preview", "原样保留台词", map[string]json.RawMessage{
			"preserve_prompt": rawJSON(t, true), "ref_mode": rawJSON(t, mode), "images": rawJSON(t, []string{"https://cdn.example/person.jpg"}),
		})
		value, set := adapted.payload["is_rec"]
		if mode == "first_frame" && (!set || value != false) || mode == "omni" && set {
			t.Fatalf("Q4 prompt extension policy mismatch: %s %#v", mode, adapted.payload)
		}
	}
}
