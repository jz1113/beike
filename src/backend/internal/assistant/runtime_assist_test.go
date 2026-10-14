package assistant

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSocialIntentCollectsLinksAndDefersAnalysis(t *testing.T) {
	intent := detectSocialIntent("看这个 https://www.xiaohongshu.com/explore/abc 只采集")
	if len(intent.urls) != 1 || intent.analyze {
		t.Fatalf("collect intent %+v", intent)
	}
	later := detectSocialIntent("从这些图片里挑 3 张封面")
	if len(later.urls) != 0 || !later.analyze {
		t.Fatalf("analyze intent %+v", later)
	}
	plain := detectSocialIntent("今天天气怎么样")
	if plain.analyze || len(plain.urls) != 0 {
		t.Fatalf("plain intent %+v", plain)
	}
}

func TestCompressHistoryKeepsShortThreads(t *testing.T) {
	messages := make([]map[string]any, 40)
	for i := range messages {
		messages[i] = map[string]any{"role": "user", "content": "第"}
	}
	out := compressHistory(context.Background(), messages, gatewayCreds{baseURL: "http://example", apiKey: "secret"}, "gemini-3.7-flash", true)
	if len(out) != 40 {
		t.Fatalf("short thread changed %d", len(out))
	}
	disabled := append(messages, map[string]any{"role": "user", "content": "多一条"})
	if len(compressHistory(context.Background(), disabled, gatewayCreds{baseURL: "http://example", apiKey: "secret"}, "gemini-3.7-flash", false)) != 41 {
		t.Fatal("disabled compression changed history")
	}
}

func TestCompressHistorySummarizesOverflow(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer secret" {
			t.Errorf("auth %s", r.Header.Get("Authorization"))
		}
		_, _ = io.WriteString(w, `{"choices":[{"message":{"content":"用户要做封面"}}]}`)
	}))
	defer server.Close()
	messages := []map[string]any{{"role": "system", "content": "规则"}}
	for i := 0; i < 41; i++ {
		messages = append(messages, map[string]any{"role": "user", "content": "消息"})
	}
	out := compressHistory(context.Background(), messages, gatewayCreds{baseURL: server.URL, apiKey: "secret"}, "gemini-3.7-flash", true)
	if out[0]["role"] != "system" {
		t.Fatal("system prompt dropped")
	}
	summary, _ := out[1]["content"].(string)
	if !strings.Contains(summary, "早期对话摘要") || !strings.Contains(summary, "用户要做封面") {
		t.Fatalf("summary %q", summary)
	}
	if len(out) != 12 {
		t.Fatalf("kept %d", len(out))
	}
}

func TestToolGroupsKeepWriteBarrier(t *testing.T) {
	groups := toolGroups([]string{"query_asset_library", "list_user_products", "update_plan", "get_workshop_state", "mcp_demo"})
	if len(groups) != 4 || len(groups[0]) != 2 || groups[1][0] != 2 || groups[2][0] != 3 || groups[3][0] != 4 {
		t.Fatalf("groups %#v", groups)
	}
	if isParallelSafe("extract_video_storyboard") || !isParallelSafe("read_attached_document") {
		t.Fatal("parallel policy")
	}
}

func TestShortlistResumesCheckpoint(t *testing.T) {
	dir := t.TempDir()
	images := make([]collectedImage, 25)
	for i := range images {
		images[i] = collectedImage{URL: "https://img.example/item", Label: "图", Source: "https://src.example/a"}
	}
	saved := map[int]ratedImage{}
	for id := 1; id <= len(images); id++ {
		saved[id] = ratedImage{ID: id, Score: 80, Readable: true, Reason: "可用"}
	}
	key := selectionKey(2, "scope", images, "封面")
	if err := writeSelection(filepath.Join(dir, key+".json"), saved); err != nil {
		t.Fatal(err)
	}
	selected, report, err := shortlistImages(context.Background(), gatewayCreds{baseURL: "http://gateway.example", apiKey: "secret"}, "other-model", "封面", "scope", dir, images, func(*http.Request) (*http.Response, error) {
		t.Fatal("checkpoint should skip the model")
		return nil, os.ErrClosed
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(selected) != 24 || !strings.Contains(report, "已逐批评估 25") {
		t.Fatalf("selected %d %s", len(selected), report)
	}
}
