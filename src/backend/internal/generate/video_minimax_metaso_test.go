package generate

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
)

func TestMetasoH3RoutesNormalizeConfiguredBaseAndAvoidFlatFallbacks(t *testing.T) {
	for _, suffix := range []string{"", "/", "/api", "/api/minimax", "/api/minimax/v2", "/api/minimax/v2/"} {
		base := "https://metaso.cn" + suffix
		submit, query := minimaxH3Route(base)
		if !reflect.DeepEqual(submit, []string{"https://metaso.cn/api/minimax/v2/video_generation"}) || !reflect.DeepEqual(query, []string{"https://metaso.cn/api/minimax/v2/query/video_generation/{taskId}"}) {
			t.Fatalf("base %s routed incorrectly: %v %v", base, submit, query)
		}
		rememberVideoQuery(base, "metaso-recovered", base+"/v1/videos/{taskId}")
		urls := videoPollURLs(base, "metaso-recovered", "MiniMax-H3", "")
		if !reflect.DeepEqual(urls, []string{"https://metaso.cn/api/minimax/v2/query/video_generation/metaso-recovered"}) {
			t.Fatalf("Metaso queried an old flat endpoint: %v", urls)
		}
	}
	for _, base := range []string{"https://metaso.cn.example.com", "https://metaso.cn@evil.example", "https://api.minimax.cn", "https://ai.comfly.org"} {
		if minimaxMetasoHost(base) {
			t.Fatalf("unverified Metaso host %s", base)
		}
	}
}

func TestMetasoH3OutputLimitsStayScopedToSelectedChannel(t *testing.T) {
	for _, item := range []struct {
		base, model, resolution string
		duration                float64
		valid                   bool
	}{
		{"https://metaso.cn", "MiniMax-H3", "480P", 15, true},
		{"https://metaso.cn/api", "MiniMax-H3", "768P", 15, true},
		{"https://metaso.cn/api/minimax", "MiniMax-H3", "1080P", 15, true},
		{"https://metaso.cn/api/minimax/v2", "h3", "1080P", 15, true},
		{"https://metaso.cn", "MiniMax-H3", "720P", 15, true},
		{"https://metaso.cn", "MiniMax-H3", "480P", 16, false},
		{"https://metaso.cn", "MiniMax-H3", "768P", 16, false},
		{"https://metaso.cn", "MiniMax-H3", "1080P", 16, false},
		{"https://metaso.cn", "MiniMax-H3", "480P", 30, false},
		{"https://metaso.cn", "MiniMax-H3", "2K", 15, true},
		{"https://metaso.cn", "MiniMax-H3", "2K", 16, false},
		{"https://metaso.cn", "MiniMax-H3", "1080P", 31, false},
		{"https://metaso.cn", "MiniMax-H3", "768P", 3, false},
		{"https://metaso.cn", "MiniMax-H3", "480P", 4.5, false},
		{"https://metaso.cn", "MiniMax-H3", "4K", 5, false},
		{"https://metaso.cn", "veo3.1", "1080P", 30, false},
		{"https://api.minimax.cn", "MiniMax-H3", "1080P", 30, false},
		{"https://api.minimax.cn", "MiniMax-H3", "480P", 5, false},
		{"https://ai.comfly.org", "MiniMax-H3", "1080P", 30, false},
		{"https://metaso.cn.example.com", "MiniMax-H3", "1080P", 30, false},
	} {
		payload := map[string]json.RawMessage{"resolution": rawJSON(t, item.resolution), "duration": rawJSON(t, item.duration)}
		message := videoInputError(payload, item.model, item.base)
		if (message == "") != item.valid {
			t.Fatalf("channel %s model %s %s %.1fs accepted=%v error=%s", item.base, item.model, item.resolution, item.duration, message == "", message)
		}
	}
	for _, resolution := range []string{"", "480P", "768P", "1080P", "2K", "720P"} {
		payload := map[string]json.RawMessage{}
		if resolution != "" {
			payload["resolution"] = rawJSON(t, resolution)
		}
		adapted := buildVideoPayload("MiniMax-H3", "保持台词", payload)
		applyMinimaxH3Channel("https://metaso.cn/api", payload, &adapted)
		fields := routeMinimaxH3Submission("https://metaso.cn/api", &adapted)
		if fields != nil || adapted.payload["content"] == nil || adapted.payload["resolution"] != minimaxMetasoResolution(resolution) || adapted.payload["fast_mode"] != false {
			t.Fatalf("Metaso resolution/default/payload changed: %#v", adapted)
		}
	}
}

