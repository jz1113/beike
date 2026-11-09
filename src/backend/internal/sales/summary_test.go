package sales

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
)

func exampleSummaryRequest() summaryRequest {
	return summaryRequest{Model: "vision", CustomBaseURL: "https://chosen.example", CustomAPIKey: "chosen-key", TextProtocol: "openai", summaryInput: summaryInput{
		TextSources: []summaryTextSource{{Index: 0, Text: "条纹针织上衣，含羊毛8.3%、亚麻2.9%\n手洗不高于40°C"}},
	}}
}
func exampleSummaryResult() summaryResult {
	return summaryResult{Summary: "棕色条纹搭配领口细节", Points: []summaryPoint{{Feature: "棕白条纹", Benefit: "搭配纯色下装有层次", Expression: "配一条纯色长裤就有层次。", Sources: []string{"ocr-1"}}},
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

func TestSummaryCombinesOnlyReviewedOCRTextAndSkill(t *testing.T) {
	reads, calls := 0, 0
	handler := summaryHandler(setupPromptExecutionTestConfig(t), func(ctx context.Context, req gateway.TextRequest, responses bool) (int, map[string]any, error) {
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
		for _, expected := range []string{"羊毛8.3%", "40°C", "ocr-1"} {
			if !strings.Contains(string(encoded), expected) {
				t.Errorf("missing input %s", expected)
			}
		}
		if len(content) != 1 || content[0].(map[string]any)["type"] != "text" {
			t.Fatal("OCR extraction must contain only one text block")
		}
		for _, excluded := range []string{"image_url", "imageSource", "product-meta", "merchantFacts", "labelCautions"} {
			if strings.Contains(string(encoded), excluded) {
				t.Errorf("unexpected non-OCR input %s", excluded)
			}
		}
		if !strings.HasSuffix(instruction, summaryTextOnlyBoundary) {
			t.Fatal("missing OCR-only runtime input boundary")
		}
		return 200, summaryCompletion(exampleSummaryResult()), nil
	}, func(ctx context.Context, url, workspace string) ([]byte, error) {
		reads++
		t.Fatal("OCR extraction must not read original images")
		return nil, nil
	})
	body := exampleSummaryRequest()
	body.APIFormat, body.TextProtocol = "openai-responses", "anthropic"
	w := serveSummary(handler, body)
	if w.Code != 200 || reads != 0 || calls != 1 || !strings.Contains(w.Body.String(), summarySkillVersion()) {
		t.Fatalf("%d %s reads=%d calls=%d", w.Code, w.Body.String(), reads, calls)
	}
}

func TestSummaryRejectsProductFactsWithoutCurrentOCR(t *testing.T) {
	body := exampleSummaryRequest()
	body.TextSources = nil
	body.ProductName, body.Brand, body.Facts = "采集商品名称", "采集品牌", "补充商品文字"
	body.ReferenceImages = []summaryImage{{Index: 0, URL: "https://image.example/1.jpg"}}
	handler := summaryHandler(setupPromptExecutionTestConfig(t), func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
		t.Fatal("metadata without OCR must not reach the model")
		return 0, nil, nil
	}, func(context.Context, string, string) ([]byte, error) {
		t.Fatal("metadata without OCR must not read images")
		return nil, nil
	})
	w := serveSummary(handler, body)
	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "请先识别图片文字") {
		t.Fatalf("%d %s", w.Code, w.Body.String())
	}
}

