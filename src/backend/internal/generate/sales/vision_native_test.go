package sales

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
)

const salesPNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
const salesAnalysisJSON = `{"productName":"卫衣","category":"fashion","sellingPoints":["黑色圆领"],"targetAudience":"日常"}`

func TestSalesStagesUseTheirOwnProtocol(t *testing.T) {
	paths := []string{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path)
		if r.URL.Path == "/v1beta/models/gemini-2.5-flash:generateContent" {
			if r.Header.Get("x-goog-api-key") != "analysis-key" {
				t.Error("analysis credentials mixed")
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"candidates": []any{map[string]any{"finishReason": "STOP", "content": map[string]any{"parts": []any{map[string]any{"text": `{"productName":"纸巾","category":"home","sellingPoints":["白色"],"targetAudience":"家庭"}`}}}}}})
		} else if r.URL.Path == "/v1/messages" {
			if r.Header.Get("x-api-key") != "script-key" {
				t.Error("script credentials mixed")
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"content": []any{map[string]any{"type": "text", "text": validWorkflowScript()}}, "stop_reason": "end_turn", "usage": map[string]any{"input_tokens": 1, "output_tokens": 2}})
		} else {
			t.Errorf("unexpected path %s", r.URL.Path)
			w.WriteHeader(500)
		}
	}))
	defer server.Close()
	previous := generate.ModelHTTP
	generate.ModelHTTP = func() *http.Client { return server.Client() }
	defer func() { generate.ModelHTTP = previous }()
	payload := workflowPayload()
	payload["imageCatalog"] = []map[string]any{{"index": 2, "url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "role": "main"}}
	payload["model"] = "gemini-2.5-flash"
	payload["textProtocol"] = "gemini"
	payload["customBaseUrl"] = server.URL
	payload["customApiKey"] = "analysis-key"
	analysis := postSales(t, Analyze(config.Config{}), "/analyze", payload)
	if analysis.Code != 200 {
		t.Fatalf("analysis %d %s", analysis.Code, analysis.Body.String())
	}
	payload["model"] = "custom-script"
	payload["textProtocol"] = "anthropic"
	payload["customApiKey"] = "script-key"
	script := postSales(t, Script(config.Config{}), "/script", payload)
	if script.Code != 200 {
		t.Fatalf("script %d %s", script.Code, script.Body.String())
	}
	if len(paths) != 2 || paths[0] == paths[1] {
		t.Fatalf("paths %#v", paths)
	}
}

func TestSalesNativeErrorsDoNotFallbackOrReplay(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(503)
		_, _ = w.Write([]byte(`{"error":{"message":"busy"}}`))
	}))
	defer server.Close()
	previous := generate.ModelHTTP
	generate.ModelHTTP = func() *http.Client { return server.Client() }
	defer func() { generate.ModelHTTP = previous }()
	payload := map[string]any{
		"workflowVersion": 3, "category": "fashion", "model": "gemini-2.5-flash", "textProtocol": "gemini", "customBaseUrl": server.URL, "customApiKey": "secret", "productName": "纸巾",
		"targetDuration": 15, "aspectRatio": "9:16",
		"imageCatalog":         []map[string]any{{"index": 1, "url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "role": "main"}},
		"eligibleImageIndexes": []int{1},
	}
	for _, handler := range []http.Handler{Script(config.Config{}), Analyze(config.Config{})} {
		body, _ := json.Marshal(payload)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body)))
		if rec.Code != 502 || strings.Contains(rec.Body.String(), `"success":true`) {
			t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
		}
	}
	if calls != 2 {
		t.Fatalf("replayed native requests: %d", calls)
	}
}

func anthropicText(text string) string {
	raw, _ := json.Marshal(map[string]any{"content": []any{map[string]any{"type": "text", "text": text}}, "stop_reason": "end_turn"})
	return string(raw)
}

func salesImages(count int) []map[string]any {
	images := make([]map[string]any, count)
	for i := range images {
		images[i] = map[string]any{"index": i + 1, "url": salesPNG, "role": "main"}
	}
	return images
}

func postAnthropicAnalysis(t *testing.T, server *httptest.Server, images []map[string]any) *httptest.ResponseRecorder {
	t.Helper()
	previous := generate.ModelHTTP
	generate.ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { generate.ModelHTTP = previous })
	indexes := make([]int, len(images))
	for i, image := range images {
		indexes[i], _ = image["index"].(int)
	}
	payload := map[string]any{
		"workflowVersion": 3, "category": "fashion", "model": "claude-5.5-haiku", "textProtocol": "anthropic", "productName": "卫衣",
		"customBaseUrl": server.URL + "/v1/chat/completions", "customApiKey": "analysis-secret",
		"imageCatalog": images, "eligibleImageIndexes": indexes,
	}
	body, _ := json.Marshal(payload)
	rec := httptest.NewRecorder()
	Analyze(config.Config{}).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/analyze", bytes.NewReader(body)))
	return rec
}

