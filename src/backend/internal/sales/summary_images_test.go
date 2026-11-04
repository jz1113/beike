package sales

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/gateway"
)

func TestSummaryLegacyRequestsOnlyUseOCRTextAndNeverReadURLs(t *testing.T) {
	body := exampleSummaryRequest()
	body.TextSources = nil
	body.ProductName, body.Brand, body.Facts = "忽略商品名称", "忽略品牌", "忽略补充文字"
	body.ReferenceImages = []summaryImage{{Index: 0, URL: "http://127.0.0.1/private-reference"}}
	body.TextImages = []summaryImage{{Index: 0, URL: "file:///private/ocr-original", Text: "用户手动修订后的 OCR 文字"}}
	handler := summaryHandler(setupPromptExecutionTestConfig(t), func(ctx context.Context, req gateway.TextRequest, responses bool) (int, map[string]any, error) {
		messages := req.Payload["messages"].([]any)
		content := messages[1].(map[string]any)["content"].([]any)
		encoded, _ := json.Marshal(content)
		text := string(encoded)
		if len(content) != 1 || !strings.Contains(text, body.TextImages[0].Text) || !strings.Contains(text, "ocr-1") {
			t.Fatalf("legacy OCR text was lost: %s", text)
		}
		for _, excluded := range []string{body.ProductName, body.Brand, body.Facts, "127.0.0.1", "file://", "imageSource", "image_url", "product-meta"} {
			if strings.Contains(text, excluded) {
				t.Fatalf("legacy non-OCR content reached the model: %s", excluded)
			}
		}
		return http.StatusOK, summaryCompletion(exampleSummaryResult()), nil
	}, func(context.Context, string, string) ([]byte, error) {
		t.Fatal("legacy image addresses must never be read")
		return nil, nil
	})
	if w := serveSummary(handler, body); w.Code != http.StatusOK {
		t.Fatalf("%d %s", w.Code, w.Body.String())
	}
}

func TestSummaryCurrentOCRSourcesOverrideLegacyAndEmptyDoesNotRestoreOldText(t *testing.T) {
	body := exampleSummaryRequest()
	body.TextImages = []summaryImage{{Index: 0, URL: "https://old.test/image", Text: "旧OCR文字"}}
	content, err := summaryContent(context.Background(), body.summaryInput, "local", nil)
	if err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(content)
	if strings.Contains(string(encoded), "旧OCR文字") || !strings.Contains(string(encoded), "羊毛8.3%") {
		t.Fatalf("current OCR did not replace legacy input: %s", encoded)
	}
	body.TextSources = []summaryTextSource{}
	if message := validateSummaryInput(body); !strings.Contains(message, "请先识别图片文字") {
		t.Fatalf("explicitly empty current sources restored old text: %s", message)
	}
}

func TestSummaryRejectsImageAndMetadataEvidenceEvenFromLegacyRequests(t *testing.T) {
	input := exampleSummaryRequest().summaryInput
	input.ProductName, input.Facts = "旧商品名称", "旧采集资料"
	input.ReferenceImages = []summaryImage{{Index: 0, URL: "https://old.test/image"}}
	for _, source := range []string{"image-1", "product-meta", "ocr-99"} {
		result := exampleSummaryResult()
		result.Points[0].Sources = []string{source}
		if _, err := parseSummaryCompletion(summaryCompletion(result), input); err == nil {
			t.Fatalf("accepted non-current OCR evidence %s", source)
		}
	}
	input.Facts = "不可干洗，保暖亲肤"
	if notes := summaryLabelCautions(input); strings.Contains(strings.Join(notes, "\n"), "不可干洗") {
		t.Fatal("legacy metadata contaminated OCR-only care restrictions")
	}
	result := exampleSummaryResult()
	result.Points[0].Benefit = "保暖亲肤"
	if _, err := parseSummaryCompletion(summaryCompletion(result), input); err == nil {
		t.Fatal("legacy metadata was used to justify an unsupported OCR-only claim")
	}
}

func TestSummarySavedPromptRetainsCustomTextAndReceivesOCRInputBoundary(t *testing.T) {
	cfg := setupPromptExecutionTestConfig(t)
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	custom := "自定义写作要求：逐张查看原图并结合采集参数。"
	if _, err := db.Exec(`UPDATE "SalesPromptOverride" SET "prompt"=? WHERE "workspaceId"='local' AND "promptId"='summary'`, custom); err != nil {
		t.Fatal(err)
	}
	handler := summaryHandler(cfg, func(ctx context.Context, req gateway.TextRequest, responses bool) (int, map[string]any, error) {
		messages := req.Payload["messages"].([]any)
		instruction := messages[0].(map[string]any)["content"].([]any)[0].(map[string]any)["text"].(string)
		if !strings.HasPrefix(instruction, custom) || !strings.HasSuffix(instruction, summaryTextOnlyBoundary) {
			t.Fatalf("saved prompt overwritten or current input boundary missing: %q", instruction)
		}
		return http.StatusOK, summaryCompletion(exampleSummaryResult()), nil
	}, func(context.Context, string, string) ([]byte, error) {
		t.Fatal("custom prompt triggered image reads")
		return nil, nil
	})
	if w := serveSummary(handler, exampleSummaryRequest()); w.Code != http.StatusOK {
		t.Fatalf("%d %s", w.Code, w.Body.String())
	}
}

func TestProductTextWithoutOCRRetainsSpecificEvidence(t *testing.T) {
	input := summaryInput{ProductFacts: "咖啡色条纹上衣", TextSources: []summaryTextSource{}}
	if err := validateSummaryInput(summaryRequest{Model: "text", summaryInput: input}); err != "" {
		t.Fatal(err)
	}
	content, _ := summaryContent(t.Context(), input, "local", nil)
	b, _ := json.Marshal(content)
	if !strings.Contains(string(b), "product-meta") || !strings.Contains(string(b), input.ProductFacts) {
		t.Fatal(string(b))
	}
	result := exampleSummaryResult()
	for i := range result.Points {
		result.Points[i].Sources = []string{"product-meta"}
	}
	if _, err := parseSummaryCompletion(summaryCompletion(result), input); err != nil {
		t.Fatal(err)
	}
	input.ProductFacts = ""
	if _, err := parseSummaryCompletion(summaryCompletion(result), input); err == nil {
		t.Fatal("unprovided product source accepted")
	}
}