func TestMetasoH3SubmitsFifteenSecond1080WithVoiceAndRecoversNativeQuery(t *testing.T) {
	store := &wanReferenceObjectStore{}
	root := setupWanStorage(t, store, "")
	writeReferenceWav(t, root, "local/audio/voice.wav", 3)
	var submissions, queries atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-metaso-key" {
			t.Error("test credential missing")
		}
		switch r.Method {
		case http.MethodPost:
			submissions.Add(1)
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Error(err)
			}
			if r.URL.Path != "/api/minimax/v2/video_generation" || r.Header.Get("Content-Type") != "application/json" || body["model"] != "MiniMax-H3" || body["duration"] != float64(15) || body["resolution"] != "1080P" || body["fast_mode"] != false || body["prompt"] != nil || body["audioUrls"] != nil {
				t.Errorf("Metaso did not receive its native V2 request: %s %#v", r.URL.Path, body)
			}
			content, _ := body["content"].([]any)
			if len(content) != 3 {
				t.Errorf("Metaso lost text/image/voice references: %#v", body)
			} else {
				voice := content[2].(map[string]any)
				ref, _ := voice["audio_url"].(map[string]any)["url"].(string)
				if voice["role"] != "reference_audio" || !strings.Contains(ref, "x-oss-signature=") || strings.Contains(ref, "/storage/") {
					t.Errorf("Metaso voice was not prepared as signed reference_audio: %#v", voice)
				}
			}
			_, _ = w.Write([]byte(`{"task_id":"metaso-h3-task"}`))
		case http.MethodGet:
			queries.Add(1)
			if r.URL.Path != "/api/minimax/v2/query/video_generation/metaso-h3-task" {
				t.Errorf("Metaso query used incorrect endpoint %s", r.URL.Path)
			}
			_, _ = w.Write([]byte(`{"task":{"id":"metaso-h3-task","status":"succeeded","content":{"url":"https://cdn.example/metaso-result.mp4"}}}`))
		default:
			http.Error(w, "unexpected method", http.StatusMethodNotAllowed)
		}
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
	handler := Video(cfg)
	payload := map[string]any{
		"prompt": "音频只提供音色，台词按分镜", "preserve_prompt": true, "model": "MiniMax-H3", "duration": 15, "resolution": "1080P", "aspect_ratio": "9:16",
		"ref_mode": "omni", "audio": true, "images": []string{"https://cdn.example/person.jpg"}, "audios": []string{"/storage/local/audio/voice.wav"},
		"clientTaskId": "metaso-native-15", "storageConfig": json.RawMessage(wanOSSStorageJSON),
	}
	post := func(base string) *httptest.ResponseRecorder {
		encoded, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/generate/video", bytes.NewReader(encoded))
		req = req.WithContext(httpx.WithWorkspace(req.Context(), "local"))
		req.Header.Set("x-custom-base-url", base)
		req.Header.Set("x-custom-api-key", "test-metaso-key")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, req)
		return response
	}
	response := post("https://metaso.cn/api/minimax/v2")
	if response.Code != 200 || !strings.Contains(response.Body.String(), `"taskId":"metaso-h3-task"`) || !strings.Contains(response.Body.String(), `"resolution":"1080P"`) || submissions.Load() != 1 || store.calls != 1 {
		t.Fatalf("Metaso 15s 1080P voice request failed: %d %s submissions=%d uploads=%d", response.Code, response.Body.String(), submissions.Load(), store.calls)
	}
	// A process restart loses route memory. Recovery must still use the known
	// Metaso query prefix and understand task.content.url.
	videoQueries = sync.Map{}
	query := httptest.NewRequest(http.MethodGet, "/api/generate/video?taskId=metaso-h3-task&model=MiniMax-H3", nil)
	query = query.WithContext(httpx.WithWorkspace(query.Context(), "local"))
	query.Header.Set("x-custom-base-url", "https://metaso.cn/api")
	query.Header.Set("x-custom-api-key", "test-metaso-key")
	polled := httptest.NewRecorder()
	handler.ServeHTTP(polled, query)
	if polled.Code != 200 || !strings.Contains(polled.Body.String(), `"status":"SUCCESS"`) || !strings.Contains(polled.Body.String(), "https://cdn.example/metaso-result.mp4") || queries.Load() != 1 {
		t.Fatalf("Metaso restart recovery failed: %d %s calls=%d", polled.Code, polled.Body.String(), queries.Load())
	}
	for _, item := range []struct {
		resolution string
		duration   int
		base       string
	}{
		{"2K", 16, "https://metaso.cn"}, {"1080P", 16, "https://metaso.cn"}, {"768P", 16, "https://metaso.cn"}, {"480P", 16, "https://metaso.cn"}, {"480P", 3, "https://metaso.cn"}, {"1080P", 30, "https://api.minimax.cn"},
	} {
		payload["resolution"], payload["duration"], payload["clientTaskId"] = item.resolution, item.duration, "invalid-metaso-limit"
		rejected := post(item.base)
		if rejected.Code != http.StatusBadRequest || !strings.Contains(rejected.Body.String(), "时长") || submissions.Load() != 1 || store.calls != 1 {
			t.Fatalf("invalid output reached upstream or upload: %s %ds %d %s", item.resolution, item.duration, rejected.Code, rejected.Body.String())
		}
	}
}
