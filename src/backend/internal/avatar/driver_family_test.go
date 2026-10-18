package avatar

import (
	"strings"
	"testing"
)

func TestLipsyncReadsDashScopeEnvelope(t *testing.T) {
	id := readTaskID(map[string]any{"output": map[string]any{"task_id": "task-wanx"}})
	if id != "task-wanx" {
		t.Fatalf("task id %q", id)
	}
	url, failed, message := interpretLipsyncPoll([]byte(`{"output":{"task_status":"SUCCEEDED","video_url":"https://cdn.example/a.mp4"}}`))
	if failed || message != "" || url != "https://cdn.example/a.mp4" {
		t.Fatalf("poll %q %v %q", url, failed, message)
	}
	_, failed, message = interpretLipsyncPoll([]byte(`{"output":{"task_status":"FAILED","message":"no face"}}`))
	if !failed || message != "no face" {
		t.Fatalf("failure %v %q", failed, message)
	}
}

func TestClassifyDriverFamilies(t *testing.T) {
	cases := []struct {
		model  string
		family DriverFamily
		input  DriverInput
	}{
		{"kling-lip-sync", FamilyKling, InputEither},
		{"omnihuman-1.5", FamilyOmniHuman, InputImage},
		{"wanx-avatar-v2", FamilyWanx, InputEither},
		{"hedra-avatar", FamilyHedra, InputImage},
		{"latentsync", FamilyLatentSync, InputVideo},
		{"doubao-seedance-2.5", "", ""},
	}
	for _, item := range cases {
		spec, ok := ClassifyDriver(item.model)
		if item.family == "" {
			if ok {
				t.Fatalf("%s should not be a driver", item.model)
			}
			continue
		}
		if !ok || spec.Family != item.family || spec.Input != item.input {
			t.Fatalf("%s => %#v", item.model, spec)
		}
	}
}

func TestDriverEndpointsAndPayload(t *testing.T) {
	paths := driverSubmitPaths(FamilyKling)
	if !strings.Contains(paths[0], "/kling/v1/videos/lip-sync") {
		t.Fatalf("kling path %v", paths)
	}
	body := driverPayload(DriverSpec{FamilyOmniHuman, InputImage}, "omnihuman-1.5", "https://cdn/a.jpg", "https://cdn/a.mp3", "9:16", true)
	if body["image_url"] == "" || body["audio_url"] == "" {
		t.Fatalf("omni payload %#v", body)
	}
	if !mediaIsImage("https://cdn/face.png?x=1") || mediaIsImage("https://cdn/talk.mp4") {
		t.Fatal("media kind")
	}
}
