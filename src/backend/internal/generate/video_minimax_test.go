package generate

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"

	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
)

func TestMinimaxH3RoutesKeepOfficialAndGatewayProtocolsSeparate(t *testing.T) {
	for _, item := range []struct{ base, submit, query string }{
		{"https://api.minimax.cn/v2", "https://api.minimax.cn/v2/video_generation", "https://api.minimax.cn/v2/query/video_generation/{taskId}"},
		{"https://api.minimaxi.com/v1", "https://api.minimaxi.com/v2/video_generation", "https://api.minimaxi.com/v2/query/video_generation/{taskId}"},
		{"https://ai.comfly.org/v1", "https://ai.comfly.org/v1/videos", "https://ai.comfly.org/v1/videos/{taskId}"},
		{"https://custom.example/v1", "https://custom.example/v1/videos", "https://custom.example/v1/videos/{taskId}"},
	} {
		submit, query := minimaxH3Route(item.base)
		if submit[0] != item.submit || query[0] != item.query {
			t.Fatalf("host %s route %v %v", item.base, submit, query)
		}
		adapted := buildVideoPayload("MiniMax-H3", "原始台词", nil)
		fields := routeMinimaxH3Submission(item.base, &adapted)
		if minimaxOfficialHost(item.base) {
			if adapted.payload["content"] == nil || adapted.payload["prompt"] != nil || fields != nil || len(submit) != 1 {
				t.Fatalf("official V2 mixed with gateway protocol: %#v", adapted)
			}
		} else if adapted.payload["content"] != nil || adapted.payload["mode"] != "text-to-video" || adapted.payload["seconds"] != "5" || (fields != nil) != minimaxComflyHost(item.base) {
			t.Fatalf("gateway protocol changed: %#v fields=%v", adapted, fields)
		}
	}
	alias := map[string]json.RawMessage{"ref_mode": rawJSON(t, "omni"), "duration": rawJSON(t, 13)}
	if err := videoInputError(alias, "h3"); err != "" || defaultVideoResolution("h3") != "720P" {
		t.Fatal("H3 alias lost official duration/default resolution", err)
	}
	adapted := buildVideoPayload("h3", "原始台词", alias)
	routeMinimaxH3Submission("https://ai.comfly.org", &adapted)
	if adapted.payload["model"] != "MiniMax-H3" {
		t.Fatal("H3 alias was sent as an unsupported provider model", adapted.payload)
	}
	for _, base := range []string{"https://api.minimax.cn", "https://ai.comfly.org"} {
		urls := videoPollURLs(base, "h3-query", "MiniMax-H3", "")
		if len(urls) != 1 || strings.Contains(urls[0], "seedance") {
			t.Fatalf("known H3 host queried unrelated provider route: %v", urls)
		}
	}
	for _, impostor := range []string{"https://api.minimax.cn.example.com", "https://api.minimax.cn@evil.example", "https://platform.minimax.cn"} {
		if minimaxOfficialHost(impostor) {
			t.Fatalf("unverified official host %s", impostor)
		}
	}
}

func TestMinimaxH3NativeRolesAndResolutionAliases(t *testing.T) {
	for _, mode := range []string{"omni", "first_frame", "first_last_frame"} {
		images := []string{"https://cdn.example/first.jpg"}
		if mode == "first_last_frame" {
			images = append(images, "https://cdn.example/last.jpg")
		}
		payload := map[string]json.RawMessage{"ref_mode": rawJSON(t, mode), "images": rawJSON(t, images), "resolution": rawJSON(t, "1080P"), "aspect_ratio": rawJSON(t, "9:16")}
		adapted := buildVideoPayload("MiniMax-H3", "原始台词", payload)
		content := adapted.payload["content"].([]map[string]any)
		firstRole := "reference_image"
		if mode != "omni" {
			firstRole = "first_frame"
			if adapted.payload["ratio"] != "adaptive" {
				t.Fatalf("framed H3 must follow input ratio: %#v", adapted.payload)
			}
		}
		if content[1]["role"] != firstRole || adapted.payload["resolution"] != "2K" || mode == "first_last_frame" && content[2]["role"] != "last_frame" {
			t.Fatalf("mode %s roles %#v", mode, adapted.payload)
		}
		if err := videoInputError(payload, "MiniMax-H3"); err != "" {
			t.Fatal("legacy resolution rejected", err)
		}
		payload["resolution"] = rawJSON(t, "2K")
		if err := videoInputError(payload, "MiniMax-H3"); err != "" {
			t.Fatal("official resolution rejected", err)
		}
		if mode != "omni" {
			payload["audios"] = rawJSON(t, []string{"https://cdn.example/voice.wav"})
			if err := videoInputError(payload, "MiniMax-H3"); !strings.Contains(err, "全能参考") {
				t.Fatal("frame and reference audio mixed", err)
			}
		}
	}
}