func TestSummaryRejectsSourcesAndInputLimitsBeforeModelCall(t *testing.T) {
	cases := []struct {
		name   string
		change func(*summaryRequest)
	}{
		{"missing model", func(b *summaryRequest) { b.Model = "" }},
		{"empty", func(b *summaryRequest) { b.TextSources = nil }},
		{"duplicate index", func(b *summaryRequest) { b.TextSources = append(b.TextSources, b.TextSources[0]) }},
		{"negative index", func(b *summaryRequest) { b.TextSources[0].Index = -1 }},
		{"too long", func(b *summaryRequest) { b.TextSources[0].Text = strings.Repeat("a", 40_001) }},
		{"blank OCR", func(b *summaryRequest) { b.TextSources[0].Text = "  " }},
		{"protocol", func(b *summaryRequest) { b.TextProtocol = "invalid" }},
		{"format", func(b *summaryRequest) { b.APIFormat = "invalid" }},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			body := exampleSummaryRequest()
			test.change(&body)
			handler := summaryHandler(setupPromptExecutionTestConfig(t), func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
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
			handler := summaryHandler(setupPromptExecutionTestConfig(t), func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
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
	if _, err := parseSummaryCompletion(summaryCompletion(summaryResult{Summary: "文字资料不足", Points: []summaryPoint{}, Questions: []string{"请补充具体商品文字"}}), input); err != nil {
		t.Fatal(err)
	}
}

func TestSummaryStopsOnCanceledContextWithoutImageReads(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := summaryContent(ctx, exampleSummaryRequest().summaryInput, "local", func(context.Context, string, string) ([]byte, error) { t.Fatal("read after cancel"); return nil, nil }); !errors.Is(err, context.Canceled) {
		t.Fatal("ignored cancellation", err)
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

func TestSummaryResponsesReceivesSkillAndOnlyOCRText(t *testing.T) {
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
		for _, fragment := range []string{"商品卖点转买点", "低比例成分", "input_text", "羊毛8.3%"} {
			if !strings.Contains(string(raw), fragment) {
				t.Errorf("Responses lost %s", fragment)
			}
		}
		for _, excluded := range []string{"input_image", "image_url", "imageSource", "merchantFacts"} {
			if strings.Contains(string(raw), excluded) {
				t.Errorf("Responses received non-OCR input %s", excluded)
			}
		}
		result, _ := json.Marshal(exampleSummaryResult())
		_ = json.NewEncoder(w).Encode(map[string]any{"status": "completed", "output_text": string(result)})
	}))
	defer server.Close()
	handler := summaryHandler(setupPromptExecutionTestConfig(t), func(ctx context.Context, req gateway.TextRequest, responses bool) (int, map[string]any, error) {
		if !responses {
			t.Fatal("Responses route ignored")
		}
		req.Client = server.Client()
		return gateway.CompleteResponses(ctx, req)
	}, func(context.Context, string, string) ([]byte, error) {
		t.Fatal("Responses OCR extraction read an image")
		return nil, nil
	})
	body := exampleSummaryRequest()
	body.CustomBaseURL, body.APIFormat = server.URL, "openai-responses"
	if w := serveSummary(handler, body); w.Code != 200 || !called {
		t.Fatalf("%d %s", w.Code, w.Body.String())
	}
}

func TestSummaryCopyReferencesExistingBuyingPoints(t *testing.T) {
	input := exampleSummaryRequest().summaryInput
	for _, test := range []struct {
		name    string
		indexes []int
		valid   bool
	}{
		{"one focus", []int{1}, true},
		{"selected priorities", []int{3, 1}, true},
		{"three priorities", []int{1, 2, 3}, true},
		{"missing", nil, false},
		{"zero based", []int{0}, false},
		{"negative", []int{-1}, false},
		{"invented", []int{4}, false},
		{"duplicate", []int{1, 1}, false},
		{"too many", []int{1, 2, 3, 1}, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			result := exampleSummaryResult()
			result.Points = append(result.Points, result.Points[0], result.Points[0])
			result.CopyPointIndexes = test.indexes
			parsed, err := parseSummaryCompletion(summaryCompletion(result), input)
			if (err == nil) != test.valid {
				t.Fatalf("valid=%v error=%v", test.valid, err)
			}
			if err == nil && len(parsed.CopyPointIndexes) != len(test.indexes) {
				t.Fatal("selected buying points lost")
			}
		})
	}
}

func TestSummaryWithoutBuyingPointsRequestsEvidenceInsteadOfGenericCopy(t *testing.T) {
	input := exampleSummaryRequest().summaryInput
	result := summaryResult{Summary: "图片不足以辨认商品", Questions: []string{"请补充商品清晰正面图"}}
	parsed, err := parseSummaryCompletion(summaryCompletion(result), input)
	if err != nil || parsed.CopyPointIndexes == nil || len(parsed.CopyPointIndexes) != 0 {
		t.Fatalf("clarification rejected: %+v %v", parsed, err)
	}
	result.Copy = "这款商品兼顾品质与实用，满足日常所需。"
	if _, err := parseSummaryCompletion(summaryCompletion(result), input); err == nil {
		t.Fatal("accepted generic copy without supported buying points")
	}
}

func TestSummaryAcceptsRegisteredDeepSeekTextModelsOnOfficialRoute(t *testing.T) {
	for _, model := range []string{"deepseek-flash", "deepseek-v4-pro"} {
		t.Run(model, func(t *testing.T) {
			body := exampleSummaryRequest()
			body.Model, body.CustomBaseURL = "deepseek-official:"+model, "https://api.deepseek.com"
			handler := summaryHandler(setupPromptExecutionTestConfig(t), func(ctx context.Context, req gateway.TextRequest, responses bool) (int, map[string]any, error) {
				if req.BaseURL != "https://api.deepseek.com" || req.APIKey != "chosen-key" || req.Payload["model"] != model || req.Protocol != "openai" {
					t.Fatalf("official text model lost its route or credentials: model=%v base=%q protocol=%q", req.Payload["model"], req.BaseURL, req.Protocol)
				}
				messages := req.Payload["messages"].([]any)
				content := messages[1].(map[string]any)["content"].([]any)
				if len(content) != 1 || content[0].(map[string]any)["type"] != "text" {
					t.Fatal("official text model received non-text content")
				}
				return http.StatusOK, summaryCompletion(exampleSummaryResult()), nil
			}, func(context.Context, string, string) ([]byte, error) {
				t.Fatal("official text model read an image")
				return nil, nil
			})
			if w := serveSummary(handler, body); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), model) {
				t.Fatalf("%d %s", w.Code, w.Body.String())
			}
		})
	}
}

