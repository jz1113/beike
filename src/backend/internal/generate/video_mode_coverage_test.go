package generate

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestOmniFlashExplicitMediaRoles(t *testing.T) {
	for _, tc := range []struct {
		mode, tag      string
		images, videos []string
	}{
		{"first_frame", "<FIRST_FRAME>@Image1", []string{"https://cdn.example/first.png"}, nil},
		{"first_last_frame", "<LAST_FRAME>@Image2", []string{"https://cdn.example/first.png", "https://cdn.example/last.png"}, nil},
		{"edit", "<VIDEO_0>@Video1", nil, []string{"https://cdn.example/clip.mp4"}},
		{"extend", "<PREVIOUS_VIDEO>@Video1", nil, []string{"https://cdn.example/clip.mp4"}},
	} {
		payload := map[string]json.RawMessage{"ref_mode": rawJSON(t, tc.mode), "images": rawJSON(t, tc.images), "videos": rawJSON(t, tc.videos), "duration": rawJSON(t, 10), "resolution": rawJSON(t, "720P")}
		if message := videoInputError(payload, "omni_flash-10s"); message != "" {
			t.Fatalf("%s: %s", tc.mode, message)
		}
		body := buildVideoPayload("omni_flash-10s", "camera moves", payload).payload
		if !strings.Contains(body["prompt"].(string), tc.tag) {
			t.Fatalf("%s lost role: %v", tc.mode, body)
		}
	}
}

func TestKlingOmniReferenceAndEditingRoles(t *testing.T) {
	for _, mode := range []string{"omni", "edit"} {
		payload := map[string]json.RawMessage{"ref_mode": rawJSON(t, mode), "images": rawJSON(t, []string{"https://cdn.example/a.png"}), "videos": rawJSON(t, []string{"https://cdn.example/clip.mp4"}), "duration": rawJSON(t, 5), "resolution": rawJSON(t, "720P")}
		if message := videoInputError(payload, "kling-video-v3-omni"); message != "" {
			t.Fatalf("%s: %s", mode, message)
		}
		body := buildVideoPayload("kling-video-v3-omni", "camera moves", payload).payload
		list, ok := body["video_list"].([]map[string]string)
		role := "feature"
		if mode == "edit" {
			role = "base"
		}
		if !ok || len(list) != 1 || list[0]["refer_type"] != role || body["sound"] != "off" {
			t.Fatalf("invalid %s payload: %v", mode, body)
		}
		if mode == "edit" && body["duration"] != nil {
			t.Fatalf("edit duration must follow original: %v", body)
		}
	}
}

func TestNativeVideoRoutes(t *testing.T) {
	for _, tc := range []struct{ family, base, path string }{
		{"seedance", "https://ark.cn-beijing.volces.com/api/v3", "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks"},
		{"vidu", "https://api.vidu.cn/ent/v2", "https://api.vidu.cn/ent/v2/text2video"},
		{"kling", "https://api-singapore.klingai.com/v1", "https://api-singapore.klingai.com/v1/videos/text2video"},
	} {
		a := videoAdapted{family: tc.family, modelID: map[string]string{"seedance": "doubao-seedance-2.5", "vidu": "viduq3-pro", "kling": "kling-video-v3"}[tc.family]}
		applyNativeVideoRoute(tc.base, "text", "test-key", &a)
		if len(a.endpoints) != 1 || a.endpoints[0] != tc.path {
			t.Fatalf("%s route: %v", tc.family, a.endpoints)
		}
		if tc.family == "vidu" && a.headers["Authorization"] != "Token test-key" {
			t.Fatalf("Vidu auth: %v", a.headers)
		}
	}
}

func TestNativeH3TailFrame(t *testing.T) {
	for _, base := range []string{"https://api.minimax.cn", "https://metaso.cn/api"} {
		payload := map[string]json.RawMessage{"ref_mode": rawJSON(t, "last_frame"), "images": rawJSON(t, []string{"https://cdn.example/end.png"}), "customBaseUrl": rawJSON(t, base), "duration": rawJSON(t, 5), "resolution": rawJSON(t, "768P")}
		if message := videoInputError(payload, "MiniMax-H3"); message != "" {
			t.Fatal(message)
		}
		body := buildVideoPayload("MiniMax-H3", "end at this frame", payload).payload
		if body["content"].([]map[string]any)[1]["role"] != "last_frame" || body["ratio"] != "adaptive" {
			t.Fatal(body)
		}
	}
}

func TestNativeKlingMotionControl(t *testing.T) {
	base := "https://api-singapore.klingai.com/v1"
	payload := map[string]json.RawMessage{"ref_mode": rawJSON(t, "motion_control"), "images": rawJSON(t, []string{"https://cdn.example/person.png"}), "videos": rawJSON(t, []string{"https://cdn.example/action.mp4"}), "customBaseUrl": rawJSON(t, base), "audio": rawJSON(t, false), "resolution": rawJSON(t, "720P")}
	if message := videoInputError(payload, "kling-video-v3"); message != "" {
		t.Fatal(message)
	}
	a := buildVideoPayload("kling-video-v3", "follow motion", payload)
	applyNativeVideoRoute(base, "motion_control", "test-key", &a)
	if a.endpoints[0] != "https://api-singapore.klingai.com/motion-control/kling-3.0" || a.queries[0] != "https://api-singapore.klingai.com/tasks?task_ids={taskId}" {
		t.Fatal(a.endpoints, a.queries)
	}
	if a.payload["settings"].(map[string]any)["audio"] != "off" || a.payload["duration"] != nil {
		t.Fatal(a.payload)
	}
	if message := videoInputError(payload, "kling-video-v3", "https://gateway.example"); message == "" {
		t.Fatal("unverified gateway accepted native motion")
	}
	task := map[string]any{"id": "motion-1", "status": "succeeded", "outputs": []any{map[string]any{"type": "video", "url": "https://cdn.example/result.mp4"}}}
	data := map[string]any{"data": []any{map[string]any{"id": "other", "status": "failed"}, task}}
	parsed := readVideoPoll(selectKlingTask(data, "motion-1"))
	if parsed.status != "SUCCESS" || parsed.result != "https://cdn.example/result.mp4" {
		t.Fatal(parsed)
	}
	if readVideoTaskID(map[string]any{"data": map[string]any{"id": "motion-1"}}, "kling") != "motion-1" {
		t.Fatal("new task ID was lost")
	}
}

func TestComflyRejectsGrok15LegacyOperations(t *testing.T) {
	for _, mode := range []string{"edit", "extend"} {
		payload := map[string]json.RawMessage{"ref_mode": rawJSON(t, mode), "videos": rawJSON(t, []string{"https://cdn.example/source.mp4"}), "duration": rawJSON(t, 6), "resolution": rawJSON(t, "720P")}
		if message := videoInputError(payload, "grok-imagine-video-1.5", "https://ai.comfly.org"); message == "" {
			t.Fatal("Grok 1.5 accepted legacy-only Comfly operation", mode)
		}
	}
	payload := map[string]json.RawMessage{"ref_mode": rawJSON(t, "first_frame"), "images": rawJSON(t, []string{"https://cdn.example/frame.png"}), "duration": rawJSON(t, 5), "resolution": rawJSON(t, "768P"), "aspect_ratio": rawJSON(t, "adaptive")}
	if message := videoInputError(payload, "MiniMax-H3", "https://ai.comfly.org"); message != "" {
		t.Fatal(message)
	}
}