func TestMinimaxH3SubmitsPreparedVoicesAcrossNativeMultipartAndJSONRoutes(t *testing.T) {
	for _, base := range []string{"https://api.minimax.cn", "https://ai.comfly.org", "https://custom.example"} {
		t.Run(base, func(t *testing.T) {
			store := &wanReferenceObjectStore{}
			root := setupWanStorage(t, store, "")
			path := writeReferenceWav(t, root, "local/audio/voice.wav", 8)
			original, _ := os.ReadFile(path)
			var generations atomic.Int32
			var submittedRefs []string
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				generations.Add(1)
				if r.Header.Get("Authorization") != "Bearer test-key" {
					t.Error("credential missing from selected route")
				}
				if minimaxComflyHost(base) {
					if err := r.ParseMultipartForm(1 << 20); err != nil {
						t.Error("Comfly did not receive multipart", err)
						http.Error(w, "multipart required", 400)
						return
					}
					form := r.MultipartForm.Value
					if _, present := form["context_ir_enabled"]; present {
						t.Error("Metaso context IR option reached Comfly")
					}
					if r.URL.Path != "/v1/videos" || form["mode"][0] != "multimodal-to-video" || form["seconds"][0] != "13" || form["resolution"][0] != "2k" || form["prompt"][0] != "音频只提供音色，台词按分镜" || !reflect.DeepEqual(form["videoUrls"], []string{"https://cdn.example/action.mp4"}) {
						t.Errorf("invalid Comfly multipart: %s %#v", r.URL.Path, form)
					}
					submittedRefs = form["audioUrls"]
				} else {
					var body map[string]any
					if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
						t.Fatal(err)
					}
					if _, present := body["context_ir_enabled"]; present {
						t.Error("Metaso context IR option reached another channel")
					}
					if minimaxOfficialHost(base) {
						if r.URL.Path != "/v2/video_generation" || body["duration"] != float64(13) || body["resolution"] != "2K" || body["prompt"] != nil || body["audio"] != nil || body["generate_audio"] != nil || body["mode"] != nil {
							t.Errorf("invalid official V2 request: %s %#v", r.URL.Path, body)
						}
						content := body["content"].([]any)
						if len(content) != 6 || content[0].(map[string]any)["text"] != "音频只提供音色，台词按分镜" || content[1].(map[string]any)["role"] != "reference_image" || content[2].(map[string]any)["role"] != "reference_video" {
							t.Errorf("visual or text inputs lost: %#v", body)
						}
						for _, raw := range content[3:] {
							item := raw.(map[string]any)
							if item["role"] != "reference_audio" {
								t.Error("voice reference role missing")
							}
							submittedRefs = append(submittedRefs, item["audio_url"].(map[string]any)["url"].(string))
						}
					} else {
						if r.URL.Path != "/v1/videos" || body["content"] != nil || body["mode"] != "multimodal-to-video" || body["seconds"] != "13" || body["resolution"] != "2k" || len(body["videoUrls"].([]any)) != 1 {
							t.Errorf("unknown gateway lost flat protocol: %#v", body)
						}
						for _, ref := range body["audioUrls"].([]any) {
							submittedRefs = append(submittedRefs, ref.(string))
						}
					}
				}
				_, _ = w.Write([]byte(`{"task_id":"h3-voice-video"}`))
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
				"prompt": "音频只提供音色，台词按分镜", "preserve_prompt": true, "model": "MiniMax-H3", "duration": 13, "resolution": "1080P", "aspect_ratio": "9:16",
				"ref_mode": "omni", "audio": true, "context_ir_enabled": false, "images": []string{"https://cdn.example/person.jpg"}, "videos": []string{"https://cdn.example/action.mp4"},
				"audios":        []string{"/storage/local/audio/voice.wav", "/storage/local/audio/voice.wav", "/storage/local/audio/voice.wav"},
				"customBaseUrl": base, "customApiKey": "test-key", "clientTaskId": "h3-reference", "storageConfig": json.RawMessage(wanOSSStorageJSON),
			}
			encoded, _ := json.Marshal(payload)
			handler := Video(cfg)
			post := func() *httptest.ResponseRecorder {
				req := httptest.NewRequest(http.MethodPost, "/api/generate/video", bytes.NewReader(encoded))
				req = req.WithContext(httpx.WithWorkspace(req.Context(), "local"))
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, req)
				return response
			}
			response := post()
			var result struct {
				Diagnostic *videoSubmissionDiagnostics `json:"submissionDiagnostics"`
			}
			if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil || response.Code != 200 || result.Diagnostic == nil {
				t.Fatalf("H3 generation rejected: %d %s %v", response.Code, response.Body.String(), err)
			}
			if generations.Load() != 1 || store.calls != 3 || len(submittedRefs) != 3 || result.Diagnostic.AudioReferenceCount != 3 || result.Diagnostic.ContextIREnabled != nil {
				t.Fatalf("lost selected voices: requests=%d uploads=%d refs=%v diagnostic=%+v", generations.Load(), store.calls, submittedRefs, result.Diagnostic)
			}
			for index, ref := range submittedRefs {
				if !strings.HasPrefix(ref, "https://reference-bucket.") || !strings.Contains(ref, "x-oss-signature=") || result.Diagnostic.AudioReferences[index].ReferenceSHA256 != videoDiagnosticDigest([]byte(ref)) || result.Diagnostic.AudioReferences[index].SubmittedDurationSeconds != []float64{8, 5, 2}[index] {
					t.Fatalf("voice %d lost prepared signed reference or order: %q %+v", index+1, ref, result.Diagnostic.AudioReferences[index])
				}
			}
			preserved, _ := os.ReadFile(path)
			if !bytes.Equal(original, preserved) {
				t.Fatal("preparing references changed the voice-library source")
			}
			if err := os.Remove(path); err != nil {
				t.Fatal(err)
			}
			repeated := post()
			if repeated.Code != 200 || !strings.Contains(repeated.Body.String(), `"reused":true`) || generations.Load() != 1 || store.calls != 3 {
				t.Fatal("accepted H3 task was uploaded or submitted again", repeated.Code, repeated.Body.String())
			}
		})
	}
}
