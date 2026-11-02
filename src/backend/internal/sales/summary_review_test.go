package sales

import (
	"context"
	"errors"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/gateway"
)

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
	input.TextImages[0].Text = "洗护TIPS\n手洗洗涤温度不高于40℃\n不可干洗\n不可漂白\n不可翻转干燥\n在阴凉处平摊晾干\n熨斗底板温度不高于1\n10℃℃"
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
