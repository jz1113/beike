package generate

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/gateway"
)

func TestComflyImageWireFormats(t *testing.T) {
	previous := gateway.ModelHTTP
	defer func() { gateway.ModelHTTP = previous }()
	for _, tc := range []struct {
		model, path, refs string
		count             int
	}{
		{"gpt-image-2", "/v1/images/edits", "images", 2},
		{"gpt-image-2.5-flare", "/v1/images/edits", "image", 1},
		{"grok-imagine-image", "/v1/images/edits", "image", 2},
		{"grok-imagine-image-quality", "/v1/images/edits", "images", 2},
		{"gemini-3.1-flash-image", "/v1/images/generations", "image", 2},
	} {
		t.Run(tc.model, func(t *testing.T) {
			gateway.ModelHTTP = func() *http.Client {
				return &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
					var body map[string]any
					if r.URL.Path != tc.path || r.Header.Get("Content-Type") != "application/json" || json.NewDecoder(r.Body).Decode(&body) != nil || body[tc.refs] == nil {
						t.Fatalf("wrong wire format %s %#v", r.URL.Path, body)
					}
					if tc.count == 2 && len(body[tc.refs].([]any)) != 2 {
						t.Fatal("lost reference", body)
					}
					if tc.model == "gemini-3.1-flash-image" && body["model"] != "gemini-3.1-flash-image-preview-4k" {
						t.Fatal("wrong tier", body)
					}
					return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(`{"data":[{"url":"https://cdn.example/image.png"}]}`))}, nil
				})}
			}
			refs := []string{"https://cdn.example/a.png", "https://cdn.example/b.png"}
			result, err := (openaiImageProtocol{}).Submit(imageRequest{Model: tc.model, Base: "https://ai.comfly.org/v1", Prompt: "scene", Size: "4K", Refs: refs[:tc.count]})
			if err != nil || result.Direct == "" {
				t.Fatal(err, result)
			}
		})
	}
}

func TestUnifiedVideoAlternatesPreserveInputs(t *testing.T) {
	base := "https://ai.comfly.org"
	for _, model := range []string{"doubao-seedance-2.5", "wan3.0-video-prime", "grok-imagine-video-1.5"} {
		raw := map[string]json.RawMessage{"ref_mode": rawJSON(t, "first_last_frame"), "images": rawJSON(t, []string{"first", "last"})}
		a := buildVideoPayload(model, "shot", raw)
		alternates := videoAlternateBodies(base, &a, "first_last_frame", nil)
		endpoint := expandVideoURLs(base, a.endpoints, "")
		encoded := alternates[endpoint[len(endpoint)-1]]
		var body map[string]any
		if json.Unmarshal([]byte(encoded), &body) != nil || body["model"] != model || body["prompt"] != "shot" || body["content"] != nil || body["input"] != nil {
			t.Fatal(model, encoded)
		}
		switch a.family {
		case "seedance":
			if len(body["images"].([]any)) != 2 {
				t.Fatal(body)
			}
		case "wan":
			if body["media"].([]any)[1].(map[string]any)["type"] != "last_frame" {
				t.Fatal(body)
			}
		case "grok-video":
			if body["last_frame"] != "last" || body["images"].([]any)[0] != "first" {
				t.Fatal(body)
			}
		}
	}
	h3 := map[string]any{"task": map[string]any{"id": "h3-task", "status": "succeeded", "content": map[string]any{"url": "https://cdn.example/h3.mp4"}}}
	if readVideoTaskID(h3, "minimax") != "h3-task" || readVideoPoll(h3).result != "https://cdn.example/h3.mp4" {
		t.Fatal(h3)
	}
}

func TestComflyEditRecoversOnlyExplicitFormRejection(t *testing.T) {
	previous := gateway.ModelHTTP
	t.Cleanup(func() { gateway.ModelHTTP = previous })
	for _, tc := range []struct {
		model     string
		message   string
		wantCalls int
	}{
		{"gpt-image-2", "failed to parse multipart form", 2},
		{"gpt-image-2.5-flare", "failed to parse multipart form", 2},
		{"gpt-image-2.5-sunburst", "failed to parse multipart form", 2},
		{"gpt-image-2.5-flare", "upstream timed out", 1},
	} {
		t.Run(tc.model+"/"+tc.message, func(t *testing.T) {
			calls := 0
			gateway.ModelHTTP = func() *http.Client {
				return &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
					calls++
					if calls == 1 {
						return &http.Response{StatusCode: 502, Body: io.NopCloser(strings.NewReader(`{"error":{"message":"` + tc.message + `"}}`))}, nil
					}
					if err := r.ParseMultipartForm(1 << 20); err != nil || len(r.MultipartForm.File["image[]"]) != 2 || r.FormValue("prompt") != "scene" {
						t.Fatalf("missing two product references or prompt: %v", err)
					}
					return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"task_id":"accepted"}`))}, nil
				})}
			}
			ref := "data:image/png;base64," + tinyPNG
			result, err := (openaiImageProtocol{}).Submit(imageRequest{Model: tc.model, Base: "https://ai.comfly.org", Prompt: "scene", Refs: []string{ref, ref}})
			if err != nil || calls != tc.wantCalls || (tc.wantCalls == 2 && result.TaskID != "accepted") {
				t.Fatal(err, calls, result.TaskID)
			}
		})
	}
}
