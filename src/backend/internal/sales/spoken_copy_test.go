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

const spokenCopyTestRequest = `{"productName":"条纹上衣","sourceCopy":"我挑上衣会先看搭配，条纹配纯色下装就有重点。领口的装饰扣也很有细节。","facts":"条纹配色，领口装饰扣","voiceMode":"speech","duration":6.3,"targetCps":3.8,"model":"gpt-4o","beats":[{"index":0,"start":0,"end":3,"action":"正面展示条纹","spokenLine":"原台词"},{"index":1,"start":3,"end":6,"action":"展示领口"}]}`
const spokenCopyTestResult = `{"beats":[{"index":1,"spokenLine":"领口装饰扣有细节。","subtitle":"装饰扣细节"},{"index":0,"spokenLine":"条纹配纯色下装。","subtitle":"条纹搭纯色"}]}`

// Generation-focused tests still execute an independent configured review; the
// review's rejection, transport, binding and strict schema are covered separately.
func spokenCopyHandlerWithApprovedReview(t *testing.T, cfg config.Config, generate summaryCompleter) http.HandlerFunc {
	t.Helper()
	review, err := loadSalesPrompt(t.Context(), cfg, "local", "spoken-review")
	if err != nil {
		review = customizePrompt(t, cfg, "spoken-review")
	}
	return spokenCopyHandler(cfg, func(ctx context.Context, request gateway.TextRequest, responses bool) (int, map[string]any, error) {
		messages := request.Payload["messages"].([]any)
		if messages[0].(map[string]any)["content"] != review.Prompt {
			return generate(ctx, request, responses)
		}
		assertRequestPrompt(t, request, review.Prompt)
		return 200, approvedSpokenReviewCompletion(t, request), nil
	})
}

func approvedSpokenReviewCompletion(t *testing.T, request gateway.TextRequest) map[string]any {
	t.Helper()
	messages := request.Payload["messages"].([]any)
	text, ok := strings.CutPrefix(messages[1].(map[string]any)["content"].(string), "口播验收数据：\n")
	var input struct {
		DraftDigest string `json:"draftDigest"`
	}
	if !ok || json.Unmarshal([]byte(text), &input) != nil || len(input.DraftDigest) != 64 {
		t.Fatal("review input lost the draft digest")
	}
	return scriptCompletion(`{"draftDigest":"`+input.DraftDigest+`","approved":true,"issues":[]}`, "stop")
}

func TestSpokenCopyUsesSavedPromptAndPreservesStructuredInputs(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	for _, mode := range []string{"speech", "voiceover"} {
		t.Run(mode, func(t *testing.T) {
			cfg := setupSalesTestConfig(t)
			saved := customizePrompt(t, cfg, "spoken-copy")
			body := strings.Replace(spokenCopyTestRequest, `"voiceMode":"speech"`, `"voiceMode":"`+mode+`"`, 1)
			if mode == "voiceover" {
				body = strings.Replace(body, `"model":"gpt-4o"`, `"model":"gpt-4o","apiFormat":"openai-responses"`, 1)
			}
			calls := 0
			rec := httptest.NewRecorder()
			spokenCopyHandlerWithApprovedReview(t, cfg, func(_ context.Context, req gateway.TextRequest, responses bool) (int, map[string]any, error) {
				calls++
				assertRequestPrompt(t, req, saved.Prompt)
				if responses != (mode == "voiceover") {
					t.Fatal("Responses route was not retained")
				}
				messages := req.Payload["messages"].([]any)
				content := messages[1].(map[string]any)["content"].(string)
				data, ok := strings.CutPrefix(content, "口播输入数据：\n")
				var forwarded struct {
					spokenCopyInput
					TimingBudget spokenCopyBudget `json:"timingBudget"`
				}
				if !ok || json.Unmarshal([]byte(data), &forwarded) != nil || forwarded.SourceCopy == "" || forwarded.VoiceMode != mode || forwarded.Duration != 6.3 || len(forwarded.Beats) != 2 || forwarded.Beats[0].Action != "正面展示条纹" || forwarded.Beats[0].SpokenLine != "原台词" {
					t.Fatalf("original copy or factual input changed: %s", content)
				}
				if strings.Contains(data, "test-key") || strings.Contains(data, "apiFormat") || forwarded.TimingBudget.TotalMaxChars != 23 || forwarded.TimingBudget.Beats[0].MaxChars != 11 || forwarded.TimingBudget.Beats[0].RecommendedChars != 10 {
					t.Fatalf("credentials leaked or timing budget lost: %s", content)
				}
				return 200, scriptCompletion(spokenCopyTestResult, "stop"), nil
			}).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/sales/spoken-copy", strings.NewReader(body)))
			var result struct {
				Beats         []spokenCopyBeatOutput `json:"beats"`
				Timing        spokenCopyTiming       `json:"timing"`
				PromptVersion string                 `json:"promptVersion"`
			}
			if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &result) != nil || calls != 1 || result.PromptVersion != saved.Version || len(result.Beats) != 2 || result.Beats[0].Index != 0 || result.Beats[0].SpokenLine != "条纹配纯色下装。" {
				t.Fatalf("adaptation did not return stable indexes and prompt version: %d %s", rec.Code, rec.Body.String())
			}
			if result.Timing.SpokenChars != 15 || result.Timing.EstimatedSpeakSec != 3.9 || result.Timing.Duration != 6.3 {
				t.Fatalf("timing estimate changed: %+v", result.Timing)
			}
			if strings.Contains(rec.Body.String(), `"action"`) {
				t.Fatal("copy adaptation must not replace visual fields")
			}
		})
	}
}

