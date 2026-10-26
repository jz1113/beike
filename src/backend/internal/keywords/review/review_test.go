package review

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
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

func TestReviewSendsChosenReasoningEffort(t *testing.T) {
	body := map[string]any{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		if json.Unmarshal(raw, &body) != nil {
			t.Fatalf("body %s", raw)
		}
		_, _ = w.Write([]byte(`{"choices":[{"finish_reason":"stop","message":{"content":"{\"results\":[[\"1\",\"动物\",\"制作\",\"猫砂属于宠物用品\",\"\"]]}"}}]}`))
	}))
	defer server.Close()
	_, err := Review(context.Background(), server.Client(), Input{
		BaseURL: server.URL, APIKey: "secret", Model: "deepseek-v4.1-flash", Provider: "gateway",
		ReasoningEffort: "high", Rows: []Row{{ID: "row-1", Query: "猫砂"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if body["reasoning_effort"] != "high" {
		t.Fatalf("reasoning %#v", body["reasoning_effort"])
	}
	if _, ok := body["thinking"]; ok {
		t.Fatalf("thinking %#v", body["thinking"])
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
		BaseURL: server.URL, APIKey: "secret", Model: "gemini-3.8-flash", Provider: "gateway", TextProtocol: "openai",
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

func TestReviewFallsBackWhenGeminiStreamEndpointIsRejected(t *testing.T) {
	var paths []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path)
		if strings.HasSuffix(r.URL.Path, ":streamGenerateContent") {
			w.WriteHeader(530)
			_, _ = w.Write([]byte("<html>error 530</html>"))
			return
		}
		if !strings.HasSuffix(r.URL.Path, ":generateContent") {
			t.Errorf("path %s", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"candidates": []any{map[string]any{
				"finishReason": "STOP",
				"content":      map[string]any{"parts": []any{map[string]any{"text": `{"results":[["1","动物","制作","猫砂属于宠物用品",""]]}`}}},
			}},
			"usageMetadata": map[string]any{"promptTokenCount": 1, "candidatesTokenCount": 2, "totalTokenCount": 3},
		})
	}))
	defer server.Close()
	result, err := Review(context.Background(), server.Client(), Input{
		BaseURL: server.URL, APIKey: "secret", Model: "gemini-3.8-flash", Provider: "gateway",
		Rows: []Row{{ID: "row-1", Query: "猫砂"}},
	})
	if err != nil || len(result.Results) != 1 || result.Results[0]["id"] != "row-1" || result.Results[0]["category"] != "动物" {
		t.Fatalf("result %#v err %v", result, err)
	}
	if len(paths) != 2 || !strings.HasSuffix(paths[0], ":streamGenerateContent") || !strings.HasSuffix(paths[1], ":generateContent") {
		t.Fatalf("paths %#v", paths)
	}
}

func TestReviewDoesNotResubmitWhenGeminiStreamConnectionDrops(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		conn, _, err := w.(http.Hijacker).Hijack()
		if err != nil {
			t.Error(err)
			return
		}
		_ = conn.Close()
	}))
	defer server.Close()
	result, err := Review(context.Background(), server.Client(), Input{
		BaseURL: server.URL, APIKey: "secret", Model: "gemini-3.8-flash", Provider: "gateway",
		Rows: []Row{{ID: "row-1", Query: "猫砂"}},
	})
	if err == nil || len(result.Results) != 0 || calls.Load() != 1 {
		t.Fatalf("result %#v calls %d err %v", result, calls.Load(), err)
	}
}

func TestReviewDoesNotRetryGeminiAuthFailure(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":{"message":"invalid key"}}`))
	}))
	defer server.Close()
	_, err := Review(context.Background(), server.Client(), Input{
		BaseURL: server.URL, APIKey: "secret", Model: "gemini-3.8-flash", Provider: "gateway",
		Rows: []Row{{ID: "row-1", Query: "猫砂"}},
	})
	var upstream *UpstreamError
	if calls != 1 || !errors.As(err, &upstream) || upstream.Status != http.StatusUnauthorized {
		t.Fatalf("calls %d err %#v", calls, err)
	}
}

func TestReviewReadsOpenAIEventStream(t *testing.T) {
	content := `{"results":[["1","动物","制作","猫砂属于宠物用品",""]]}`
	body := map[string]any{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		if json.Unmarshal(raw, &body) != nil {
			t.Fatalf("body %s", raw)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		delta, _ := json.Marshal(map[string]any{
			"choices": []any{map[string]any{"index": 0, "delta": map[string]any{"content": content}, "finish_reason": "stop"}},
			"usage":   map[string]any{"total_tokens": 4},
		})
		_, _ = io.WriteString(w, "data: "+string(delta)+"\n\ndata: [DONE]\n\n")
	}))
	defer server.Close()
	result, err := Review(context.Background(), server.Client(), Input{
		BaseURL: server.URL, APIKey: "secret", Model: "deepseek-v4.1-flash", Provider: "gateway",
		Rows: []Row{{ID: "row-1", Query: "猫砂"}},
	})
	if err != nil || len(result.Results) != 1 || result.Results[0]["id"] != "row-1" || result.Results[0]["category"] != "动物" {
		t.Fatalf("result %#v err %v", result, err)
	}
	if body["stream"] != true {
		t.Fatalf("stream %#v", body["stream"])
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
