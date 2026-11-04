package sales

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/gateway"
)

func spokenReviewDecision(t *testing.T, request gateway.TextRequest, approved bool) map[string]any {
	t.Helper()
	completion := approvedSpokenReviewCompletion(t, request)
	if approved {
		return completion
	}
	choices := completion["choices"].([]any)
	message := choices[0].(map[string]any)["message"].(map[string]any)
	message["content"] = strings.Replace(message["content"].(string), `"approved":true,"issues":[]`, `"approved":false,"issues":[{"beatIndex":0,"code":"continuity","message":"本段与后段重复介绍相同信息，没有讲述承接。"}]`, 1)
	return completion
}

func TestSpokenReviewRequiresConfiguredPromptBeforeAnyModelCall(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	cfg := setupSalesTestConfig(t)
	customizePrompt(t, cfg, "spoken-copy")
	disablePrompt(t, cfg, "local", "spoken-review")
	response := httptest.NewRecorder()
	spokenCopyHandler(cfg, func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
		t.Fatal("missing reviewer must stop before generation")
		return 0, nil, nil
	}).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/sales/spoken-copy", strings.NewReader(spokenCopyTestRequest)))
	if response.Code != 400 || !strings.Contains(response.Body.String(), `"promptId":"spoken-review"`) {
		t.Fatalf("missing reviewer was bypassed: %d %s", response.Code, response.Body.String())
	}
}

func TestSpokenReviewRejectsAndRepairsTheWholeDraftUsingExactSavedPrompts(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	cfg := setupSalesTestConfig(t)
	writer, reviewer := customizePrompt(t, cfg, "spoken-copy"), customizePrompt(t, cfg, "spoken-review")
	writeCalls, reviewCalls := 0, 0
	firstDigest := ""
	const rejectedDraft = `{"beats":[{"index":0,"spokenLine":"条纹配纯色，搭配","subtitle":"条纹搭配"},{"index":1,"spokenLine":"领口装饰扣有细节。","subtitle":"装饰扣细节"}]}`
	response := httptest.NewRecorder()
	spokenCopyHandler(cfg, func(_ context.Context, request gateway.TextRequest, _ bool) (int, map[string]any, error) {
		messages := request.Payload["messages"].([]any)
		if messages[0].(map[string]any)["content"] == reviewer.Prompt {
			reviewCalls++
			assertRequestPrompt(t, request, reviewer.Prompt)
			approval := approvedSpokenReviewCompletion(t, request)
			content := approval["choices"].([]any)[0].(map[string]any)["message"].(map[string]any)
			if reviewCalls == 1 {
				firstDigest = content["content"].(string)
				content["content"] = strings.Replace(firstDigest, `"approved":true,"issues":[]`, `"approved":false,"issues":[{"beatIndex":0,"code":"incomplete_sentence","message":"本段末尾重复搭配一词，缺少完整讲述关系。"}]`, 1)
			} else if content["content"].(string) == firstDigest {
				t.Fatal("reviewer received an old draft after rewrite")
			}
			return 200, approval, nil
		}
		writeCalls++
		assertRequestPrompt(t, request, writer.Prompt)
		if writeCalls == 2 {
			feedback := messages[2].(map[string]any)["content"].(string)
			if !strings.Contains(feedback, "incomplete_sentence") || !strings.Contains(feedback, "缺少完整讲述关系") || !strings.Contains(feedback, "条纹配纯色，搭配") {
				t.Fatalf("semantic repair lost issues or rejected draft: %s", feedback)
			}
		}
		if writeCalls == 1 {
			return 200, scriptCompletion(rejectedDraft, "stop"), nil
		}
		return 200, scriptCompletion(spokenCopyTestResult, "stop"), nil
	}).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/sales/spoken-copy", strings.NewReader(spokenCopyTestRequest)))
	if response.Code != 200 || writeCalls != 2 || reviewCalls != 2 || !strings.Contains(response.Body.String(), reviewer.Version) {
		t.Fatalf("draft escaped or skipped independent semantic review: %d write=%d review=%d %s", response.Code, writeCalls, reviewCalls, response.Body.String())
	}
}

func TestSpokenReviewStopsAfterThreeRejectedDrafts(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	cfg := setupSalesTestConfig(t)
	customizePrompt(t, cfg, "spoken-copy")
	reviewer := customizePrompt(t, cfg, "spoken-review")
	writes, reviews := 0, 0
	response := httptest.NewRecorder()
	spokenCopyHandler(cfg, func(_ context.Context, request gateway.TextRequest, _ bool) (int, map[string]any, error) {
		messages := request.Payload["messages"].([]any)
		if messages[0].(map[string]any)["content"] == reviewer.Prompt {
			reviews++
			return 200, spokenReviewDecision(t, request, false), nil
		}
		writes++
		return 200, scriptCompletion(spokenCopyTestResult, "stop"), nil
	}).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/sales/spoken-copy", strings.NewReader(spokenCopyTestRequest)))
	if response.Code != 502 || writes != 3 || reviews != 3 || !strings.Contains(response.Body.String(), `"stage":"rewrite"`) || strings.Contains(response.Body.String(), "reviewPromptVersion") || strings.Contains(response.Body.String(), `"beats"`) {
		t.Fatalf("bounded semantic rejection hid a failed draft: %d writes=%d reviews=%d %s", response.Code, writes, reviews, response.Body.String())
	}
}

