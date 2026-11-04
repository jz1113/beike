package generate

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"beike.local/cloud/src/backend/internal/httpx"
)

func TestVideoReferenceAudioSchemaAndCapability(t *testing.T) {
	for _, malformed := range []any{nil, "voice.mp3", []any{1}, []string{""}, []string{"  "}, make([]string, 11)} {
		if message := videoBodyError(map[string]json.RawMessage{"prompt": rawJSON(t, "口播"), "audios": rawJSON(t, malformed)}); message == "" {
			t.Fatalf("malformed audio list accepted: %#v", malformed)
		}
	}
	for _, item := range []struct {
		model, mode, message string
		count, visuals       int
		audio                bool
	}{
		{"doubao-seedance-2.5", "omni", "", 10, 0, true},
		{"doubao-seedance-2-0-fast-260128", "omni", "", 3, 1, true},
		{"wan3.0-video", "omni", "", 5, 0, true},
		{"doubao-seedance-2.5", "omni", "10 个", 11, 1, true},
		{"doubao-seedance-2.0-mini", "omni", "3 个", 4, 1, true},
		{"wan3.0-video", "omni", "5 个", 6, 1, true},
		{"doubao-seedance-2.0-mini", "omni", "至少搭配", 1, 0, true},
		{"doubao-seedance-1-0-pro-250528", "omni", "尚未接入参考音频", 1, 1, true},
		{"MiniMax-H3", "omni", "", 3, 0, true},
		{"h3", "omni", "", 1, 1, true},
		{"MiniMax-H3", "omni", "3 个", 4, 1, true},
		{"MiniMax-H3", "first_frame", "全能参考", 1, 1, true},
		{"MiniMax-H3", "omni", "开启生成声音", 1, 1, false},
		{"wan3.1-video", "omni", "尚未接入参考音频", 1, 1, true},
		{"wan3.5-video", "omni", "尚未接入参考音频", 1, 1, true},
		{"doubao-seedance-2.0-mini", "omni", "", 1, 11, true},
		{"doubao-seedance-2.0-mini", "omni", "合计最多 12", 1, 12, true},
		{"doubao-seedance-2.5", "omni", "", 10, 40, true},
		{"doubao-seedance-2.5", "omni", "合计最多 50", 10, 41, true},
		{"wan3.0-video", "first_frame", "全能参考", 1, 1, true},
		{"doubao-seedance-2.5", "omni", "开启生成声音", 1, 1, false},
	} {
		audios := make([]string, item.count)
		for i := range audios {
			audios[i] = "https://cdn.example/voice.wav"
		}
		payload := map[string]json.RawMessage{"audios": rawJSON(t, audios), "audio": rawJSON(t, item.audio)}
		message := videoAudioInputError(payload, item.model, item.mode, item.visuals)
		if (item.message == "" && message != "") || (item.message != "" && !strings.Contains(message, item.message)) {
			t.Fatalf("model=%s count=%d message=%q want=%q", item.model, item.count, message, item.message)
		}
	}
	if message := videoAudioInputError(nil, "veo3.1", "first_frame", 1); message != "" {
		t.Fatal("legacy calls without reference audio changed", message)
	}
}

