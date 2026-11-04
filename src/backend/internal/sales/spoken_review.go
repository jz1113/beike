package sales

import (
	"context"
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
)

//go:embed spoken-review.md
var spokenReviewPrompt string

type spokenReviewIssue struct {
	BeatIndex int    `json:"beatIndex"`
	Code      string `json:"code"`
	Message   string `json:"message"`
}

type spokenReviewResult struct {
	DraftDigest string              `json:"draftDigest"`
	Approved    bool                `json:"approved"`
	Issues      []spokenReviewIssue `json:"issues"`
}

type spokenReviewFailure struct {
	Code, Message string
	Retryable     bool
}

func reviewSpokenDraft(ctx context.Context, complete summaryCompleter, request gateway.TextRequest, responses bool, prompt, model string, input spokenCopyInput, draft []spokenCopyBeatOutput) (spokenReviewResult, *spokenReviewFailure) {
	digest, payload := buildSpokenReviewPayload(prompt, model, input, draft)
	request.Payload = payload
	status, data, err := completeSpokenCopy(ctx, complete, request, responses)
	if err != nil || status < 200 || status >= 300 {
		failure := classifySummaryFailure(ctx, status, err, request.APIKey)
		retryable := !errors.Is(ctx.Err(), context.Canceled) && !errors.Is(err, context.Canceled) &&
			(failure.Code == "model_timeout" || failure.Code == "model_unavailable" || status == http.StatusRequestTimeout || failure.Code == "model_request" && status == 0 && err != nil)
		return spokenReviewResult{}, &spokenReviewFailure{Code: failure.Code, Message: "口播语义验收未完成，原稿已保留：" + failure.Message, Retryable: retryable}
	}
	review, err := parseSpokenReview(data, digest, len(draft))
	if err != nil {
		return spokenReviewResult{}, &spokenReviewFailure{Code: "spoken_copy_review_invalid", Message: "口播语义验收返回无效，原稿已保留：" + err.Error()}
	}
	return review, nil
}

func reviewExistingSpokenCopy(w http.ResponseWriter, ctx context.Context, complete summaryCompleter, request gateway.TextRequest, responses bool, input spokenCopyInput, prompt, reviewPrompt salesPrompt, requestID, model string) {
	draft := make([]spokenCopyBeatOutput, len(input.Beats))
	for i, beat := range input.Beats {
		draft[i] = spokenCopyBeatOutput{Index: beat.Index, SpokenLine: beat.SpokenLine, Subtitle: beat.Subtitle}
	}
	raw, _ := json.Marshal(map[string]any{"beats": draft})
	data := map[string]any{"choices": []any{map[string]any{"finish_reason": "stop", "message": map[string]any{"content": string(raw)}}}}
	_, timing, err := parseSpokenCopy(data, input)
	if err != nil {
		httpx.WriteJSON(w, 422, map[string]any{"success": false, "error": "当前口播未通过基础校验，原稿已保留：" + err.Error(), "code": "spoken_copy_validation", "stage": "validation", "requestId": requestID})
		return
	}
	review, failure := reviewSpokenDraft(ctx, complete, request, responses, reviewPrompt.Prompt, model, input, draft)
	if failure != nil {
		httpx.WriteJSON(w, 502, map[string]any{"success": false, "error": failure.Message, "code": failure.Code, "stage": "review", "requestId": requestID})
		return
	}
	if !review.Approved {
		httpx.WriteJSON(w, 422, map[string]any{"success": false, "error": "当前口播未通过语义验收，原稿已保留：" + review.validationError().Error(), "code": "spoken_copy_review_rejected", "stage": "review", "issues": review.Issues, "requestId": requestID})
		return
	}
	httpx.WriteJSON(w, 200, map[string]any{"success": true, "beats": draft, "timing": timing, "model": model, "promptVersion": prompt.Version, "reviewPromptVersion": reviewPrompt.Version})
}

func buildSpokenReviewPayload(prompt, model string, input spokenCopyInput, draft []spokenCopyBeatOutput) (string, map[string]any) {
	beats := append([]spokenCopyBeatInput(nil), input.Beats...)
	for _, beat := range draft {
		beats[beat.Index].SpokenLine = beat.SpokenLine
		beats[beat.Index].Subtitle = beat.Subtitle
	}
	context := struct {
		Unresolved            []string              `json:"unresolved,omitempty"`
		DraftDigest           string                `json:"draftDigest,omitempty"`
		EvidenceFacts         string                `json:"evidenceFacts"`
		CandidateSummary      string                `json:"candidateSummary"`
		CandidateBuyingPoints []string              `json:"candidateBuyingPoints"`
		CandidateCopy         string                `json:"candidateCopy"`
		Cautions              []string              `json:"cautions"`
		SourceExclusions      []planSourceExclusion `json:"sourceExclusions,omitempty"`
		VoiceMode             string                `json:"voiceMode"`
		Duration              float64               `json:"duration"`
		TargetCps             float64               `json:"targetCps"`
		TimingBudget          spokenCopyBudget      `json:"timingBudget"`
		Beats                 []spokenCopyBeatInput `json:"beats"`
	}{input.Unresolved, "", salesProductEvidence(input.ProductName, input.Facts), input.Summary, input.BuyingPoints, input.SourceCopy, input.Cautions, input.SourceExclusions, input.VoiceMode, input.Duration, input.TargetCps, buildSpokenCopyBudget(input), beats}
	// Bind approval to every datum the reviewer receives, including its saved
	// instructions. Routing credentials never enter this context or its digest.
	raw, _ := json.Marshal(struct {
		Prompt  string `json:"prompt"`
		Context any    `json:"context"`
	}{prompt, context})
	hash := sha256.Sum256(raw)
	digest := hex.EncodeToString(hash[:])
	context.DraftDigest = digest
	data, _ := json.Marshal(context)
	return digest, map[string]any{
		"model": model, "max_tokens": 3000, "response_format": map[string]any{"type": "json_object"},
		"messages": []any{
			map[string]any{"role": "system", "content": prompt},
			map[string]any{"role": "user", "content": "口播验收数据：\n" + string(data)},
		},
	}
}

