package generate

import "testing"

func TestReadVideoPollRequiresResultURL(t *testing.T) {
	missing := readVideoPoll(map[string]any{"status": "SUCCESS"})
	if missing.status == "SUCCESS" || missing.result != "" {
		t.Fatalf("success without url: %+v", missing)
	}
	content := readVideoPoll(map[string]any{"status": "SUCCESS", "content": map[string]any{"video_url": "https://cdn.example/a.mp4"}})
	if content.status != "SUCCESS" || content.result != "https://cdn.example/a.mp4" {
		t.Fatalf("content url: %+v", content)
	}
	kling := readVideoPoll(map[string]any{"data": map[string]any{"task_status": "succeed", "task_result": map[string]any{"videos": []any{map[string]any{"url": "https://cdn.example/b.mp4"}}}}})
	if kling.status != "SUCCESS" || kling.result != "https://cdn.example/b.mp4" {
		t.Fatalf("kling url: %+v", kling)
	}
	grok := readVideoPoll(map[string]any{"status": "done", "video": map[string]any{"url": "https://cdn.example/grok.mp4"}})
	if grok.status != "SUCCESS" || grok.result != "https://cdn.example/grok.mp4" {
		t.Fatalf("grok url: %+v", grok)
	}
	failed := readVideoPoll(map[string]any{"status": "failed", "error": map[string]any{"message": "上游拒绝"}})
	if failed.status != "FAILURE" || failed.reason != "上游拒绝" {
		t.Fatalf("grok error: %+v", failed)
	}
}
