package generate

import (
	"encoding/json"
	"strings"
	"testing"
)

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
