package generate

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDashscopeRoutesSyncAndAsync(t *testing.T) {
	var sawPath, sawAsync, sawBody string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sawPath = r.URL.Path
		sawAsync = r.Header.Get("X-DashScope-Async")
		raw := make([]byte, r.ContentLength)
		_, _ = r.Body.Read(raw)
		sawBody = string(raw)
		if strings.Contains(r.URL.Path, "image-generation") {
			_, _ = w.Write([]byte(`{"output":{"task_id":"task-1","task_status":"PENDING"}}`))
			return
		}
		_, _ = w.Write([]byte(`{"output":{"choices":[{"message":{"content":[{"image":"https://cdn.example/a.png"}]}}]}}`))
	}))
	defer server.Close()
	previous := ModelHTTP
	ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { ModelHTTP = previous })

	syncResult, err := (dashscopeImageProtocol{}).Submit(imageRequest{
		Ctx: context.Background(), Base: server.URL, APIKey: "secret", Model: "qwen-image-2.0",
		Prompt: `海报"春季"`, Size: "1:1", Quality: "low", Strength: "medium", Negative: "模糊",
	})
	if err != nil || syncResult.Direct != "https://cdn.example/a.png" || syncResult.TaskID != "" {
		t.Fatalf("sync %#v %v", syncResult, err)
	}
	if sawPath != "/api/v1/services/aigc/multimodal-generation/generation" || sawAsync != "" {
		t.Fatalf("sync path %s async %s", sawPath, sawAsync)
	}
	if !strings.Contains(sawBody, `"size":"1280*1280"`) || !strings.Contains(sawBody, `"prompt_extend":true`) || strings.Contains(sawBody, `"enable_thinking"`) || !strings.Contains(sawBody, `"negative_prompt":"模糊"`) || !strings.Contains(sawBody, `海报\"春季\"`) {
		t.Fatalf("sync body %s", sawBody)
	}

	qwenSync, err := (dashscopeImageProtocol{}).Submit(imageRequest{
		Ctx: context.Background(), Base: server.URL, APIKey: "secret", Model: "qwen-image-3.0-pro",
		Prompt: "海报", Size: "3:4", Quality: "high", Strength: "high", Negative: "模糊",
	})
	if err != nil || qwenSync.Direct != "https://cdn.example/a.png" || qwenSync.TaskID != "" {
		t.Fatalf("qwen sync %#v %v", qwenSync, err)
	}
	if sawPath != "/api/v1/services/aigc/multimodal-generation/generation" || sawAsync != "" {
		t.Fatalf("qwen sync path %s header %s", sawPath, sawAsync)
	}
	if !strings.Contains(sawBody, `"size":"1488*2048"`) || !strings.Contains(sawBody, `"enable_thinking":true`) || !strings.Contains(sawBody, `"negative_prompt":"模糊"`) {
		t.Fatalf("qwen sync body %s", sawBody)
	}

	asyncResult, err := (dashscopeImageProtocol{}).Submit(imageRequest{
		Ctx: context.Background(), Base: server.URL, APIKey: "secret", Model: "wan2.7-image-pro",
		Prompt: "街景", Size: "1:1", Quality: "high", Strength: "low", Negative: "模糊",
	})
	if err != nil || asyncResult.TaskID != "task-1" || asyncResult.Direct != "" {
		t.Fatalf("async %#v %v", asyncResult, err)
	}
	if sawPath != "/api/v1/services/aigc/image-generation/generation" || sawAsync != "enable" {
		t.Fatalf("async path %s header %s", sawPath, sawAsync)
	}
	if !strings.Contains(sawBody, `"size":"4096*4096"`) || !strings.Contains(sawBody, `"thinking_mode":false`) || strings.Contains(sawBody, "negative_prompt") {
		t.Fatalf("async body %s", sawBody)
	}
}

