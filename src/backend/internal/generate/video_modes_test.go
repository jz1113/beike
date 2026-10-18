package generate

import (
	"encoding/json"
	"strings"
	"testing"
)

func rawJSON(t *testing.T, value any) json.RawMessage {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func TestVideoModeTableMatchesOfficialCapabilities(t *testing.T) {
	full := []string{"omni", "first_frame", "first_last_frame", "text"}
	framed := []string{"first_frame", "first_last_frame", "text"}
	seedance := []string{"omni", "first_frame", "first_last_frame", "text", "edit", "extend"}
	cases := []struct {
		model string
		modes []string
	}{
		{"doubao-seedance-2.5", seedance},
		{"doubao-seedance-2-0-260128", seedance},
		{"doubao-seedance-2.0-mini", seedance},
		{"wan3.0-video", full},
		{"MiniMax-H3", full},
		{"kling-video-v3", framed},
		{"kling-video-v3-omni", full},
		{"viduq3", []string{"omni"}},
		{"viduq3-mix", []string{"omni"}},
		{"viduq3-pro", full},
		{"viduq3-turbo", full},
		{"veo3.1", full},
		{"veo3.1-fast", full},
		{"omni_flash-10s", []string{"first_frame", "text"}},
		{"grok-imagine-video-1.5", full},
		{"sora-2", []string{"first_frame", "text"}},
	}
	for _, item := range cases {
		got := videoModes(item.model)
		if strings.Join(got, ",") != strings.Join(item.modes, ",") {
			t.Fatalf("%s modes %v", item.model, got)
		}
	}
}

func TestVideoInputRejectsUnimplementedCombinations(t *testing.T) {
	first := "https://example.com/frame-a.png"
	last := "https://example.com/frame-b.png"
	clip := "https://example.com/clip.mp4"
	sora := videoInputError(map[string]json.RawMessage{
		"ref_mode": rawJSON(t, "omni"), "images": rawJSON(t, []string{first, last}),
		"duration": rawJSON(t, 10), "resolution": rawJSON(t, "720P"), "aspect_ratio": rawJSON(t, "16:9"),
	}, "sora-2")
	if !strings.Contains(sora, "尚未接入") {
		t.Fatalf("sora omni: %s", sora)
	}
	veo := videoInputError(map[string]json.RawMessage{
		"ref_mode": rawJSON(t, "first_last_frame"), "images": rawJSON(t, []string{first, last}),
		"duration": rawJSON(t, 5), "resolution": rawJSON(t, "720P"), "aspect_ratio": rawJSON(t, "16:9"),
	}, "veo3.1")
	if !strings.Contains(veo, "时长") {
		t.Fatalf("veo first-last duration: %s", veo)
	}
	veoOK := videoInputError(map[string]json.RawMessage{
		"ref_mode": rawJSON(t, "first_last_frame"), "images": rawJSON(t, []string{first, last}),
		"duration": rawJSON(t, 8), "resolution": rawJSON(t, "720P"), "aspect_ratio": rawJSON(t, "16:9"),
	}, "veo3.1")
	if veoOK != "" {
		t.Fatalf("veo first-last 8s: %s", veoOK)
	}
	edit := videoInputError(map[string]json.RawMessage{
		"ref_mode": rawJSON(t, "edit"), "videos": rawJSON(t, []string{clip}),
		"duration": rawJSON(t, -1), "resolution": rawJSON(t, "720P"), "aspect_ratio": rawJSON(t, "adaptive"),
	}, "doubao-seedance-2.0-mini")
	if edit != "" {
		t.Fatalf("seedance 2.0 edit: %s", edit)
	}
	mixed := videoInputError(map[string]json.RawMessage{
		"ref_mode": rawJSON(t, "omni"), "images": rawJSON(t, []string{first}), "videos": rawJSON(t, []string{clip}),
		"duration": rawJSON(t, 5), "resolution": rawJSON(t, "720P"), "aspect_ratio": rawJSON(t, "16:9"),
	}, "MiniMax-H3")
	if mixed != "" {
		t.Fatalf("minimax mixed reference: %s", mixed)
	}
}

func TestDefaultVideoResolution(t *testing.T) {
	cases := []struct {
		model string
		want  string
	}{
		{"doubao-seedance-2.0-mini", "480P"},
		{"doubao-seedance-2.5", "480P"},
		{"wan3.0-video", "480P"},
		{"grok-imagine-video-1.5", "480P"},
		{"kling-video-v3", "720P"},
		{"veo3.1", "720P"},
		{"sora-2", "720P"},
		{"MiniMax-H3", "720P"},
		{"viduq3", "720P"},
		{"unknown-video-model", "480P"},
	}
	for _, item := range cases {
		if got := defaultVideoResolution(item.model); got != item.want {
			t.Fatalf("%s default resolution = %s, want %s", item.model, got, item.want)
		}
	}
}
