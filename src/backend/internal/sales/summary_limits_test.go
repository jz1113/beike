package sales

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/gateway"
)

func summaryBatchTexts(start, count int) []summaryTextSource {
	sources := make([]summaryTextSource, count)
	for i := range sources {
		index := start + i
		sources[i] = summaryTextSource{Index: index, Text: fmt.Sprintf("第%d张修订文字", index+1)}
	}
	return sources
}

func TestSummarySendsAllCurrentOCRTextsWithoutImageCountLimit(t *testing.T) {
	for _, count := range []int{27, 129} {
		t.Run(fmt.Sprint(count), func(t *testing.T) {
			body := exampleSummaryRequest()
			body.TextSources = summaryBatchTexts(0, count)
			calls := 0
			handler := summaryHandler(setupPromptExecutionTestConfig(t), func(ctx context.Context, req gateway.TextRequest, responses bool) (int, map[string]any, error) {
				calls++
				messages := req.Payload["messages"].([]any)
				content := messages[1].(map[string]any)["content"].([]any)
				if len(content) != 1 || content[0].(map[string]any)["type"] != "text" {
					t.Fatalf("expected one OCR text block, got %+v", content)
				}
				var data map[string]json.RawMessage
				if err := json.Unmarshal([]byte(content[0].(map[string]any)["text"].(string)), &data); err != nil {
					t.Fatal(err)
				}
				if len(data) != 1 {
					t.Fatalf("unexpected non-OCR metadata: %v", data)
				}
				var sources []map[string]string
				if err := json.Unmarshal(data["confirmedTextSources"], &sources); err != nil {
					t.Fatal(err)
				}
				if len(sources) != count {
					t.Fatalf("reviewed texts truncated: %d of %d", len(sources), count)
				}
				for i, source := range sources {
					if len(source) != 2 || source["id"] != fmt.Sprintf("ocr-%d", i+1) || source["text"] != body.TextSources[i].Text {
						t.Fatalf("OCR source changed at %d: %v", i, source)
					}
				}
				return http.StatusOK, summaryCompletion(exampleSummaryResult()), nil
			}, func(context.Context, string, string) ([]byte, error) {
				t.Fatal("text extraction must not read originals")
				return nil, nil
			})
			if w := serveSummary(handler, body); w.Code != http.StatusOK || calls != 1 {
				t.Fatalf("status=%d modelCalls=%d body=%s", w.Code, calls, w.Body.String())
			}
		})
	}
}

func TestSummaryTextLimitsCountChineseCharacters(t *testing.T) {
	body := exampleSummaryRequest()
	body.TextSources = summaryBatchTexts(0, 2)
	body.TextSources[0].Text = strings.Repeat("字", 40_000)
	body.TextSources[1].Text = strings.Repeat("字", 20_000)
	if message := validateSummaryInput(body); message != "" {
		t.Fatalf("60000 Chinese characters must remain valid: %s", message)
	}
}

func TestSummaryRejectsOCRTextLimitsBeforeModelCall(t *testing.T) {
	cases := []struct {
		name   string
		error  string
		change func(*summaryRequest)
	}{
		{"text total 60001", "60000", func(body *summaryRequest) {
			body.TextSources = summaryBatchTexts(0, 2)
			body.TextSources[0].Text = strings.Repeat("字", 40_000)
			body.TextSources[1].Text = strings.Repeat("字", 20_001)
		}},
		{"single text 40001", "40000", func(body *summaryRequest) { body.TextSources[0].Text = strings.Repeat("字", 40_001) }},
		{"duplicate indexes", "来源编号", func(body *summaryRequest) { body.TextSources = append(body.TextSources, body.TextSources[0]) }},
		{"index out of range", "来源编号", func(body *summaryRequest) { body.TextSources[0].Index = 100_000 }},
		{"empty source", "不能为空", func(body *summaryRequest) { body.TextSources[0].Text = "\n\t " }},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			body := exampleSummaryRequest()
			test.change(&body)
			handler := summaryHandler(setupPromptExecutionTestConfig(t), func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
				t.Fatal("invalid OCR input reached the model")
				return 0, nil, nil
			}, func(context.Context, string, string) ([]byte, error) {
				t.Fatal("invalid OCR input triggered an original download")
				return nil, nil
			})
			w := serveSummary(handler, body)
			if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), test.error) {
				t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
			}
		})
	}
}

func TestSummaryRetainsRequestByteLimitEvenForIgnoredLegacyFields(t *testing.T) {
	body := exampleSummaryRequest()
	body.Facts = strings.Repeat("x", 512<<10)
	handler := summaryHandler(setupPromptExecutionTestConfig(t), func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
		t.Fatal("oversized request reached the model")
		return 0, nil, nil
	}, func(context.Context, string, string) ([]byte, error) {
		t.Fatal("oversized request read an image")
		return nil, nil
	})
	if w := serveSummary(handler, body); w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "资料过长") {
		t.Fatalf("%d %s", w.Code, w.Body.String())
	}
}
