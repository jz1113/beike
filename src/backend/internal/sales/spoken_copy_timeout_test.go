package sales

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/gateway"
)

func TestSpokenCopyGivesWritingAndReviewIndependentCallBudgets(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	cfg := setupSalesTestConfig(t)
	writer, reviewer := customizePrompt(t, cfg, "spoken-copy"), customizePrompt(t, cfg, "spoken-review")
	var writingContext context.Context
	var writingDeadline time.Time
	calls := 0
	response := httptest.NewRecorder()
	spokenCopyHandler(cfg, func(ctx context.Context, request gateway.TextRequest, _ bool) (int, map[string]any, error) {
		calls++
		deadline, ok := ctx.Deadline()
		if !ok || time.Until(deadline) < spokenCopyCallTimeout-time.Second || request.Timeout != spokenCopyCallTimeout {
			t.Fatalf("model call lost its full bounded budget: %v %v", deadline, request.Timeout)
		}
		messages := request.Payload["messages"].([]any)
		if messages[0].(map[string]any)["content"] == writer.Prompt {
			writingContext, writingDeadline = ctx, deadline
			time.Sleep(2 * time.Millisecond)
			return 200, scriptCompletion(spokenCopyTestResult, "stop"), nil
		}
		assertRequestPrompt(t, request, reviewer.Prompt)
		if writingContext == nil || writingContext.Err() != context.Canceled || !deadline.After(writingDeadline) {
			t.Fatal("review reused the writer's consumed context or deadline")
		}
		return 200, approvedSpokenReviewCompletion(t, request), nil
	}).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/sales/spoken-copy", strings.NewReader(spokenCopyTestRequest)))
	if response.Code != 200 || calls != 2 {
		t.Fatalf("independent stages failed: %d calls=%d %s", response.Code, calls, response.Body.String())
	}
}

func TestSpokenCopyCallTimeoutDiscardsLateResultWithoutCancelingParent(t *testing.T) {
	parent := t.Context()
	request := gateway.TextRequest{Timeout: 2 * time.Millisecond}
	_, data, err := completeSpokenCopy(parent, func(ctx context.Context, _ gateway.TextRequest, _ bool) (int, map[string]any, error) {
		<-ctx.Done()
		return 200, scriptCompletion(spokenCopyTestResult, "stop"), nil
	}, request, false)
	if !errors.Is(err, context.DeadlineExceeded) || data != nil || parent.Err() != nil {
		t.Fatalf("late result escaped timeout or poisoned parent: data=%v err=%v parent=%v", data, err, parent.Err())
	}
	status, data, err := completeSpokenCopy(parent, func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
		return 200, scriptCompletion(spokenCopyTestResult, "stop"), nil
	}, gateway.TextRequest{Timeout: time.Second}, false)
	if status != 200 || data == nil || err != nil {
		t.Fatalf("next stage inherited expired call budget: %d %v", status, err)
	}
}

func TestSpokenReviewReturnsPendingDraftOnlyForTransientFailures(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	for _, test := range []struct {
		name    string
		status  int
		err     error
		pending bool
	}{
		{"timeout", 0, context.DeadlineExceeded, true},
		{"network", 0, errors.New("connection reset"), true},
		{"unavailable", 503, nil, true},
		{"request timeout", 408, nil, true},
		{"authentication", 401, nil, false},
		{"parameters", 400, nil, false},
		{"quota", 429, nil, false},
		{"canceled transport", 0, context.Canceled, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			cfg := setupSalesTestConfig(t)
			writer, reviewer := customizePrompt(t, cfg, "spoken-copy"), customizePrompt(t, cfg, "spoken-review")
			calls := 0
			response := httptest.NewRecorder()
			spokenCopyHandler(cfg, func(_ context.Context, request gateway.TextRequest, _ bool) (int, map[string]any, error) {
				calls++
				messages := request.Payload["messages"].([]any)
				if messages[0].(map[string]any)["content"] == reviewer.Prompt {
					return test.status, nil, test.err
				}
				return 200, scriptCompletion(spokenCopyTestResult, "stop"), nil
			}).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/sales/spoken-copy", strings.NewReader(spokenCopyTestRequest)))
			var result struct {
				Success       bool   `json:"success"`
				Stage         string `json:"stage"`
				PendingReview *struct {
					Beats         []spokenCopyBeatOutput `json:"beats"`
					Timing        spokenCopyTiming       `json:"timing"`
					PromptVersion string                 `json:"promptVersion"`
				} `json:"pendingReview"`
			}
			if response.Code != 502 || calls != 2 || json.Unmarshal(response.Body.Bytes(), &result) != nil || result.Success || result.Stage != "review" || (result.PendingReview != nil) != test.pending {
				t.Fatalf("wrong transient failure behavior: %d calls=%d %s", response.Code, calls, response.Body.String())
			}
			if pending := result.PendingReview; pending != nil && (len(pending.Beats) != 2 || pending.Beats[0].SpokenLine != "条纹配纯色下装。" || pending.Timing.SpokenChars != 15 || pending.PromptVersion != writer.Version) {
				t.Fatalf("pending draft lost its validated text, timing or writer version: %+v", pending)
			}
		})
	}
}
