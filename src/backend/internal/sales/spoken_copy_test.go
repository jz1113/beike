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

func TestSpokenCopyStarterExplainsContinuousSpeechAndSubtitleBoundaries(t *testing.T) {
	for name, rules := range map[string][]string{
		"speech and subtitles": {"spokenLine 是说给人听的连续讲述", "subtitle 才用于提炼短关键词"},
		"natural syntax":       {"所需的主语、谓语、指代和连接关系", "减少要讲的信息", "不强行添加"},
		"continuous beats":     {"同一 shotIndex", "前后承接的分句", "不拆开词语", "各段分别遵守自己的时间预算"},
		"factual grounding":    {"不是当前商品事实", "不能为了配合台词增加或修改动作", "不编造亲测"},
		"whole narration":      {"朗读自审", "按整片讲述关系统一改写", "不要把上一稿逐格压成口号或字幕标签"},
		"silent beat":          {"包括留白段", `"spokenLine":"","subtitle":""`},
	} {
		t.Run(name, func(t *testing.T) {
			for _, rule := range rules {
				if !strings.Contains(spokenCopyPrompt, rule) {
					t.Errorf("visible starter lost rule %q", rule)
				}
			}
		})
	}
}

func TestSpokenCopyAcceptsConnectedClausesAndIntentionalSilenceWithinExistingBudget(t *testing.T) {
	shotIndex := 0
	input := spokenCopyInput{ProductName: "条纹上衣", Facts: "条纹配色，可搭配纯色下装", VoiceMode: "speech", Duration: 6, TargetCps: 3.8,
		Beats: []spokenCopyBeatInput{
			{Index: 0, Start: 0, End: 2, ShotIndex: &shotIndex, Action: "正面展示条纹"},
			{Index: 1, Start: 2, End: 4, ShotIndex: &shotIndex, Action: "保持正面展示"},
			{Index: 2, Start: 4, End: 6, ShotIndex: &shotIndex, Action: "自然停留"},
		}}
	output := `{"beats":[{"index":0,"spokenLine":"这是条纹的，","subtitle":"条纹"},{"index":1,"spokenLine":"配纯色就行。","subtitle":"搭纯色"},{"index":2,"spokenLine":"","subtitle":""}]}`
	beats, timing, err := parseSpokenCopy(scriptCompletion(output, "stop"), input)
	if err != nil || beats[0].SpokenLine != "这是条纹的，" || beats[1].Subtitle != "搭纯色" || beats[2].SpokenLine != "" || beats[2].Subtitle != "" || timing.SpokenChars != 10 {
		t.Fatalf("natural clauses or silent beat rejected: beats=%+v timing=%+v err=%v", beats, timing, err)
	}
	budget := buildSpokenCopyBudget(input)
	if budget.TotalMaxChars != 22 || budget.Beats[0].MaxChars != 7 {
		t.Fatalf("style change must retain existing timing capacity: %+v", budget)
	}
	tooLong := strings.Replace(output, "这是条纹的，", "这件上衣是条纹配色的，", 1)
	if _, _, err := parseSpokenCopy(scriptCompletion(tooLong, "stop"), input); err == nil || !strings.Contains(err.Error(), "分镜1台词") {
		t.Fatalf("connected clauses bypassed per-beat timing: %v", err)
	}
}

