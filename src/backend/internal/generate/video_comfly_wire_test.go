package generate

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/gateway"
)

// Exercise the real JSON/multipart serializer and task-ID reader against a local
// receiver. Media preparation and extension stitching have separate handler tests.
func TestComflyVideoWireMatrix(t *testing.T) {
	models := []string{"doubao-seedance-2.5", "doubao-seedance-2-0-260128", "doubao-seedance-2-0-fast-260128", "doubao-seedance-2.0-mini", "wan3.0-video", "MiniMax-H3", "kling-video-v3", "kling-video-v3-omni", "kling-video-v2-6", "kling-video-v2-5-turbo", "viduq3", "viduq3-mix", "viduq3-turbo", "viduq3-pro", "viduq4-preview", "veo3.1", "veo3.1-fast", "veo3.1-pro", "omni_flash-10s", "grok-imagine-video-1.5", "sora-2", "sora-2-pro"}
	for _, model := range models {
		modes := append([]string{}, videoModes(model)...)
		if model == "kling-video-v3" || model == "kling-video-v2-6" {
			modes = append(modes, "motion_control")
		}
		for _, mode := range modes {
			t.Run(model+"/"+mode, func(t *testing.T) {
				if model == "grok-imagine-video-1.5" && (mode == "edit" || mode == "extend") {
					return
				}
				// These paths send actual uploaded file bytes; their dedicated tests cover
				// form preparation and the final concatenated result rather than URL JSON.
				if omniFlash(model) && (mode == "edit" || mode == "extend") {
					return
				}
				if veoModel(model) && mode == "extend" {
					return
				}
				images, videos := []string{}, []string{}
				switch mode {
				case "first_last_frame":
					images = []string{"https://cdn.example/start.png", "https://cdn.example/end.png"}
				case "omni", "first_frame", "motion_control":
					images = []string{"https://cdn.example/start.png"}
				}
				if mode == "edit" || mode == "extend" || mode == "motion_control" {
					videos = []string{"https://cdn.example/source.mp4"}
				}
				duration := 5
				if veoModel(model) {
					duration = 8
				}
				if omniFlash(model) || strings.Contains(model, "sora") {
					duration = 10
				}
				payload := map[string]json.RawMessage{"ref_mode": rawJSON(t, mode), "duration": rawJSON(t, duration), "resolution": rawJSON(t, defaultVideoResolution(model)), "aspect_ratio": rawJSON(t, "16:9"), "images": rawJSON(t, images), "videos": rawJSON(t, videos)}
				if message := videoInputError(payload, model, "https://ai.comfly.org"); message != "" {
					t.Fatal(message)
				}
				a := buildVideoPayload(model, "wire-check", payload)
				applyNativeVideoRoute("https://ai.comfly.org", mode, "dummy", &a)
				applyKlingMotionChannel("https://ai.comfly.org", &a)
				applyVeoComflyChannel("https://ai.comfly.org", payload, &a)
				var fields map[string][]string
				if minimaxH3(model) {
					fields = routeMinimaxH3Submission("https://ai.comfly.org", &a)
				}
				seen := false
				server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					seen = true
					if r.Method != "POST" {
						t.Error("wrong method")
					}
					var raw []byte
					if fields != nil {
						if err := r.ParseMultipartForm(4 << 20); err != nil {
							t.Error(err)
						}
						defer r.MultipartForm.RemoveAll()
						raw, _ = json.Marshal(r.MultipartForm.Value)
					} else {
						raw, _ = io.ReadAll(r.Body)
					}
					for _, ref := range append(images, videos...) {
						if !strings.Contains(string(raw), ref) {
							t.Error("wire lost input", ref)
						}
					}
					if !strings.Contains(string(raw), "wire-check") {
						t.Error("prompt missing on wire")
					}
					w.Header().Set("Content-Type", "application/json")
					w.Write([]byte(`{"task_id":"local-wire-task"}`))
				}))
				defer server.Close()
				encoded, _ := json.Marshal(a.payload)
				// Only the origin is replaced: the selected production route path is retained.
				endpoints := expandVideoURLs(server.URL, a.endpoints, "")
				for i, url := range endpoints {
					endpoints[i] = strings.Replace(url, "https://ai.comfly.org", server.URL, 1)
				}
				result := gateway.SubmitVideo(context.Background(), gateway.SubmitCommand{Endpoints: endpoints, APIKey: "dummy", PayloadJSON: string(encoded), MultipartFields: fields, Client: server.Client(), ReadTaskID: func(data map[string]any) string { return readVideoTaskID(data, a.family) }})
				if !seen || result.Outcome != gateway.Accepted || result.TaskID != "local-wire-task" {
					t.Fatal("local wire contract failed", result.Outcome, result.Error)
				}
			})
		}
	}
}