func TestVideoReferenceAudioKeepsHTTPSAlongsideRegisteredVisualAssets(t *testing.T) {
	const audioURL = "https://cdn.example/voice.wav?signature=a%2Fb&expires=100"
	for _, model := range []string{"doubao-seedance-2.0-mini", "doubao-seedance-2.5", "wan3.0-video"} {
		t.Run(model, func(t *testing.T) {
			seedanceAssetCache = sync.Map{}
			var generationCalls, audioRegistrations, imageRegistrations, videoRegistrations atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var body map[string]any
				_ = json.NewDecoder(r.Body).Decode(&body)
				if r.URL.Path == "/seedance/v3/assets/create" {
					kind, _ := body["assetType"].(string)
					switch kind {
					case "Audio":
						audioRegistrations.Add(1)
					case "Image":
						imageRegistrations.Add(1)
					case "Video":
						videoRegistrations.Add(1)
					}
					_, _ = w.Write([]byte(`{"code":0,"data":{"assetId":"audio-test-` + kind + `","status":"Active"}}`))
					return
				}
				generationCalls.Add(1)
				if strings.Contains(model, "seedance") {
					content := body["content"].([]any)
					last := content[len(content)-1].(map[string]any)
					if last["type"] != "audio_url" || last["role"] != "reference_audio" || last["audio_url"].(map[string]any)["url"] != audioURL || body["generate_audio"] != true {
						t.Errorf("selected voice missing from Seedance request: %#v", body)
					}
					for _, raw := range content {
						item := raw.(map[string]any)
						for _, pair := range [][2]string{{"image_url", "Image"}, {"video_url", "Video"}} {
							if item["type"] == pair[0] && item[pair[0]].(map[string]any)["url"] != "asset://audio-test-"+pair[1] {
								t.Errorf("visual asset registration was lost: %#v", item)
							}
						}
					}
				} else {
					input := body["input"].(map[string]any)
					media := input["media"].([]any)
					last := media[len(media)-1].(map[string]any)
					if last["type"] != "reference_audio" || last["url"] != audioURL || body["parameters"].(map[string]any)["audio"] != true {
						t.Errorf("selected voice missing from Wan request: %#v", body)
					}
				}
				_, _ = w.Write([]byte(`{"task_id":"voice-reference-task"}`))
			}))
			defer server.Close()
			storeSeedanceCachedURI(seedanceAssetScope{base: server.URL, apiKey: "secret", model: model}, "Audio", audioURL, "asset://legacy-cached-audio")
			cfg := videoSubmissionTestConfig(t, server)
			response := postVideoWithAudio(t, Video(cfg), server.URL, model, "voice-real-input", audioURL, "local", "https://cdn.example/action.mp4")
			if response.Code != 200 || generationCalls.Load() != 1 {
				t.Fatalf("audio generation request failed: %d %s calls=%d", response.Code, response.Body.String(), generationCalls.Load())
			}
			if audioRegistrations.Load() != 0 {
				t.Fatalf("HTTP audio was registered as an asset: %d", audioRegistrations.Load())
			}
			if strings.Contains(model, "seedance") && (imageRegistrations.Load() != 1 || videoRegistrations.Load() != 1) {
				t.Fatalf("visual assets were not registered: images=%d videos=%d", imageRegistrations.Load(), videoRegistrations.Load())
			}
		})
	}
}

func postVideoWithAudio(t *testing.T, handler http.Handler, base, model, key, ref, workspace string, videos ...string) *httptest.ResponseRecorder {
	t.Helper()
	payload := map[string]any{
		"prompt": "音频1只提供所选人声，台词按分镜", "model": model, "duration": 5, "resolution": "720P",
		"ref_mode": "omni", "audio": true, "images": []string{"https://cdn.example/person.jpg"}, "audios": []string{ref},
		"customBaseUrl": base, "customApiKey": "test-key", "clientTaskId": key, "storageConfig": json.RawMessage(wanOSSStorageJSON),
	}
	if len(videos) > 0 {
		payload["videos"] = videos
	}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/api/generate/video", bytes.NewReader(body))
	req = req.WithContext(httpx.WithWorkspace(req.Context(), workspace))
	req.Header.Set("x-idempotency-key", key)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	return w
}

func writeReferenceWav(t *testing.T, root, rel string, seconds int) string {
	t.Helper()
	dataSize := seconds * 8000 * 2
	body := make([]byte, 44+dataSize)
	copy(body[0:4], "RIFF")
	binary.LittleEndian.PutUint32(body[4:8], uint32(len(body)-8))
	copy(body[8:16], "WAVEfmt ")
	binary.LittleEndian.PutUint32(body[16:20], 16)
	binary.LittleEndian.PutUint16(body[20:22], 1)
	binary.LittleEndian.PutUint16(body[22:24], 1)
	binary.LittleEndian.PutUint32(body[24:28], 8000)
	binary.LittleEndian.PutUint32(body[28:32], 16000)
	binary.LittleEndian.PutUint16(body[32:34], 2)
	binary.LittleEndian.PutUint16(body[34:36], 16)
	copy(body[36:40], "data")
	binary.LittleEndian.PutUint32(body[40:44], uint32(dataSize))
	path := filepath.Join(root, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, body, 0600); err != nil {
		t.Fatal(err)
	}
	return path
}