func TestSavedNaturalSpeechStarterIsUsedIntactDuringRepair(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	cfg := setupSalesTestConfig(t)
	definition, ok := findPromptDefinition("spoken-copy")
	if !ok {
		t.Fatal("missing spoken-copy definition")
	}
	saved, err := saveSalesPrompt(context.Background(), cfg, "local", definition, &spokenCopyPrompt, definition.resolve(nil).Version)
	if err != nil {
		t.Fatal(err)
	}
	tooLong := strings.Replace(spokenCopyTestResult, "条纹配纯色下装。", "这件条纹上衣配一条纯色下装就可以了。", 1)
	natural := `{"beats":[{"index":0,"spokenLine":"这件配纯色就行。","subtitle":"搭纯色"},{"index":1,"spokenLine":"领口还有颗装饰扣。","subtitle":"领口装饰扣"}]}`
	calls := 0
	recorder := httptest.NewRecorder()
	spokenCopyHandlerWithApprovedReview(t, cfg, func(_ context.Context, req gateway.TextRequest, _ bool) (int, map[string]any, error) {
		calls++
		assertRequestPrompt(t, req, saved.Prompt)
		messages := req.Payload["messages"].([]any)
		if len(messages) != calls+1 {
			t.Fatalf("unexpected hidden or accumulated messages: %d", len(messages))
		}
		if calls == 1 {
			return 200, scriptCompletion(tooLong, "stop"), nil
		}
		feedback, ok := strings.CutPrefix(messages[2].(map[string]any)["content"].(string), "自动校验反馈数据：\n")
		var repair struct {
			ValidationError string `json:"validationError"`
			PreviousOutput  string `json:"previousOutput"`
		}
		if !ok || json.Unmarshal([]byte(feedback), &repair) != nil || repair.PreviousOutput != tooLong || !strings.Contains(repair.ValidationError, "分镜1台词") {
			t.Fatalf("repair lost rejected draft or timing facts: %s", feedback)
		}
		if strings.Contains(repair.ValidationError, "请精简后重试") {
			t.Fatal("timing feedback must report budget facts without dictating creative edits")
		}
		return 200, scriptCompletion(natural, "stop"), nil
	}).ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/api/sales/spoken-copy", strings.NewReader(spokenCopyTestRequest)))
	if recorder.Code != http.StatusOK || calls != 2 || !strings.Contains(recorder.Body.String(), "领口还有颗装饰扣。") || !strings.Contains(recorder.Body.String(), saved.Version) {
		t.Fatalf("saved style prompt did not survive repair: status=%d calls=%d body=%s", recorder.Code, calls, recorder.Body.String())
	}
}

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

func TestSpokenCopyResponsesTransportSendsExactSavedTextAndParsesCompletion(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	saved := customizePrompt(t, cfg, "spoken-copy")
	review := customizePrompt(t, cfg, "spoken-review")
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/v1/responses" || r.Header.Get("Authorization") != "Bearer test-key" {
			t.Errorf("wrong Responses route or credentials: %s", r.URL.Path)
		}
		var body struct {
			Model string `json:"model"`
			Input []struct {
				Role    string `json:"role"`
				Content []struct {
					Type string `json:"type"`
					Text string `json:"text"`
				} `json:"content"`
			} `json:"input"`
		}
		if json.NewDecoder(r.Body).Decode(&body) != nil || body.Model != "gpt-5.4" || len(body.Input) != 2 || len(body.Input[0].Content) != 1 || len(body.Input[1].Content) != 1 {
			t.Error("Responses adapter lost model or messages")
			http.Error(w, "invalid input", 400)
			return
		}
		if body.Input[0].Role != "system" || body.Input[0].Content[0].Type != "input_text" {
			t.Error("saved prompt changed before vendor transport")
		}
		if body.Input[0].Content[0].Text == review.Prompt {
			text, ok := strings.CutPrefix(body.Input[1].Content[0].Text, "口播验收数据：\n")
			var input struct {
				DraftDigest string `json:"draftDigest"`
			}
			if !ok || json.Unmarshal([]byte(text), &input) != nil || len(input.DraftDigest) != 64 {
				t.Error("review lost the current draft digest")
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"status": "completed", "output_text": `{"draftDigest":"` + input.DraftDigest + `","approved":true,"issues":[]}`})
			return
		}
		if body.Input[0].Content[0].Text != saved.Prompt {
			t.Error("generation prompt changed before vendor transport")
		}
		text, ok := strings.CutPrefix(body.Input[1].Content[0].Text, "口播输入数据：\n")
		var input spokenCopyInput
		if body.Input[1].Role != "user" || !ok || json.Unmarshal([]byte(text), &input) != nil || input.SourceCopy == "" || input.Duration != 6.3 || input.VoiceMode != "speech" || len(input.Beats) != 2 {
			t.Error("raw copy or timeline was lost or extra instructions were appended")
		} else if input.Beats[0].SourceVoiceText != "旧品牌原话" || input.Beats[0].SourceLinePattern != "开场介绍" || input.Beats[0].SourceSubtitle != "原片字幕" || len(input.SourceExclusions) != 1 || input.SourceExclusions[0].Term != "旧品牌" {
			t.Errorf("source speech or exclusions lost: %+v", input)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"status": "completed", "output_text": spokenCopyTestResult})
	}))
	defer server.Close()
	previous := gateway.ModelHTTP
	gateway.ModelHTTP = server.Client
	t.Cleanup(func() { gateway.ModelHTTP = previous })
	var input map[string]any
	if err := json.Unmarshal([]byte(spokenCopyTestRequest), &input); err != nil {
		t.Fatal(err)
	}
	input["model"], input["apiFormat"], input["customBaseUrl"], input["customApiKey"] = "openai-responses:gpt-5.4", "openai-responses", server.URL, "test-key"
	input["sourceExclusions"] = []any{map[string]any{"term": "旧品牌", "type": "brand_signage"}}
	beats := input["beats"].([]any)
	beat := beats[0].(map[string]any)
	beat["sourceVoiceText"], beat["sourceLinePattern"], beat["sourceSubtitle"] = "旧品牌原话", "开场介绍", "原片字幕"
	body, _ := json.Marshal(input)
	response := httptest.NewRecorder()
	SpokenCopy(cfg).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/sales/spoken-copy", strings.NewReader(string(body))))
	if response.Code != 200 || calls != 2 || !strings.Contains(response.Body.String(), saved.Version) || !strings.Contains(response.Body.String(), review.Version) {
		t.Fatalf("Responses adaptation failed: %d calls=%d %s", response.Code, calls, response.Body.String())
	}
}