func parseSpokenReview(data map[string]any, digest string, beatCount int) (spokenReviewResult, error) {
	var result spokenReviewResult
	choices, _ := data["choices"].([]any)
	if len(choices) != 1 {
		return result, errors.New("验收必须返回一份完整结果")
	}
	choice, _ := choices[0].(map[string]any)
	message, _ := choice["message"].(map[string]any)
	if choice["finish_reason"] != "stop" || message["refusal"] != nil && message["refusal"] != "" {
		return result, errors.New("验收未完成、被拒绝或被截断")
	}
	text, _ := message["content"].(string)
	if err := uniqueSpokenReviewFields(json.NewDecoder(strings.NewReader(text)), 0); err != nil {
		return result, errors.New("验收JSON无效或存在重复字段")
	}
	var decoded struct {
		DraftDigest *string `json:"draftDigest"`
		Approved    *bool   `json:"approved"`
		Issues      *[]struct {
			BeatIndex *int    `json:"beatIndex"`
			Code      *string `json:"code"`
			Message   *string `json:"message"`
		} `json:"issues"`
	}
	decoder := json.NewDecoder(strings.NewReader(text))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&decoded) != nil || decoder.Decode(new(any)) != io.EOF || decoded.DraftDigest == nil || decoded.Approved == nil || decoded.Issues == nil {
		return result, errors.New("验收JSON字段缺失、类型错误或含未知字段")
	}
	if *decoded.DraftDigest != digest {
		return result, errors.New("验收对应的台词稿件不匹配")
	}
	if len(*decoded.Issues) > 72 || *decoded.Approved != (len(*decoded.Issues) == 0) {
		return result, errors.New("验收结论与问题清单矛盾或问题过多")
	}
	result = spokenReviewResult{DraftDigest: digest, Approved: *decoded.Approved, Issues: make([]spokenReviewIssue, 0, len(*decoded.Issues))}
	for _, issue := range *decoded.Issues {
		if issue.BeatIndex == nil || *issue.BeatIndex < 0 || *issue.BeatIndex >= beatCount || issue.Code == nil || !validSpokenReviewCode(*issue.Code) || issue.Message == nil || !boundedText(strings.TrimSpace(*issue.Message), 600, true) {
			return spokenReviewResult{}, errors.New("验收问题的分镜编号、类型或说明无效")
		}
		result.Issues = append(result.Issues, spokenReviewIssue{BeatIndex: *issue.BeatIndex, Code: *issue.Code, Message: strings.TrimSpace(*issue.Message)})
	}
	return result, nil
}

// Reject duplicate JSON keys instead of letting a later approval overwrite an
// earlier decision. This validates the wire format, not editorial standards.
func uniqueSpokenReviewFields(decoder *json.Decoder, depth int) error {
	if depth > 6 {
		return errors.New("nested review JSON")
	}
	token, err := decoder.Token()
	if err != nil {
		return err
	}
	delimiter, compound := token.(json.Delim)
	if !compound {
		return nil
	}
	seen := map[string]bool{}
	for decoder.More() {
		if delimiter == '{' {
			key, err := decoder.Token()
			if err != nil {
				return err
			}
			field, ok := key.(string)
			if !ok || seen[field] {
				return errors.New("duplicate review field")
			}
			seen[field] = true
		}
		if err := uniqueSpokenReviewFields(decoder, depth+1); err != nil {
			return err
		}
	}
	_, err = decoder.Token()
	return err
}

func validSpokenReviewCode(code string) bool {
	switch code {
	case "incomplete_sentence", "repetition", "parameter_accuracy", "unsupported_claim", "visual_mismatch", "subtitle_mismatch", "continuity":
		return true
	}
	return false
}

func (review spokenReviewResult) validationError() error {
	issues := make([]error, 0, len(review.Issues))
	for _, issue := range review.Issues {
		issues = append(issues, fmt.Errorf("口播语义验收：分镜%d [%s] %s", issue.BeatIndex+1, issue.Code, issue.Message))
	}
	return errors.Join(issues...)
}