func TestSummaryDeepSeekRejectsUnknownModelsAndForeignRoutesWithoutDefaultKey(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "server-secret")
	t.Setenv("AI_API_KEY", "server-secret")
	for _, test := range []struct {
		name, model, base, key string
	}{
		{"unregistered", "deepseek-official:unregistered", "", "chosen-key"},
		{"foreign base", "deepseek-official:deepseek-v4-pro", "https://foreign.test", "chosen-key"},
		{"missing official key", "deepseek-official:deepseek-v4-pro", "", ""},
	} {
		t.Run(test.name, func(t *testing.T) {
			body := exampleSummaryRequest()
			body.Model, body.CustomBaseURL, body.CustomAPIKey = test.model, test.base, test.key
			_, key, _, message := summaryCredentials(config.Config{}, httptest.NewRequest("POST", "/", nil), body)
			if message == "" || key != "" || strings.Contains(message, "server-secret") {
				t.Fatalf("invalid official model route accepted or default credential leaked: %q", message)
			}
		})
	}
}

func TestSummaryReviewRejectsUnsupportedSellingClaims(t *testing.T) {
	for _, claim := range []string{"聚酯纤维与锦纶保证成衣版型稳定", "日常活动不容易松垮走形", "领口能自然拉长颈部线条", "轻盈不闷厚", "含羊毛所以亲肤保暖", "弹力罗纹收边"} {
		t.Run(claim, func(t *testing.T) {
			result := exampleSummaryResult()
			result.Points[0].Benefit = claim
			if _, err := parseSummaryCompletion(summaryCompletion(result), exampleSummaryRequest().summaryInput); err == nil {
				t.Fatalf("unsupported claim accepted: %s", claim)
			}
		})
	}
}

func TestSummaryReviewRetainsLabelLimitsAndRejectsConflictDecisions(t *testing.T) {
	input := exampleSummaryRequest().summaryInput
	input.TextSources[0].Text = "洗护TIPS\n手洗洗涤温度不高于40℃\n不可干洗\n不可漂白\n不可翻转干燥\n在阴凉处平摊晾干\n熨斗底板温度不高于1\n10℃℃"
	result, err := parseSummaryCompletion(summaryCompletion(exampleSummaryResult()), input)
	if err != nil {
		t.Fatal(err)
	}
	for _, required := range []string{"水温不高于40℃", "不可干洗", "不可漂白", "不可翻转干燥", "熨斗底板温度不高于110℃"} {
		if !strings.Contains(strings.Join(result.Cautions, "\n"), required) {
			t.Errorf("lost label condition %s", required)
		}
	}
	bad := exampleSummaryResult()
	bad.Conflicts = []string{"两处比例不同，已采用其中一处成稿"}
	if _, err := parseSummaryCompletion(summaryCompletion(bad), input); err == nil {
		t.Fatal("model resolved a conflict without review")
	}
}

func TestSummaryFailureStagesAndRedaction(t *testing.T) {
	key := "private-credential-for-test"
	for _, status := range []int{400, 401, 404, 429, 503} {
		err := errors.New("invalid request " + key + " https://relay.test/v1?token=private data:image/png;base64,private-image")
		failure := classifySummaryFailure(context.Background(), status, err, key)
		if strings.Contains(failure.Message, key) || strings.Contains(failure.Detail, "relay.test") || strings.Contains(failure.Detail, "private-image") || strings.Contains(failure.Detail, "token=private") {
			t.Fatal("unsafe diagnostic", failure)
		}
		if failure.Code == "model_request" || !strings.Contains(failure.Message, "HTTP") {
			t.Fatalf("missing upstream classification: %+v", failure)
		}
	}
	if failure := classifySummaryFailure(context.Background(), 200, gateway.ErrInvalidTextJSON, ""); failure.Code != "model_json" {
		t.Fatal(failure)
	}
	if failure := classifySummaryFailure(context.Background(), 403, errors.New("text upstream HTTP 403: Verify your account to continue."), ""); failure.Code != "model_account_verification" || failure.Stage != "channel" {
		t.Fatal("account verification was disguised as image capability or key failure", failure)
	}
	if failure := classifySummaryFailure(context.Background(), 0, &gateway.IndexedImageError{Index: 9, Err: errors.New("invalid image")}, ""); failure.Code != "image_prepare" {
		t.Fatal(failure)
	}
}
