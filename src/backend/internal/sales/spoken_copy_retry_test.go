package sales

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/gateway"
)

func TestSpokenCopyAutomaticallyRepairsDraftWithAllValidationIssuesAndOriginalInputs(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	cfg := setupSalesTestConfig(t)
	saved := customizePrompt(t, cfg, "spoken-copy")
	tooLong := `{"beats":[{"index":0,"spokenLine":"条纹的上衣可以搭配纯色下装，看起来有重点。","subtitle":"条纹搭纯色"},{"index":1,"spokenLine":"领口的装饰扣有细节，还可以搭配纯色下装。","subtitle":"装饰扣细节"}]}`
	var input spokenCopyRequest
	if err := json.Unmarshal([]byte(spokenCopyTestRequest), &input); err != nil {
		t.Fatal(err)
	}
	input.Beats[0].Purpose, input.Beats[0].BuyingPoint = "开场展示", "条纹搭配纯色下装"
	shotIndex := 0
	input.Beats[0].ShotIndex, input.Beats[0].ShotSize = &shotIndex, "中景"
	input.Beats[0].Camera, input.Beats[0].Subject = "固定拍摄胸部", "当前人物与条纹上衣"
	input.Beats[0].RequiredView, input.Beats[0].AssignedView = "detail", "front"
	body, _ := json.Marshal(input)
	calls, originalInput := 0, ""
	rec := httptest.NewRecorder()
	spokenCopyHandlerWithApprovedReview(t, cfg, func(_ context.Context, req gateway.TextRequest, _ bool) (int, map[string]any, error) {
		calls++
		assertRequestPrompt(t, req, saved.Prompt)
		messages := req.Payload["messages"].([]any)
		content := messages[1].(map[string]any)["content"].(string)
		if calls == 1 {
			originalInput = content
			data, _ := strings.CutPrefix(content, "口播输入数据：\n")
			var forwarded struct {
				spokenCopyInput
				TimingBudget spokenCopyBudget `json:"timingBudget"`
			}
			if json.Unmarshal([]byte(data), &forwarded) != nil || !reflect.DeepEqual(forwarded.Beats, input.Beats) || forwarded.TimingBudget.Beats[0].MaxChars != 11 {
				t.Fatalf("storyboard intent or budget lost: %s", data)
			}
			return 200, scriptCompletion(tooLong, "stop"), nil
		}
		if content != originalInput || len(messages) != 3 {
			t.Fatal("repair lost original facts or accumulated earlier rejected drafts")
		}
		feedback, ok := strings.CutPrefix(messages[2].(map[string]any)["content"].(string), "自动校验反馈数据：\n")
		var repair struct {
			Attempt         int    `json:"attempt"`
			ValidationError string `json:"validationError"`
			PreviousOutput  string `json:"previousOutput"`
		}
		if !ok || json.Unmarshal([]byte(feedback), &repair) != nil || repair.Attempt != calls {
			t.Fatalf("invalid repair feedback: %s", feedback)
		}
		if calls == 2 {
			if repair.PreviousOutput != tooLong || !strings.Contains(repair.ValidationError, "分镜1台词") || !strings.Contains(repair.ValidationError, "分镜2台词") || !strings.Contains(repair.ValidationError, "总台词") {
				t.Fatalf("repair must receive every overlong beat and previous draft: %+v", repair)
			}
			return 200, scriptCompletion("不是合法JSON", "stop"), nil
		}
		if repair.PreviousOutput != "不是合法JSON" || !strings.Contains(repair.ValidationError, "合法JSON") {
			t.Fatalf("repair must use the most recent rejection: %+v", repair)
		}
		return 200, scriptCompletion(spokenCopyTestResult, "stop"), nil
	}).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/sales/spoken-copy", strings.NewReader(string(body))))
	if rec.Code != 200 || calls != 3 || !strings.Contains(rec.Body.String(), `"spokenLine":"领口装饰扣有细节。"`) || !strings.Contains(rec.Body.String(), saved.Version) {
		t.Fatalf("corrected copy was not returned intact: %d calls=%d %s", rec.Code, calls, rec.Body.String())
	}
}

func TestSpokenCopyStopsAfterBoundedRepairAttemptsWithoutReturningRejectedDraft(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	cfg := setupSalesTestConfig(t)
	customizePrompt(t, cfg, "spoken-copy")
	calls := 0
	rec := httptest.NewRecorder()
	spokenCopyHandlerWithApprovedReview(t, cfg, func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
		calls++
		return 200, scriptCompletion(`{"beats":[]}`, "stop"), nil
	}).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/sales/spoken-copy", strings.NewReader(spokenCopyTestRequest)))
	if rec.Code != 502 || calls != spokenCopyMaxAttempts || !strings.Contains(rec.Body.String(), "已自动优化3次") || strings.Contains(rec.Body.String(), `"beats"`) {
		t.Fatalf("invalid copy escaped bounded retry: %d calls=%d %s", rec.Code, calls, rec.Body.String())
	}
}

