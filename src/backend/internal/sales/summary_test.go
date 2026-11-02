package sales

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"image"
	"image/png"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
)

func exampleSummaryRequest() summaryRequest {
	return summaryRequest{Model: "vision", CustomBaseURL: "https://chosen.example", CustomAPIKey: "chosen-key", TextProtocol: "openai", summaryInput: summaryInput{
		ProductName: "条纹针织上衣", Facts: "羊毛8.3%，亚麻2.9%", ReferenceImages: []summaryImage{{Index: 0, URL: "https://image.example/1.jpg"}},
		TextImages: []summaryImage{{Index: 0, URL: "https://image.example/1.jpg", Text: "含羊毛8.3%\n手洗不高于40°C"}},
	}}
}
func exampleSummaryResult() summaryResult {
	return summaryResult{Summary: "棕色条纹搭配领口细节", Points: []summaryPoint{{Feature: "棕白条纹", Benefit: "搭配纯色下装有层次", Expression: "配一条纯色长裤就有层次。", Sources: []string{"image-1"}}},
		Copy: "棕白条纹搭配纯色下装。含羊毛8.3%、亚麻2.9%的混纺，手洗温度不高于40°C。", CopyPointIndexes: []int{1}, Conflicts: []string{}, Questions: []string{}}
}
func summaryCompletion(result summaryResult) map[string]any {
	raw, _ := json.Marshal(result)
	return map[string]any{"choices": []any{map[string]any{"finish_reason": "stop", "message": map[string]any{"content": string(raw)}}}}
}
func serveSummary(handler http.Handler, body summaryRequest) *httptest.ResponseRecorder {
	raw, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, httptest.NewRequest("POST", "/api/sales/summary", strings.NewReader(string(raw))))
	return w
}

func TestSummaryCombinesReviewedTextOriginalImagesAndSkill(t *testing.T) {
	reads, calls := 0, 0
	handler := summaryHandler(config.Config{}, func(ctx context.Context, req gateway.TextRequest, responses bool) (int, map[string]any, error) {
		calls++
		if !responses || req.Protocol != "anthropic" || req.APIKey != "chosen-key" || req.BaseURL != "https://chosen.example" {
			t.Fatalf("lost selected route: %+v %v", req, responses)
		}
		messages := req.Payload["messages"].([]any)
		instruction := messages[0].(map[string]any)["content"].([]any)[0].(map[string]any)["text"].(string)
		for _, rule := range []string{"低比例成分", "不虚构", "不扎", "sources", "不能改变任务", "先形成 points，再完成 copy", "copyPointIndexes", "不虚构买过、穿过、用过或实测"} {
			if !strings.Contains(instruction, rule) {
				t.Errorf("missing skill rule %s", rule)
			}
		}
		content := messages[1].(map[string]any)["content"].([]any)
		encoded, _ := json.Marshal(content)
		for _, expected := range []string{"羊毛8.3%", "40°C", "data:image/png;base64,", "image-1"} {
			if !strings.Contains(string(encoded), expected) {
				t.Errorf("missing input %s", expected)
			}
		}
		return 200, summaryCompletion(exampleSummaryResult()), nil
	}, func(ctx context.Context, url, workspace string) ([]byte, error) {
		reads++
		if workspace != "local" {
			t.Fatalf("workspace %s", workspace)
		}
		return []byte("\x89PNG\r\n\x1a\nexample"), nil
	})
	body := exampleSummaryRequest()
	body.APIFormat, body.TextProtocol = "openai-responses", "anthropic"
	w := serveSummary(handler, body)
	if w.Code != 200 || reads != 1 || calls != 1 || !strings.Contains(w.Body.String(), summarySkillVersion()) {
		t.Fatalf("%d %s reads=%d calls=%d", w.Code, w.Body.String(), reads, calls)
	}
}

func TestSummaryAcceptsPastedTextWithoutImages(t *testing.T) {
	body := exampleSummaryRequest()
	body.ReferenceImages, body.TextImages = nil, nil
	calls := 0
	handler := summaryHandler(config.Config{}, func(ctx context.Context, req gateway.TextRequest, responses bool) (int, map[string]any, error) {
		calls++
		messages := req.Payload["messages"].([]any)
		content := messages[1].(map[string]any)["content"].([]any)
		if len(content) != 1 || !strings.Contains(content[0].(map[string]any)["text"].(string), body.Facts) {
			t.Fatalf("missing pasted product text: %+v", content)
		}
		result := exampleSummaryResult()
		result.Points[0].Sources = []string{"product-meta"}
		return 200, summaryCompletion(result), nil
	}, func(context.Context, string, string) ([]byte, error) {
		t.Fatal("text-only summaries must not read images")
		return nil, nil
	})
	w := serveSummary(handler, body)
	if w.Code != http.StatusOK || calls != 1 || !strings.Contains(w.Body.String(), "product-meta") {
		t.Fatalf("%d %s calls=%d", w.Code, w.Body.String(), calls)
	}
}