func audioTestProjectRoot(t *testing.T) string {
	t.Helper()
	root, err := filepath.Abs(filepath.Join("..", "..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	return root
}

func TestLocalVoiceAudioUploadIsSignedAndIdempotent(t *testing.T) {
	for _, model := range []string{"doubao-seedance-2.0-mini", "doubao-seedance-2.5", "wan3.0-video"} {
		t.Run(model, func(t *testing.T) {
			seedanceAssetCache = sync.Map{}
			store := &wanReferenceObjectStore{}
			root := setupWanStorage(t, store, "")
			path := writeReferenceWav(t, root, "local/audio/voice.wav", 3)
			var generations, audioRegistrations atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var body map[string]any
				_ = json.NewDecoder(r.Body).Decode(&body)
				if r.URL.Path == "/seedance/v3/assets/create" {
					if body["assetType"] == "Audio" {
						audioRegistrations.Add(1)
					}
					_, _ = w.Write([]byte(`{"code":0,"data":{"assetId":"local-voice","status":"Active"}}`))
					return
				}
				generations.Add(1)
				var url string
				if strings.Contains(model, "seedance") {
					content := body["content"].([]any)
					url, _ = content[len(content)-1].(map[string]any)["audio_url"].(map[string]any)["url"].(string)
				} else {
					media := body["input"].(map[string]any)["media"].([]any)
					url, _ = media[len(media)-1].(map[string]any)["url"].(string)
				}
				if !strings.Contains(url, "x-oss-signature=") || !strings.HasPrefix(url, "https://reference-bucket.") || !strings.Contains(url, ".wav?") {
					t.Error("local audio was not converted to a signed HTTPS reference URL", url)
				}
				_, _ = w.Write([]byte(`{"task_id":"local-voice-video"}`))
			}))
			defer server.Close()
			storeSeedanceCachedURI(seedanceAssetScope{base: server.URL, apiKey: "secret", model: model}, "Audio", "/storage/local/audio/voice.wav", "asset://legacy-local-audio")
			cfg := videoSubmissionTestConfig(t, server)
			cfg.Root = audioTestProjectRoot(t)
			handler := Video(cfg)
			response := postVideoWithAudio(t, handler, server.URL, model, "local-voice-input", "/storage/local/audio/voice.wav", "local")
			if response.Code != 200 || store.calls != 1 || store.contentType != "audio/wav" || generations.Load() != 1 || audioRegistrations.Load() != 0 {
				t.Fatalf("local audio failed: %d %s uploads=%d generations=%d", response.Code, response.Body.String(), store.calls, generations.Load())
			}
			if err := os.Remove(path); err != nil {
				t.Fatal(err)
			}
			repeated := postVideoWithAudio(t, handler, server.URL, model, "local-voice-input", "/storage/local/audio/voice.wav", "local")
			if repeated.Code != 200 || store.calls != 1 || generations.Load() != 1 || !strings.Contains(repeated.Body.String(), `"reused":true`) {
				t.Fatal("repeated accepted task reprocessed or regenerated audio", repeated.Code, repeated.Body.String())
			}
		})
	}
}

func TestExplicitSeedanceAudioAssetStillChecksActive(t *testing.T) {
	var queries atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		if r.URL.Path != "/seedance/v3/assets/query" || body["assetId"] != "explicit-audio" {
			t.Errorf("unexpected explicit audio asset request: %s %#v", r.URL.Path, body)
			http.NotFound(w, r)
			return
		}
		queries.Add(1)
		_, _ = w.Write([]byte(`{"code":0,"data":{"assetId":"explicit-audio","status":"Active"}}`))
	}))
	defer server.Close()
	_ = videoSubmissionTestConfig(t, server)
	got, err := resolveSeedanceAudioRef(t.Context(), audioTestProjectRoot(t), seedanceAssetScope{base: server.URL, apiKey: "test-key"}, "asset://explicit-audio", "local", false, nil)
	if err != nil || got != "asset://explicit-audio" || queries.Load() != 1 {
		t.Fatalf("explicit audio asset compatibility changed: %q %v queries=%d", got, err, queries.Load())
	}
}