func TestAnalyzeAnthropicOfficialMessages(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() { io.WriteString(w, anthropicText(salesAnalysisJSON)) }()
		if r.URL.Path != "/v1/messages" || r.Header.Get("x-api-key") != "analysis-secret" || r.Header.Get("anthropic-version") != "2023-06-01" || r.Header.Get("Authorization") != "" {
			t.Errorf("official request %s", r.URL.Path)
		}
		var body map[string]any
		raw, _ := io.ReadAll(r.Body)
		if json.Unmarshal(raw, &body) != nil || strings.Contains(string(raw), "image_url") || strings.Contains(string(raw), "response_format") || strings.Contains(string(raw), "data:image/png;base64,") {
			t.Errorf("request did not use Anthropic image blocks: %s", r.URL.Path)
			return
		}
		if body["max_tokens"] != float64(longOutputTokens) || body["system"] == nil {
			t.Errorf("missing official fields: %#v", body)
			return
		}
		count := 0
		messages, _ := body["messages"].([]any)
		for _, message := range messages {
			parts, _ := message.(map[string]any)["content"].([]any)
			for _, part := range parts {
				item, _ := part.(map[string]any)
				if item["type"] != "image" {
					continue
				}
				source, _ := item["source"].(map[string]any)
				if source["type"] != "base64" || source["media_type"] != "image/png" || source["data"] == "" {
					t.Errorf("image source %#v", source)
				}
				count++
			}
		}
		if count != 2 {
			t.Errorf("images %d", count)
		}
	}))
	defer server.Close()
	rec := postAnthropicAnalysis(t, server, salesImages(2))
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"coveredImageCount":2`) || strings.Contains(rec.Body.String(), "analysis-secret") {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
}

func TestAnalyzeAnthropicReportsSafeStageErrors(t *testing.T) {
	for _, tc := range []struct {
		name, status, body, want string
		images                   int
		calls                    int
	}{
		{"unauthorized", "401", `{"error":{"message":"bad analysis-secret token=signed-url"}}`, "鉴权失败", 1, 1},
		{"limited", "429", `{"error":{"message":"analysis-secret"}}`, "触发限流", 1, 1},
		{"unavailable", "503", `{"error":{"message":"analysis-secret"}}`, "服务暂不可用（HTTP 503）", 1, 1},
		{"invalid json", "200", anthropicText("not-json-secret"), "没有返回有效 JSON", 1, 1},
		{"missing points", "200", anthropicText(`{"productName":"卫衣"}`), "没有返回可用卖点", 1, 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			calls := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				if tc.status != "200" {
					w.WriteHeader(map[string]int{"401": 401, "429": 429, "503": 503}[tc.status])
				}
				io.WriteString(w, tc.body)
			}))
			defer server.Close()
			rec := postAnthropicAnalysis(t, server, salesImages(tc.images))
			if rec.Code != 502 || calls != tc.calls || !strings.Contains(rec.Body.String(), tc.want) || strings.Contains(rec.Body.String(), `"success":true`) || strings.Contains(rec.Body.String(), "analysis-secret") || strings.Contains(rec.Body.String(), "not-json-secret") || strings.Contains(rec.Body.String(), "token=signed-url") {
				t.Fatalf("calls %d status %d body %s", calls, rec.Code, rec.Body.String())
			}
		})
	}
}

func TestAnalyzeAnthropicBatchAndSummaryFailures(t *testing.T) {
	for _, summary := range []bool{false, true} {
		calls := 0
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			calls++
			if calls == 3 || (!summary && calls == 2) {
				w.WriteHeader(http.StatusServiceUnavailable)
				io.WriteString(w, `{"error":{"message":"analysis-secret"}}`)
				return
			}
			io.WriteString(w, anthropicText(salesAnalysisJSON))
		}))
		rec := postAnthropicAnalysis(t, server, salesImages(5))
		server.Close()
		want, expectCalls := "第 2/2 批", 2
		if summary {
			want, expectCalls = "商品分析汇总失败", 3
		}
		if rec.Code != 502 || calls != expectCalls || !strings.Contains(rec.Body.String(), want) || strings.Contains(rec.Body.String(), "analysis-secret") || strings.Contains(rec.Body.String(), `"degraded":true`) {
			t.Fatalf("summary=%v calls=%d body=%s", summary, calls, rec.Body.String())
		}
	}
}

func TestAnalyzeAnthropicTimeoutAndMissingInput(t *testing.T) {
	previous := productAnalysisTimeout
	productAnalysisTimeout = 200 * time.Millisecond
	t.Cleanup(func() { productAnalysisTimeout = previous })
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-time.After(2 * time.Second):
		}
	}))
	defer server.Close()
	rec := postAnthropicAnalysis(t, server, salesImages(1))
	if rec.Code != 502 || !strings.Contains(rec.Body.String(), "本次等待已结束，上游可能仍在生成并已计费，不要立刻再次提交") {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
	imageRec := httptest.NewRecorder()
	imageBody := `{"workflowVersion":3,"category":"fashion","model":"claude-5.5-haiku","textProtocol":"anthropic","customBaseUrl":"https://example.test","customApiKey":"analysis-secret","imageCatalog":[{"index":6,"url":"data:text/html;base64,SGk=","role":"main"}],"eligibleImageIndexes":[6]}`
	Analyze(config.Config{}).ServeHTTP(imageRec, httptest.NewRequest(http.MethodPost, "/analyze", strings.NewReader(imageBody)))
	if imageRec.Code != 502 || !strings.Contains(imageRec.Body.String(), "图片编号 6") || !strings.Contains(imageRec.Body.String(), "格式不受支持") || strings.Contains(imageRec.Body.String(), "SGk=") {
		t.Fatalf("%d %s", imageRec.Code, imageRec.Body.String())
	}
	for _, tc := range []struct{ body, want string }{
		{`{"workflowVersion":3,"category":"fashion","model":"claude-5.5-haiku","textProtocol":"anthropic","customApiKey":"analysis-secret"}`, "缺少 imageCatalog"},
		{`{"workflowVersion":3,"category":"fashion","model":"claude-5.5-haiku","textProtocol":"anthropic","imageCatalog":[{"index":1,"url":"` + salesPNG + `","role":"main"}],"eligibleImageIndexes":[1]}`, "请配置多模态模型地址和密钥"},
	} {
		response := httptest.NewRecorder()
		Analyze(config.Config{}).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/analyze", strings.NewReader(tc.body)))
		if response.Code != 400 || !strings.Contains(response.Body.String(), tc.want) || strings.Contains(response.Body.String(), `"success":true`) {
			t.Fatalf("%d %s", response.Code, response.Body.String())
		}
	}
}

func TestAnalyzeKeepsClosedJSONWhenOutputHitsLimit(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		raw, _ := io.ReadAll(r.Body)
		if json.Unmarshal(raw, &body) != nil || body["max_tokens"] != float64(longOutputTokens) {
			t.Errorf("analysis output budget %#v", body["max_tokens"])
		}
		encoded, _ := json.Marshal(map[string]any{"choices": []any{map[string]any{
			"finish_reason": "length",
			"message":       map[string]string{"content": salesAnalysisJSON},
		}}})
		_, _ = w.Write(encoded)
	}))
	defer server.Close()
	previous := generate.ModelHTTP
	generate.ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { generate.ModelHTTP = previous })
	payload := map[string]any{
		"workflowVersion": 3, "model": "vision-test", "textProtocol": "openai", "productName": "卫衣", "category": "fashion",
		"customBaseUrl": server.URL, "customApiKey": "analysis-secret", "imageCatalog": salesImages(1), "eligibleImageIndexes": []int{1},
	}
	rec := postSales(t, Analyze(config.Config{}), "/analyze", payload)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"sellingPoints"`) || strings.Contains(rec.Body.String(), errTruncatedOutput.Error()) {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
}

func TestAnalysisTimeoutCopyWarnsAboutBilling(t *testing.T) {
	if chatWait != 5*time.Minute {
		t.Fatalf("chat wait %s", chatWait)
	}
	want := "本次等待已结束，上游可能仍在生成并已计费，不要立刻再次提交"
	for _, tc := range []struct {
		status int
		err    error
	}{
		{0, context.DeadlineExceeded},
		{408, nil},
		{504, errors.New("gateway timeout")},
	} {
		if got := analysisFailureReason(tc.status, tc.err); got != want {
			t.Fatalf("status %d: %s", tc.status, got)
		}
	}
	if got := analysisFailureReason(0, context.Canceled); got != "已取消" {
		t.Fatal(got)
	}
	if got := analysisFailureReason(200, errTruncatedOutput); got != errTruncatedOutput.Error() {
		t.Fatal(got)
	}
}
