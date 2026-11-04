package sales

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/gateway"
)

func TestPlanAdaptPreservesExclusionRolesAcrossModelRequestAndEveryOutputField(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	input := `{"productName":"当前开衫","model":"gpt-4o","voiceMode":"speech","sceneSummary":"当前室内客厅","sourceExclusions":[{"term":"旧外套","type":"product"},{"term":"旧人物","type":"person_appearance"},{"term":"暮色背景","type":"scene"},{"term":"旧手袋","type":"prop"},{"term":"旧花字","type":"text"},"历史商品"],"beats":[{"index":0,"start":0,"end":3,"refAction":"保持动作","expression":"抬眼后回落","transition":"延续末姿势","sourceVoiceText":"原片台词","sourceLinePattern":"开场介绍","sourceSubtitle":"原片字幕"}]}`
	content := "旧外套，旧人物，暮色背景，旧手袋，旧花字，历史商品，保持动作"
	response, _ := json.Marshal(map[string]any{"beats": []map[string]any{{
		"index": 0, "subject": content, "action": content, "expression": content,
		"transition": content, "spokenLine": content, "subtitle": content,
	}}})
	recorder := httptest.NewRecorder()
	planAdaptHandler(setupPromptExecutionTestConfig(t), func(_ context.Context, req gateway.TextRequest, _ bool) (int, map[string]any, error) {
		messages := req.Payload["messages"].([]any)
		user := messages[1].(map[string]any)["content"].(string)
		var forwarded planAdaptRequest
		if err := json.Unmarshal([]byte(user[strings.Index(user, "{"):]), &forwarded); err != nil {
			t.Fatal(err)
		}
		if len(forwarded.Beats) != 1 || forwarded.Beats[0].SourceVoiceText != "原片台词" || forwarded.Beats[0].SourceLinePattern != "开场介绍" || forwarded.Beats[0].SourceSubtitle != "原片字幕" {
			t.Fatalf("reference speech did not reach the first model: %+v", forwarded.Beats)
		}
		wantTypes := []string{"product", "person_appearance", "scene", "prop", "text", "product"}
		for i, want := range wantTypes {
			if forwarded.SourceExclusions[i].Type != want {
				t.Fatalf("exclusion %d lost its role: %+v", i, forwarded.SourceExclusions)
			}
		}
		return 200, scriptCompletion(string(response), "stop"), nil
	}).ServeHTTP(recorder, httptest.NewRequest("POST", "/api/sales/plan-adapt", strings.NewReader(input)))
	var result struct {
		Beats []adaptedBeatOutput `json:"beats"`
	}
	if recorder.Code != 200 || json.Unmarshal(recorder.Body.Bytes(), &result) != nil || len(result.Beats) != 1 {
		t.Fatalf("typed adaptation failed: %d %s", recorder.Code, recorder.Body.String())
	}
	beat := result.Beats[0]
	if beat.Action != "保持动作" || beat.Expression != "抬眼后回落" || beat.Transition != "延续末姿势" {
		t.Fatalf("model performance replaced the reference: %+v", beat)
	}
	for _, field := range []string{beat.Subject, beat.SpokenLine, beat.Subtitle} {
		if strings.Count(field, "当前开衫") != 2 {
			t.Fatalf("only current and legacy product terms may become the product name: %q", field)
		}
		for _, term := range []string{"旧外套", "旧人物", "暮色背景", "旧手袋", "旧花字", "历史商品"} {
			if strings.Contains(field, term) {
				t.Fatalf("source entity leaked into adaptation: %q", field)
			}
		}
	}
}

func TestAdaptedExclusionsRemoveEveryNonProductRole(t *testing.T) {
	var emptyLegacy planSourceExclusion
	if err := json.Unmarshal([]byte(`""`), &emptyLegacy); err != nil || scrubAdaptedTerms("保持动作", []planSourceExclusion{emptyLegacy}, "开衫") != "保持动作" {
		t.Fatalf("legacy blank exclusions must remain harmless: %+v %v", emptyLegacy, err)
	}
	for _, role := range []string{"person_appearance", "person", "scene", "prop", "text", "accessory", "brand_signage", "copy_claim", "future-role"} {
		t.Run(role, func(t *testing.T) {
			if got := scrubAdaptedTerms("旧元素展示当前商品", []planSourceExclusion{{Term: "旧元素", Type: role}}, "开衫"); got != "展示当前商品" {
				t.Fatalf("non-product entity must be removed instead of becoming a product: %q", got)
			}
		})
	}
	if got := scrubAdaptedTerms("展示针织开衫", []planSourceExclusion{{Term: "针织", Type: "product"}}, "针织开衫"); got != "展示针织开衫" {
		t.Fatalf("a term in the selected product must not replace itself: %q", got)
	}
}

func TestPlanAdaptRejectsUntypedExclusionObjectsBeforeCallingModel(t *testing.T) {
	for _, exclusion := range []string{`{"term":"旧人物"}`, `{"term":"旧人物","type":""}`, `{"term":"","type":"scene"}`, `{"term":"旧人物","type":7}`} {
		recorder := httptest.NewRecorder()
		planAdaptHandler(setupPromptExecutionTestConfig(t), func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
			t.Fatal("invalid exclusions must not trigger generation")
			return 0, nil, nil
		}).ServeHTTP(recorder, httptest.NewRequest("POST", "/api/sales/plan-adapt", strings.NewReader(`{"productName":"商品","sourceExclusions":[`+exclusion+`],"beats":[{"index":0,"start":0,"end":3}]}`)))
		if recorder.Code != 400 {
			t.Fatalf("invalid exclusion accepted: %d %s", recorder.Code, recorder.Body.String())
		}
	}
}

func TestPlanAdaptPromptSeparatesReplacedSceneFromReferencePhotography(t *testing.T) {
	for _, rule := range []string{"subject / action / expression / transition", "原室内外属性", "空间与光源位置以当前场景为准", "不能替成商品名"} {
		if !strings.Contains(planAdaptPrompt, rule) {
			t.Fatalf("default adaptation prompt lost scene/entity isolation: %s", rule)
		}
	}
}

func TestReferenceAnalysisKeepsSourceSceneryAndEndCardsSeparateFromMotion(t *testing.T) {
	for _, rule := range []string{"原地点、室内外属性、天空天幕与背景为 scene", "片尾文字卡为 copy_claim", "最后一个实质动作结束的时点", "片尾卡是独立剪辑内容", "purpose 写 other", "不虚构不存在的正常收势"} {
		if !strings.Contains(scriptOutputFields, rule) {
			t.Fatalf("reference analysis lost scene/end-card separation: %s", rule)
		}
	}
}
