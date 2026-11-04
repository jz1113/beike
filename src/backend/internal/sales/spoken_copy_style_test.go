package sales

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/gateway"
)

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