func TestSpokenReviewStrictlyBindsACompleteDecisionToTheCurrentDraft(t *testing.T) {
	const valid = `{"draftDigest":"current","approved":true,"issues":[]}`
	const issue = `{"beatIndex":0,"code":"unsupported_claim","message":"原始资料未支持本段功能。"}`
	for _, text := range []string{
		`{}`, `null`, `[]`, valid + `{}`, strings.Replace(valid, "current", "old", 1),
		strings.Replace(valid, `"approved":true`, `"approved":false`, 1),
		strings.Replace(valid, `"issues":[]`, `"issues":null`, 1),
		strings.Replace(valid, `"approved":true`, `"approved":"true"`, 1),
		strings.Replace(valid, `"approved":true`, `"approved":false,"approved":true`, 1),
		strings.Replace(valid, `"issues":[]`, `"issues":[`+issue+`]`, 1),
		strings.Replace(valid, `"issues":[]`, `"issues":[],"explanation":"passed"`, 1),
	} {
		if _, err := parseSpokenReview(scriptCompletion(text, "stop"), "current", 2); err == nil {
			t.Fatalf("invalid or contradictory review accepted: %s", text)
		}
	}
	for _, replacement := range []string{
		`{"code":"unsupported_claim","message":"无依据"}`,
		strings.Replace(issue, `"beatIndex":0`, `"beatIndex":-1`, 1),
		strings.Replace(issue, `"beatIndex":0`, `"beatIndex":2`, 1),
		strings.Replace(issue, "unsupported_claim", "made_up_code", 1),
		strings.Replace(issue, "原始资料未支持本段功能。", " ", 1),
		strings.Replace(issue, `"beatIndex":0`, `"beatIndex":0,"fix":"new line"`, 1),
		strings.Replace(issue, `"beatIndex":0`, `"beatIndex":1,"beatIndex":0`, 1),
	} {
		text := `{"draftDigest":"current","approved":false,"issues":[` + replacement + `]}`
		if _, err := parseSpokenReview(scriptCompletion(text, "stop"), "current", 2); err == nil {
			t.Fatalf("invalid review issue accepted: %s", text)
		}
	}
	if _, err := parseSpokenReview(scriptCompletion(valid, "length"), "current", 2); err == nil {
		t.Fatal("truncated review was accepted")
	}
	if _, err := parseSpokenReview(scriptCompletion(valid, "stop"), "current", 2); err != nil {
		t.Fatal(err)
	}
	if result, err := parseSpokenReview(scriptCompletion(`{"draftDigest":"current","approved":false,"issues":[`+issue+`]}`, "stop"), "current", 2); err != nil || result.Approved || len(result.Issues) != 1 {
		t.Fatalf("complete negative decision was lost: %+v %v", result, err)
	}
}

func TestSpokenReviewEvidenceExcludesGeneratedCopyAndCandidateFacts(t *testing.T) {
	input := spokenCopyInput{ProductName: "条纹上衣", Facts: "领口装饰扣\n最终卖点文案：\n亲测显瘦", Summary: "保暖", BuyingPoints: []string{"防水"}, SourceCopy: "可拆内胆", Duration: 6, TargetCps: 3.8,
		Beats: []spokenCopyBeatInput{{Index: 0, Start: 0, End: 6, SpokenLine: "旧候选台词"}}}
	draft := []spokenCopyBeatOutput{{Index: 0, SpokenLine: "领口有装饰扣。", Subtitle: "装饰扣"}}
	digest, payload := buildSpokenReviewPayload("用户保存的审稿文本", "text-model", input, draft)
	messages := payload["messages"].([]any)
	text, _ := strings.CutPrefix(messages[1].(map[string]any)["content"].(string), "口播验收数据：\n")
	var body struct {
		EvidenceFacts string                `json:"evidenceFacts"`
		CandidateCopy string                `json:"candidateCopy"`
		Beats         []spokenCopyBeatInput `json:"beats"`
	}
	if json.Unmarshal([]byte(text), &body) != nil || body.EvidenceFacts != "条纹上衣\n领口装饰扣" || body.CandidateCopy != input.SourceCopy || body.Beats[0].SpokenLine != draft[0].SpokenLine || input.Beats[0].SpokenLine != "旧候选台词" || len(digest) != 64 {
		t.Fatalf("review evidence was contaminated or source draft mutated: %s", text)
	}
	changed, _ := buildSpokenReviewPayload("用户保存的审稿文本", "text-model", input, []spokenCopyBeatOutput{{Index: 0, SpokenLine: "新稿"}})
	if digest == changed {
		t.Fatal("different drafts shared a review digest")
	}
	result := scriptCompletion(`{"beats":[{"index":0,"spokenLine":"亲测显瘦","subtitle":"显瘦"}]}`, "stop")
	input.Summary, input.BuyingPoints, input.SourceCopy = "亲测显瘦", []string{"亲测显瘦"}, "亲测显瘦"
	if _, _, err := parseSpokenCopy(result, input); err == nil || !strings.Contains(err.Error(), "未经证实") {
		t.Fatalf("generated prose proved its own promise: %v", err)
	}
}

