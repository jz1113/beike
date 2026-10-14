package review

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestReviewDisablesThinkingForGatewayDeepSeek(t *testing.T) {
	body := map[string]any{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		if json.Unmarshal(raw, &body) != nil {
			t.Fatalf("body %s", raw)
		}
		_, _ = w.Write([]byte(`{"usage":{"total_tokens":3},"choices":[{"finish_reason":"stop","message":{"content":"{\"results\":[[\"1\",\"动物\",\"制作\",\"猫砂属于宠物用品\",\"\"]]}"}}]}`))
	}))
	defer server.Close()
	blank := "  "
	expansion := "猫砂盆"
	result, err := Review(context.Background(), server.Client(), Input{
		BaseURL: server.URL, APIKey: "secret", Model: "deepseek-v4.1-flash", Provider: "gateway",
		Rows: []Row{{ID: "row-1", Query: "猫砂", Expansion: &blank, EntityExpansion: &expansion, ContentType: &blank}},
	})
	if err != nil || len(result.Results) != 1 || len(result.Failed) != 0 {
		t.Fatalf("result %#v err %v", result, err)
	}
	thinking, _ := body["thinking"].(map[string]any)
	if thinking["type"] != "disabled" {
		t.Fatalf("thinking %#v", body["thinking"])
	}
	messages, _ := body["messages"].([]any)
	system, _ := messages[0].(map[string]any)["content"].(string)
	user, _ := messages[1].(map[string]any)["content"].(string)
	if !strings.Contains(system, "定长数组") || strings.Contains(user, `"expansion"`) || strings.Contains(user, `"contentType"`) || !strings.Contains(user, "猫砂盆") {
		t.Fatalf("prompt %s", user)
	}
}

func TestReviewLeavesThinkingEnabledForOtherGatewayModels(t *testing.T) {
	body := map[string]any{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &body)
		_, _ = w.Write([]byte(`{"choices":[{"finish_reason":"stop","message":{"content":"{\"results\":[[\"1\",\"动物\",\"制作\",\"猫砂属于宠物用品\",\"\"]]}"}}]}`))
	}))
	defer server.Close()
	_, err := Review(context.Background(), server.Client(), Input{
		BaseURL: server.URL, APIKey: "secret", Model: "gemini-3.8-flash", Provider: "gateway",
		Rows: []Row{{ID: "row-1", Query: "猫砂"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := body["thinking"]; ok {
		t.Fatalf("thinking %#v", body["thinking"])
	}
}

func TestReviewSalvagesTruncatedRows(t *testing.T) {
	content := `{"results":[["1","动物","制作","猫砂属于宠物用品",""],["2","美食","制作","菜谱属于美食",""],["3","美`
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		encoded, _ := json.Marshal(map[string]any{
			"usage":   map[string]any{"completion_tokens": 12288},
			"choices": []any{map[string]any{"finish_reason": "length", "message": map[string]any{"content": content}}},
		})
		_, _ = w.Write(encoded)
	}))
	defer server.Close()
	result, err := Review(context.Background(), server.Client(), Input{
		BaseURL: server.URL, APIKey: "secret", Model: "deepseek-v4.1-flash", Provider: "gateway",
		Rows: []Row{{ID: "a", Query: "猫砂"}, {ID: "b", Query: "红烧肉"}, {ID: "c", Query: "未完成"}},
	})
	if err != nil || len(result.Results) != 2 || len(result.Failed) != 1 || result.Failed[0] != "c" {
		t.Fatalf("result %#v err %v", result, err)
	}
	if result.Results[0]["id"] != "a" || result.Results[1]["category"] != "美食" {
		t.Fatalf("rows %#v", result.Results)
	}
}

func TestReviewRejectsTruncationWithoutACompleteRow(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		encoded, _ := json.Marshal(map[string]any{
			"choices": []any{map[string]any{"finish_reason": "length", "message": map[string]any{"content": `{"results":[`}}},
		})
		_, _ = w.Write(encoded)
	}))
	defer server.Close()
	_, err := Review(context.Background(), server.Client(), Input{
		BaseURL: server.URL, APIKey: "secret", Model: "deepseek-v4.1-flash", Provider: "gateway",
		Rows: []Row{{ID: "a", Query: "猫砂"}},
	})
	if _, ok := err.(*OutputError); !ok || err == nil || !strings.Contains(err.Error(), "输出被截断") {
		t.Fatalf("err %v", err)
	}
}