func TestDashscopePollAndErrors(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/tasks/task-1":
			_, _ = w.Write([]byte(`{"output":{"task_status":"SUCCEEDED","task_id":"task-1","choices":[{"message":{"content":[{"image":"https://cdn.example/b.png"}]}}]}}`))
		case "/api/v1/tasks/task-failed":
			_, _ = w.Write([]byte(`{"output":{"task_status":"FAILED","code":"DataInspectionFailed","message":"blocked"}}`))
		case "/api/v1/tasks/task-invalid":
			_, _ = w.Write([]byte(`{"output":{"task_status":"FAILED","code":"InvalidParameter","message":"size is invalid"}}`))
		default:
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"code":"DataInspectionFailed","message":"blocked"}`))
		}
	}))
	defer server.Close()
	previous := ModelHTTP
	ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { ModelHTTP = previous })

	parsed, _, ok := (dashscopeImageProtocol{}).Poll(imagePollRequest{Ctx: context.Background(), Base: server.URL, APIKey: "secret", TaskID: "task-1"})
	if !ok || parsed.status != "SUCCESS" || parsed.result != "https://cdn.example/b.png" {
		t.Fatalf("poll %#v %v", parsed, ok)
	}
	failed, _, ok := (dashscopeImageProtocol{}).Poll(imagePollRequest{Ctx: context.Background(), Base: server.URL, APIKey: "secret", TaskID: "task-failed"})
	if !ok || failed.status != "FAILURE" || failed.reason != "内容审核未通过，请修改提示词后重试" {
		t.Fatalf("failed %#v %v", failed, ok)
	}
	invalid, _, ok := (dashscopeImageProtocol{}).Poll(imagePollRequest{Ctx: context.Background(), Base: server.URL, APIKey: "secret", TaskID: "task-invalid"})
	if !ok || invalid.status != "FAILURE" || invalid.reason != "size is invalid" {
		t.Fatalf("invalid %#v %v", invalid, ok)
	}
	rejected, err := (dashscopeImageProtocol{}).Submit(imageRequest{Ctx: context.Background(), Base: server.URL, APIKey: "secret", Model: "qwen-image-2.0", Prompt: "猫", Size: "1:1", Quality: "low"})
	if err != nil || rejected.Status != http.StatusBadRequest || rejected.Data["message"] != "内容审核未通过，请修改提示词后重试" {
		t.Fatalf("reject %#v %v", rejected, err)
	}
	old, err := (dashscopeImageProtocol{}).Submit(imageRequest{Ctx: context.Background(), Base: server.URL, Model: "wan2.5-t2i-preview", Prompt: "猫"})
	if err != nil || old.Status != http.StatusBadRequest || !strings.Contains(old.Data["message"].(string), "暂未适配") {
		t.Fatalf("old %#v %v", old, err)
	}
}

func TestDashscopeSizeTable(t *testing.T) {
	cases := []struct{ model, size, quality, want string }{
		{"qwen-image-3.0-pro", "3:4", "high", "1488*2048"},
		{"qwen-image-3.0-pro", "16:9", "high", "2048*1168"},
		{"qwen-image-3.0", "1:1", "low", "1280*1280"},
		{"wan2.7-image-pro", "1:1", "high", "4096*4096"},
		{"wan2.7-image", "1:1", "high", "2048*2048"},
		{"wan2.6-t2i", "16:9", "low", "1696*960"},
	}
	for _, item := range cases {
		if got := dashscopePixelSize(item.model, item.size, item.quality); got != item.want {
			t.Fatalf("%s %s %s got %s", item.model, item.size, item.quality, got)
		}
	}
}

func TestDashscopeThinkingAndReferenceLimits(t *testing.T) {
	medium := dashscopeImageBody(imageRequest{
		Model: "qwen-image-3.0-pro", Prompt: "猫", Strength: "medium", Negative: strings.Repeat("糊", 600),
	}, "qwen", nil, "1024*1024")
	params := medium["parameters"].(map[string]any)
	negative, _ := params["negative_prompt"].(string)
	if params["prompt_extend"] != true || params["enable_thinking"] != false || len([]rune(negative)) != 500 {
		t.Fatalf("medium %#v", params)
	}
	pro := dashscopeImageBody(imageRequest{
		Model: "qwen-image-2.1-pro", Prompt: "猫", Strength: "high", Negative: "模糊",
	}, "qwen", nil, "1024*1024")
	proParams := pro["parameters"].(map[string]any)
	if _, ok := proParams["negative_prompt"]; ok || proParams["enable_thinking"] != true {
		t.Fatalf("2.1-pro %#v", proParams)
	}
	refs := make([]string, 4)
	for i := range refs {
		refs[i] = "https://cdn.example/" + strings.Repeat("a", i+1) + ".png"
	}
	_, err := (dashscopeImageProtocol{}).Submit(imageRequest{
		Ctx: context.Background(), Model: "qwen-image-3.0", Prompt: "猫", Refs: refs,
	})
	if err == nil || !strings.Contains(err.Error(), "最多支持 3 张参考图") {
		t.Fatal(err)
	}
	refs = make([]string, 11)
	for i := range refs {
		refs[i] = "https://cdn.example/" + strings.Repeat("b", i+1) + ".png"
	}
	_, err = (dashscopeImageProtocol{}).Submit(imageRequest{
		Ctx: context.Background(), Model: "qwen-image-2.1-turbo", Prompt: "猫", Refs: refs,
	})
	if err == nil || !strings.Contains(err.Error(), "最多支持 10 张参考图") {
		t.Fatal(err)
	}
}

func TestDashscopeStorageReferenceBecomesDataURL(t *testing.T) {
	png, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
	if err != nil {
		t.Fatal(err)
	}
	rel := filepath.Join("local", "dashscope-ref.png")
	path := filepath.Join(".azhuo_storage", rel)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, png, 0o644); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(".azhuo_storage") })

	var saw string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		raw, _ := json.Marshal(body)
		saw = string(raw)
		_, _ = w.Write([]byte(`{"output":{"choices":[{"message":{"content":[{"image":"https://cdn.example/c.png"}]}}]}}`))
	}))
	defer server.Close()
	previous := ModelHTTP
	ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { ModelHTTP = previous })

	result, err := (dashscopeImageProtocol{}).Submit(imageRequest{
		Ctx: context.Background(), Base: server.URL, APIKey: "secret", Model: "qwen-image-edit",
		Prompt: "改成白底", Size: "1:1", Quality: "medium", Strength: "medium", Workspace: "local",
		Refs: []string{"/storage/" + filepath.ToSlash(rel)},
	})
	if err != nil || result.Direct == "" {
		t.Fatalf("result %#v %v", result, err)
	}
	if !strings.Contains(saw, `"image":"data:image/png;base64,`) || !strings.Contains(saw, `"prompt_extend":true`) || strings.Contains(saw, `"enable_thinking"`) {
		t.Fatalf("body %s", saw)
	}
	var payload map[string]any
	if json.Unmarshal([]byte(saw), &payload) != nil {
		t.Fatal(saw)
	}
	input := payload["input"].(map[string]any)
	messages := input["messages"].([]any)
	content := messages[0].(map[string]any)["content"].([]any)
	if _, ok := content[0].(map[string]any)["image"]; !ok {
		t.Fatalf("content order %s", saw)
	}
	if _, ok := content[1].(map[string]any)["text"]; !ok {
		t.Fatalf("content text %s", saw)
	}
}