func TestSpokenCopyRepairsNativeJSONValidationFailure(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	cfg := setupSalesTestConfig(t)
	customizePrompt(t, cfg, "spoken-copy")
	calls := 0
	rec := httptest.NewRecorder()
	spokenCopyHandlerWithApprovedReview(t, cfg, func(_ context.Context, req gateway.TextRequest, _ bool) (int, map[string]any, error) {
		calls++
		if calls == 1 {
			return 200, nil, &gateway.TextJSONError{Response: scriptCompletion("条纹搭纯色", "stop")}
		}
		messages := req.Payload["messages"].([]any)
		if !strings.Contains(messages[2].(map[string]any)["content"].(string), "条纹搭纯色") {
			t.Fatal("native rejected draft was lost")
		}
		return 200, scriptCompletion(spokenCopyTestResult, "stop"), nil
	}).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/sales/spoken-copy", strings.NewReader(spokenCopyTestRequest)))
	if rec.Code != 200 || calls != 2 {
		t.Fatalf("native JSON error should receive syntax repair: %d calls=%d %s", rec.Code, calls, rec.Body.String())
	}
}

func TestSpokenCopyCancellationStopsRepairAndDiscardsLateCompletion(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	for _, content := range []string{`{"beats":[]}`, spokenCopyTestResult} {
		t.Run(content, func(t *testing.T) {
			cfg := setupSalesTestConfig(t)
			customizePrompt(t, cfg, "spoken-copy")
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			calls := 0
			rec := httptest.NewRecorder()
			spokenCopyHandlerWithApprovedReview(t, cfg, func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
				calls++
				cancel()
				return 200, scriptCompletion(content, "stop"), nil
			}).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/sales/spoken-copy", strings.NewReader(spokenCopyTestRequest)).WithContext(ctx))
			if calls != 1 || rec.Code != 502 || !strings.Contains(rec.Body.String(), "model_timeout") || strings.Contains(rec.Body.String(), `"beats"`) {
				t.Fatalf("cancelled operation retried or accepted late copy: %d calls=%d %s", rec.Code, calls, rec.Body.String())
			}
		})
	}
}

func TestSpokenCopyDoesNotRetryPermanentUpstreamFailure(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	cfg := setupSalesTestConfig(t)
	customizePrompt(t, cfg, "spoken-copy")
	for _, status := range []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusTooManyRequests, http.StatusBadRequest} {
		calls := 0
		rec := httptest.NewRecorder()
		spokenCopyHandlerWithApprovedReview(t, cfg, func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
			calls++
			return status, nil, nil
		}).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/sales/spoken-copy", strings.NewReader(spokenCopyTestRequest)))
		if rec.Code != 502 || calls != 1 {
			t.Fatalf("upstream HTTP %d should not trigger paid repair: %d calls=%d", status, rec.Code, calls)
		}
	}
}

func TestSpokenCopyBoundsOptionalStoryboardPurposeAndBuyingPoint(t *testing.T) {
	var input spokenCopyRequest
	if err := json.Unmarshal([]byte(spokenCopyTestRequest), &input); err != nil {
		t.Fatal(err)
	}
	input.Beats[0].Purpose = strings.Repeat("目", 201)
	if err := validateSpokenCopyInput(input); err == nil {
		t.Fatal("overlong storyboard purpose accepted")
	}
	input.Beats[0].Purpose, input.Beats[0].BuyingPoint = "开场展示", strings.Repeat("点", 1001)
	if err := validateSpokenCopyInput(input); err == nil {
		t.Fatal("overlong buying point accepted")
	}
}

func TestSpokenCopyRejectsInvalidOptionalShotContextBeforePaidCalls(t *testing.T) {
	negative := -1
	for _, test := range []struct {
		name string
		set  func(*spokenCopyBeatInput)
	}{
		{"shot index", func(beat *spokenCopyBeatInput) { beat.ShotIndex = &negative }},
		{"shot size", func(beat *spokenCopyBeatInput) { beat.ShotSize = strings.Repeat("景", 201) }},
		{"camera", func(beat *spokenCopyBeatInput) { beat.Camera = strings.Repeat("镜", 1001) }},
		{"required view", func(beat *spokenCopyBeatInput) { beat.RequiredView = strings.Repeat("面", 81) }},
		{"assigned view", func(beat *spokenCopyBeatInput) { beat.AssignedView = strings.Repeat("面", 81) }},
		{"subject", func(beat *spokenCopyBeatInput) { beat.Subject = strings.Repeat("人", 2001) }},
		{"expression", func(beat *spokenCopyBeatInput) { beat.Expression = strings.Repeat("表", 601) }},
		{"transition", func(beat *spokenCopyBeatInput) { beat.Transition = strings.Repeat("接", 401) }},
	} {
		t.Run(test.name, func(t *testing.T) {
			var input spokenCopyRequest
			if err := json.Unmarshal([]byte(spokenCopyTestRequest), &input); err != nil {
				t.Fatal(err)
			}
			test.set(&input.Beats[0])
			body, _ := json.Marshal(input)
			rec := httptest.NewRecorder()
			spokenCopyHandlerWithApprovedReview(t, setupSalesTestConfig(t), func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
				t.Fatal("invalid shot context triggered a paid model call")
				return 0, nil, nil
			}).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/sales/spoken-copy", strings.NewReader(string(body))))
			if rec.Code != 400 {
				t.Fatalf("invalid shot context accepted: %d %s", rec.Code, rec.Body.String())
			}
		})
	}
}