func TestSpokenCopyAcceptsProductNameWhenNoLongCopyExists(t *testing.T) {
	input := spokenCopyRequest{spokenCopyInput: spokenCopyInput{ProductName: "条纹上衣", VoiceMode: "voiceover", Duration: 6, TargetCps: 3.8, Beats: []spokenCopyBeatInput{{Index: 0, Start: 0, End: 6}}}, Model: "gpt-4o"}
	if err := validateSpokenCopyInput(input); err != nil {
		t.Fatalf("factual product name alone should allow minimal copy: %v", err)
	}
}

func TestSpokenCopyRejectsUnconfirmedSourceTermsButAllowsCurrentProductFacts(t *testing.T) {
	input := spokenCopyInput{ProductName: "条纹上衣", VoiceMode: "speech", Duration: 6, TargetCps: 3.8,
		SourceExclusions: []planSourceExclusion{{Term: "旧品牌", Type: "brand_signage"}},
		Beats:            []spokenCopyBeatInput{{Index: 0, Start: 0, End: 6}}}
	result := scriptCompletion(`{"beats":[{"index":0,"spokenLine":"看看旧品牌上衣","subtitle":"旧品牌"}]}`, "stop")
	if _, _, err := parseSpokenCopy(result, input); err == nil || !strings.Contains(err.Error(), "原片内容") {
		t.Fatalf("unconfirmed source term should be rejected: %v", err)
	}
	input.Facts = "旧品牌为当前商品品牌"
	if _, _, err := parseSpokenCopy(result, input); err != nil {
		t.Fatalf("term explicitly confirmed by current product facts should be allowed: %v", err)
	}
	input.Facts = ""
	input.SourceCopy = "当前商品的旧品牌"
	if _, _, err := parseSpokenCopy(result, input); err == nil || !strings.Contains(err.Error(), "原片内容") {
		t.Fatalf("generated copy must not prove an excluded source term: %v", err)
	}
	input.SourceCopy = "穿上显瘦"
	result = scriptCompletion(`{"beats":[{"index":0,"spokenLine":"穿上显瘦","subtitle":"显瘦"}]}`, "stop")
	if _, _, err := parseSpokenCopy(result, input); err == nil || !strings.Contains(err.Error(), "未经证实") {
		t.Fatalf("recommendation alone must not bypass promise validation: %v", err)
	}
}