func TestLocalVideoReferenceAudioValidatesOwnershipFormatSizeAndDuration(t *testing.T) {
	root := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", root)
	writeReferenceWav(t, root, "local/audio/short.wav", 1)
	writeReferenceWav(t, root, "local/audio/two.wav", 2)
	writeReferenceWav(t, root, "local/audio/good.wav", 3)
	writeReferenceWav(t, root, "local/audio/eight.wav", 8)
	writeReferenceWav(t, root, "local/audio/fifteen.wav", 15)
	writeReferenceWav(t, root, "local/audio/long.wav", 16)
	writeReferenceWav(t, root, "local/audio/thirty-five.wav", 35)
	otherWorkspace := strings.Repeat("a", 64)
	writeReferenceWav(t, root, otherWorkspace+"/audio/private.wav", 3)
	bad := writeReferenceWav(t, root, "local/audio/bad.wav", 3)
	if err := os.WriteFile(bad, []byte("#EXTM3U\nfile:///private/secret"), 0600); err != nil {
		t.Fatal(err)
	}
	large := writeReferenceWav(t, root, "local/audio/large.wav", 3)
	if err := os.Truncate(large, videoReferenceAudioMaxBytes+1); err != nil {
		t.Fatal(err)
	}
	for _, item := range []struct {
		model, message string
		refs           []string
	}{
		{"wan3.0-video", "", []string{"/storage/local/audio/good.wav"}},
		{"wan3.0-video", "", []string{"/storage/local/audio/short.wav"}},
		{"doubao-seedance-2.5", "", []string{"/storage/local/audio/long.wav"}},
		{"doubao-seedance-2.5", "", []string{"/storage/local/audio/thirty-five.wav"}},
		{"doubao-seedance-2.0-mini", "2", []string{"/storage/local/audio/short.wav"}},
		{"MiniMax-H3", "2", []string{"/storage/local/audio/short.wav"}},
		{"MiniMax-H3", "", []string{"/storage/local/audio/two.wav"}},
		{"wan3.0-video", "", []string{"/storage/local/audio/long.wav"}},
		{"wan3.0-video", "", []string{"/storage/local/audio/eight.wav", "/storage/local/audio/eight.wav"}},
		{"viduq4-preview", "3", []string{"/storage/local/audio/two.wav"}},
		{"viduq4-preview", "", []string{"/storage/local/audio/fifteen.wav"}},
		{"wan3.0-video", "格式与文件内容不匹配", []string{"/storage/local/audio/bad.wav"}},
		{"wan3.0-video", "15MB", []string{"/storage/local/audio/large.wav"}},
		{"wan3.0-video", "无权读取", []string{"/storage/" + otherWorkspace + "/audio/private.wav"}},
		{"wan3.0-video", "不存在", []string{"/storage/local/../other/audio/private.wav"}},
		{"wan3.0-video", "不存在", []string{"/storage/local/%252e%252e/other/audio/private.wav"}},
	} {
		err := validateLocalVideoAudioReferences(context.Background(), audioTestProjectRoot(t), item.model, item.refs, "local", false)
		if item.message == "" && err != nil {
			t.Fatalf("valid audio rejected: %s %v", item.model, err)
		}
		if item.message != "" && (err == nil || !strings.Contains(err.Error(), item.message)) {
			t.Fatalf("refs=%v error=%v want=%s", item.refs, err, item.message)
		}
	}
}

func TestAudioReferencePreparationRejectsLocalPathsWithoutStorageAndUnsafeSchemes(t *testing.T) {
	for _, ref := range []string{"/storage/local/audio/voice.wav", "file:///private/voice.wav", "data:audio/wav;base64,xxx", "https://user:secret@cdn.example/voice.wav"} {
		if _, err := resolveWanAudioRef(context.Background(), audioTestProjectRoot(t), ref, "local", false, nil); err == nil {
			t.Fatal("invalid or inaccessible audio accepted", ref)
		}
	}
}
