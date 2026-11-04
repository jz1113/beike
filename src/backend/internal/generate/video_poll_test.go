package generate

import (
	"strings"
	"testing"
)

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
	nestedJSON := readVideoPoll(map[string]any{"status": "FAILURE", "fail_reason": `{"code":"1501","message":"Input material may contain sensitive content: videoUrls[0]. Please replace the material and try again | 用户输入的素材可能包含敏感内容：videoUrls[0]，请更换素材后重试"}`})
	if nestedJSON.status != "FAILURE" || !strings.Contains(nestedJSON.reason, "参考视频未通过安全检测") || strings.Contains(nestedJSON.reason, `"code"`) {
		t.Fatalf("nested json fail_reason: %+v", nestedJSON)
	}
}

func TestReadVideoPollDoesNotFinishQueuedResults(t *testing.T) {
	for _, status := range []string{"PENDING", "SUBMITTED", "NOT_START", "QUEUED", "RUNNING"} {
		t.Run(status, func(t *testing.T) {
			parsed := readVideoPoll(map[string]any{"status": status, "url": "https://cdn.example/preview.mp4"})
			if parsed.status != "IN_PROGRESS" || parsed.result != "" {
				t.Fatalf("unfinished task became downloadable: %+v", parsed)
			}
		})
	}
	parsed := readVideoPoll(map[string]any{"url": "https://cdn.example/completed.mp4"})
	if parsed.status != "SUCCESS" || parsed.result == "" {
		t.Fatalf("result-only completion lost: %+v", parsed)
	}
}