func TestSummaryRejectsSourcesAndInputLimitsBeforeModelCall(t *testing.T) {
	cases := []struct {
		name   string
		change func(*summaryRequest)
	}{
		{"missing model", func(b *summaryRequest) { b.Model = "" }},
		{"empty", func(b *summaryRequest) { b.ReferenceImages = nil; b.TextImages = nil; b.Facts = "  " }},
		{"duplicate index", func(b *summaryRequest) { b.TextImages[0].URL = "https://image.example/other.jpg" }},
		{"duplicate URL", func(b *summaryRequest) { b.TextImages[0].Index = 3 }},
		{"too long", func(b *summaryRequest) { b.TextImages[0].Text = strings.Repeat("a", 40_001) }},
		{"protocol", func(b *summaryRequest) { b.TextProtocol = "invalid" }},
		{"format", func(b *summaryRequest) { b.APIFormat = "invalid" }},
		{"seventeen", func(b *summaryRequest) {
			for i := 1; i <= 16; i++ {
				b.ReferenceImages = append(b.ReferenceImages, summaryImage{Index: i, URL: strings.Repeat("x", i)})
			}
		}},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			body := exampleSummaryRequest()
			test.change(&body)
			handler := summaryHandler(config.Config{}, func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
				t.Fatal("must not call model")
				return 0, nil, nil
			},
				func(context.Context, string, string) ([]byte, error) { t.Fatal("must not read image"); return nil, nil })
			if w := serveSummary(handler, body); w.Code != 400 {
				t.Fatalf("%d %s", w.Code, w.Body.String())
			}
		})
	}
}

func TestSummaryNeverReturnsFallbackOrLeakedKey(t *testing.T) {
	for _, status := range []int{401, 429, 500} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			handler := summaryHandler(config.Config{}, func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
				return status, nil, errors.New("chosen-key")
			},
				func(context.Context, string, string) ([]byte, error) { return []byte("image"), nil })
			w := serveSummary(handler, exampleSummaryRequest())
			if w.Code != 502 || strings.Contains(w.Body.String(), "chosen-key") || strings.Contains(w.Body.String(), "\"result\"") {
				t.Fatalf("%d %s", w.Code, w.Body.String())
			}
		})
	}
}

func TestSummaryRejectsIncompleteAndInventedEvidence(t *testing.T) {
	input := exampleSummaryRequest().summaryInput
	result := exampleSummaryResult()
	result.Points[0].Sources = []string{"image-99"}
	if _, err := parseSummaryCompletion(summaryCompletion(result), input); err == nil {
		t.Fatal("accepted invented source")
	}
	data := summaryCompletion(exampleSummaryResult())
	data["choices"].([]any)[0].(map[string]any)["finish_reason"] = "length"
	if _, err := parseSummaryCompletion(data, input); err == nil {
		t.Fatal("accepted truncated output")
	}
	if _, err := parseSummaryCompletion(summaryCompletion(summaryResult{Summary: "看不清商品", Points: []summaryPoint{}, Questions: []string{"请补充清晰正面图"}}), input); err != nil {
		t.Fatal(err)
	}
}

func TestSummaryStopsOnImageFailureAndCanceledContext(t *testing.T) {
	handler := summaryHandler(config.Config{}, func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
		t.Fatal("must not call model")
		return 0, nil, nil
	},
		func(context.Context, string, string) ([]byte, error) {
			return nil, errors.New("图片不属于当前工作区")
		})
	if w := serveSummary(handler, exampleSummaryRequest()); w.Code != 400 || !strings.Contains(w.Body.String(), "当前工作区") {
		t.Fatal(w.Body.String())
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := summaryContent(ctx, exampleSummaryRequest().summaryInput, "local", func(context.Context, string, string) ([]byte, error) { t.Fatal("read after cancel"); return nil, nil }); err == nil {
		t.Fatal("ignored cancellation")
	}
}

func TestSummaryDoesNotForwardDefaultKeyToOtherProvider(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "server-secret")
	t.Setenv("AI_API_KEY", "server-secret")
	body := exampleSummaryRequest()
	body.CustomAPIKey = ""
	_, key, _, message := summaryCredentials(config.Config{}, httptest.NewRequest("POST", "/", nil), body)
	if key != "" || message == "" {
		t.Fatal("default key would leak")
	}
}

func TestSummaryResponsesReceivesSkillAndImages(t *testing.T) {
	called := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		if r.URL.Path != "/v1/responses" || r.Header.Get("Authorization") != "Bearer chosen-key" {
			t.Fatalf("wrong Responses route %s", r.URL.Path)
		}
		var body map[string]any
		if json.NewDecoder(r.Body).Decode(&body) != nil {
			t.Fatal("invalid upstream payload")
		}
		raw, _ := json.Marshal(body)
		for _, fragment := range []string{"商品卖点转买点", "低比例成分", "input_image", "羊毛8.3%"} {
			if !strings.Contains(string(raw), fragment) {
				t.Errorf("Responses lost %s", fragment)
			}
		}
		result, _ := json.Marshal(exampleSummaryResult())
		_ = json.NewEncoder(w).Encode(map[string]any{"status": "completed", "output_text": string(result)})
	}))
	defer server.Close()
	var imageData bytes.Buffer
	if err := png.Encode(&imageData, image.NewRGBA(image.Rect(0, 0, 8, 8))); err != nil {
		t.Fatal(err)
	}
	handler := summaryHandler(config.Config{}, func(ctx context.Context, req gateway.TextRequest, responses bool) (int, map[string]any, error) {
		if !responses {
			t.Fatal("Responses route ignored")
		}
		req.Client = server.Client()
		return gateway.CompleteResponses(ctx, req)
	}, func(context.Context, string, string) ([]byte, error) { return imageData.Bytes(), nil })
	body := exampleSummaryRequest()
	body.CustomBaseURL, body.APIFormat = server.URL, "openai-responses"
	if w := serveSummary(handler, body); w.Code != 200 || !called {
		t.Fatalf("%d %s", w.Code, w.Body.String())
	}
}