func TestSpokenCopyRejectsInvalidRequestsBeforePaidCalls(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	cfg := setupSalesTestConfig(t)
	for _, body := range []string{
		`{`, spokenCopyTestRequest + ` {}`,
		strings.Replace(spokenCopyTestRequest, `"voiceMode":"speech"`, `"voiceMode":"none"`, 1),
		strings.Replace(spokenCopyTestRequest, `"duration":6.3`, `"duration":0`, 1),
		strings.Replace(spokenCopyTestRequest, `"duration":6.3`, `"duration":5`, 1),
		strings.Replace(spokenCopyTestRequest, `"targetCps":3.8`, `"targetCps":9`, 1),
		strings.Replace(spokenCopyTestRequest, `"index":0`, `"index":2`, 1),
		strings.Replace(spokenCopyTestRequest, `"start":3`, `"start":2`, 1),
		strings.Replace(spokenCopyTestRequest, `"end":3`, `"end":0`, 1),
	} {
		rec := httptest.NewRecorder()
		spokenCopyHandlerWithApprovedReview(t, cfg, func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
			t.Fatal("invalid input triggered a paid model call")
			return 0, nil, nil
		}).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/sales/spoken-copy", strings.NewReader(body)))
		if rec.Code != 400 {
			t.Fatalf("invalid request passed: %d %s", rec.Code, rec.Body.String())
		}
	}
}

func TestSpokenCopyDoesNotAcceptTruncatedOverlongOrUngroundedCopy(t *testing.T) {
	var request spokenCopyRequest
	if err := json.Unmarshal([]byte(spokenCopyTestRequest), &request); err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		name, content, finish, want string
	}{
		{"truncated", spokenCopyTestResult, "length", "被截断"},
		{"invalid JSON", "口播不是JSON", "stop", "合法JSON"},
		{"missing beat", `{"beats":[{"index":0,"spokenLine":"条纹上衣","subtitle":"条纹"}]}`, "stop", "数量不匹配"},
		{"duplicate beat", strings.Replace(spokenCopyTestResult, `"index":1`, `"index":0`, 1), "stop", "编号"},
		{"missing index", strings.Replace(spokenCopyTestResult, `"index":1,`, "", 1), "stop", "编号"},
		{"missing subtitle", strings.Replace(spokenCopyTestResult, `,"subtitle":"装饰扣细节"`, "", 1), "stop", "字符串"},
		{"empty copy", `{"beats":[{"index":0,"spokenLine":"","subtitle":""},{"index":1,"spokenLine":"","subtitle":""}]}`, "stop", "有效口播"},
		{"subtitle without speech", strings.Replace(spokenCopyTestResult, `领口装饰扣有细节。`, "", 1), "stop", "空台词"},
		{"too fast", strings.Replace(spokenCopyTestResult, "领口装饰扣有细节。", "领口的装饰扣有细节，条纹还可以搭配纯色下装。", 1), "stop", "分镜2台词"},
		{"unsupported promise", strings.Replace(spokenCopyTestResult, "领口装饰扣有细节。", "穿上显瘦又有细节。", 1), "stop", "显瘦"},
	} {
		t.Run(test.name, func(t *testing.T) {
			_, _, err := parseSpokenCopy(scriptCompletion(test.content, test.finish), request.spokenCopyInput)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("invalid copy accepted or wrong error: %v", err)
			}
		})
	}
	blank := `{"beats":[{"index":0,"spokenLine":"条纹配纯色下装。","subtitle":"条纹搭纯色"},{"index":1,"spokenLine":"","subtitle":""}]}`
	beats, _, err := parseSpokenCopy(scriptCompletion(blank, "stop"), request.spokenCopyInput)
	if err != nil || beats[1].SpokenLine != "" {
		t.Fatalf("intentional silent beat rejected: %+v %v", beats, err)
	}
}

func TestSpokenCopyModelFailureDoesNotSilentlyFallbackOrRetry(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	cfg := setupPromptExecutionTestConfig(t)
	calls := 0
	rec := httptest.NewRecorder()
	spokenCopyHandlerWithApprovedReview(t, cfg, func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
		calls++
		return 503, nil, errors.New("upstream unavailable")
	}).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/sales/spoken-copy", strings.NewReader(spokenCopyTestRequest)))
	if rec.Code != 502 || calls != 1 || !strings.Contains(rec.Body.String(), `"success":false`) {
		t.Fatalf("failed model call retried or hid failure: %d %s", rec.Code, rec.Body.String())
	}
}