func TestSpokenReviewDigestBindsTheCompleteReviewContext(t *testing.T) {
	input := spokenCopyInput{ProductName: "条纹上衣", Facts: "领口装饰扣", VoiceMode: "speech", Duration: 6, TargetCps: 3.8,
		Beats: []spokenCopyBeatInput{{Index: 0, Start: 0, End: 6, Action: "展示领口", Subject: "当前人物", AssignedView: "front"}}}
	draft := []spokenCopyBeatOutput{{Index: 0, SpokenLine: "领口有装饰扣。", Subtitle: "装饰扣"}}
	digest, _ := buildSpokenReviewPayload("已保存审稿规则", "model", input, draft)
	for name, mutate := range map[string]func(*spokenCopyInput){
		"facts":          func(value *spokenCopyInput) { value.Facts = "领口无装饰扣" },
		"product":        func(value *spokenCopyInput) { value.ProductName = "另一件商品" },
		"voice mode":     func(value *spokenCopyInput) { value.VoiceMode = "voiceover" },
		"duration":       func(value *spokenCopyInput) { value.Duration = 7 },
		"timing":         func(value *spokenCopyInput) { value.Beats[0].End = 5 },
		"action":         func(value *spokenCopyInput) { value.Beats[0].Action = "展示袖口" },
		"expression":     func(value *spokenCopyInput) { value.Beats[0].Expression = "低头看袖口" },
		"transition":     func(value *spokenCopyInput) { value.Beats[0].Transition = "转身背对镜头" },
		"subject":        func(value *spokenCopyInput) { value.Beats[0].Subject = "仅手部" },
		"assigned view":  func(value *spokenCopyInput) { value.Beats[0].AssignedView = "detail" },
		"candidate copy": func(value *spokenCopyInput) { value.SourceCopy = "新候选文案" },
		"cautions":       func(value *spokenCopyInput) { value.Cautions = []string{"装饰扣不能解开"} },
	} {
		t.Run(name, func(t *testing.T) {
			changed := input
			changed.Beats = append([]spokenCopyBeatInput(nil), input.Beats...)
			mutate(&changed)
			actual, _ := buildSpokenReviewPayload("已保存审稿规则", "model", changed, draft)
			if actual == digest {
				t.Fatal("changed context reused the same approval digest")
			}
		})
	}
	if actual, _ := buildSpokenReviewPayload("新审稿规则", "model", input, draft); actual == digest {
		t.Fatal("changed saved review rules reused the same digest")
	}
	if actual, _ := buildSpokenReviewPayload("已保存审稿规则", "model", input, draft); actual != digest {
		t.Fatal("identical context did not produce a stable digest")
	}
}

func TestSpokenReviewFailureNeverReturnsAnApprovedDraft(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	for _, kind := range []string{"invalid", "upstream", "canceled"} {
		t.Run(kind, func(t *testing.T) {
			cfg := setupSalesTestConfig(t)
			customizePrompt(t, cfg, "spoken-copy")
			reviewer := customizePrompt(t, cfg, "spoken-review")
			ctx, cancel := context.WithCancel(t.Context())
			defer cancel()
			calls := 0
			response := httptest.NewRecorder()
			spokenCopyHandler(cfg, func(_ context.Context, request gateway.TextRequest, _ bool) (int, map[string]any, error) {
				calls++
				messages := request.Payload["messages"].([]any)
				if messages[0].(map[string]any)["content"] != reviewer.Prompt {
					return 200, scriptCompletion(spokenCopyTestResult, "stop"), nil
				}
				switch kind {
				case "upstream":
					return 503, nil, errors.New("service unavailable")
				case "canceled":
					cancel()
					return 200, spokenReviewDecision(t, request, true), nil
				default:
					return 200, scriptCompletion(`{"approved":true,"issues":[]}`, "stop"), nil
				}
			}).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/sales/spoken-copy", strings.NewReader(spokenCopyTestRequest)).WithContext(ctx))
			hasPending := strings.Contains(response.Body.String(), `"pendingReview"`)
			if response.Code != 502 || calls != 2 || !strings.Contains(response.Body.String(), `"stage":"review"`) || strings.Contains(response.Body.String(), "reviewPromptVersion") || hasPending != (kind == "upstream") || strings.Contains(response.Body.String(), `"success":true`) {
				t.Fatalf("review failure accepted or retried draft: %d calls=%d %s", response.Code, calls, response.Body.String())
			}
		})
	}
}
