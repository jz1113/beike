package sales

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/gateway"
)

func TestSalesProductEvidenceExcludesGeneratedCopy(t *testing.T) {
	for _, label := range []string{"最终卖点文案：", "最终文案:", "口播文案：", "finalCopy:"} {
		facts := "材质：涤纶100%\n" + label + "\n这件三合一外套有加厚内胆，亲测显瘦"
		got := salesProductEvidence("单冲外套", facts)
		if got != "单冲外套\n材质：涤纶100%" {
			t.Fatalf("generated draft established its own facts: %q", got)
		}
	}
	if got := salesProductEvidence("外套", "内胆：可拆卸摇粒绒\n里布：涤纶"); !strings.Contains(got, "可拆卸摇粒绒") {
		t.Fatalf("original structural facts were discarded: %q", got)
	}
}

func TestPlanProductCompatibilityRejectsUnknownDeniedAndUnpicturedLiners(t *testing.T) {
	for _, test := range []struct{ name, product, facts, action, view, label, errorText string }{
		{"missing", "外套", "涤纶100%", "双手揉捏内胆下摆", "detail", "图1", "没有该部件证据"},
		{"bare keyword is not evidence", "外套", "内胆", "展示内胆", "detail", "图1", "没有该部件证据"},
		{"unrelated negative action cannot bypass", "外套", "涤纶100%", "不展示口袋只展示内胆", "detail", "图1", "没有该部件证据"},
		{"single shell", "秘境紫【单冲】", "内胆：摇粒绒", "双手揉捏内胆下摆", "detail", "图1", "明确否定"},
		{"explicit no liner", "外套", "不带内胆", "展示内胆", "detail", "图1", "明确否定"},
		{"suffix denial", "外套", "内胆：无", "展示内胆", "detail", "图1", "明确否定"},
		{"uncertain", "外套", "内胆待确认", "展示内胆", "detail", "图1", "尚未确认"},
		{"optional purchase", "外套", "另购可拆卸内胆", "展示内胆", "detail", "图1", "尚未确认"},
		{"reference claim", "外套", "原款带内胆", "展示内胆", "detail", "图1", "尚未确认"},
		{"reference action cannot bypass guard", "外套", "涤纶100%", "按原片展示内胆", "detail", "图1", "没有该部件证据"},
		{"boolean no", "外套", "内胆：false", "展示内胆", "detail", "图1", "明确否定"},
		{"missing attribute", "外套", "内胆：none", "展示内胆", "detail", "图1", "尚未确认"},
		{"empty attribute", "外套", "内胆：空", "展示内胆", "detail", "图1", "尚未确认"},
		{"deferred attribute", "外套", "内胆：以商品实际为准", "展示内胆", "detail", "图1", "尚未确认"},
		{"optional add-on", "外套", "内胆可加购", "展示内胆", "detail", "图1", "尚未确认"},
		{"standalone shell", "单层冲锋衣", "内胆：摇粒绒", "展示内胆", "detail", "图1", "明确否定"},
		{"lining is not liner", "外套", "内衬：涤纶", "展示内胆", "detail", "图1", "没有该部件证据"},
		{"liner is not lining", "外套", "内胆：摇粒绒", "展示内衬", "detail", "图1", "没有该部件证据"},
		{"worn fallback", "外套", "内胆：摇粒绒", "展示内胆", "worn", "图1", "细节图并重新绑定本段"},
		{"unbound", "外套", "内胆：摇粒绒", "展示内胆", "detail", "", "细节图并重新绑定本段"},
		{"generic inner part", "外套", "内胆：摇粒绒", "揉捏{{商品内部配件}}", "detail", "图1", "尚未绑定具体部件"},
		{"generic body part", "外套", "涤纶100%", "轻抚该部位", "worn", "图1", "指向不明确"},
		{"ambiguous body part", "外套", "涤纶100%", "手从领口到袖口，轻抚该部位", "worn", "图1", "指向不明确"},
		{"detach not established", "外套", "内胆：摇粒绒", "拆下内胆", "detail", "图1", "没有明确支持可拆卸"},
		{"detach denied", "外套", "内胆：摇粒绒，不可拆卸", "拆下内胆", "detail", "图1", "没有明确支持可拆卸"},
		{"other component detachable", "外套", "内胆：摇粒绒，帽子可拆卸", "拆下内胆", "detail", "图1", "没有明确支持可拆卸"},
		{"other component in same clause", "外套", "配有摇粒绒内胆与可拆卸帽子", "拆下内胆", "detail", "图1", "没有明确支持可拆卸"},
		{"contradictory facts", "外套", "可拆卸内胆；内胆不可拆卸", "拆下内胆", "detail", "图1", "没有明确支持可拆卸"},
		{"fixed liner contradicts removable", "外套", "可拆卸内胆；固定内胆", "拆下内胆", "detail", "图1", "没有明确支持可拆卸"},
		{"removal of material-qualified part", "外套", "内胆：摇粒绒", "拆掉加厚摇粒绒内胆", "detail", "图1", "没有明确支持可拆卸"},
	} {
		t.Run(test.name, func(t *testing.T) {
			err := validateSalesProductPart(2, test.action, salesProductEvidence(test.product, test.facts), test.view, test.label)
			if err == nil || !strings.Contains(err.Error(), "动作段 3") || !strings.Contains(err.Error(), test.errorText) {
				t.Fatalf("expected localized structural rejection %q, got %v", test.errorText, err)
			}
		})
	}
}

func TestPlanProductCompatibilityAllowsGroundedStructuresAndOrdinaryExteriorActions(t *testing.T) {
	for _, test := range []struct{ product, facts, action, view string }{
		{"外套", "可拆卸摇粒绒内胆", "拆下内胆展示", "detail"},
		{"外套", "内胆支持拆卸", "拆下内胆展示", "detail"},
		{"外套", "有无内胆：有", "展示内胆纹理", "detail"},
		{"不是单冲款的外套", "非单冲款配有内胆", "展示内胆纹理", "detail"},
		{"外套", "不含帽子且有内胆", "展示内胆纹理", "detail"},
		{"无袖外套", "无袖款配有摇粒绒内胆", "无袖款外套展示内胆", "detail"},
		{"外套", "可拆卸摇粒绒内胆。帽子不可拆卸", "拆下内胆展示", "detail"},
		{"单冲外套", "里布：100%涤纶", "展示内衬下摆", "detail"},
		{"单冲外套", "固定内衬", "展示内衬下摆", "detail"},
		{"外套", "内衬：涤纶", "拆开衣襟，展示内衬", "detail"},
		{"外套", "涤纶100%", "打开衣襟展示外壳内侧及内部结构", "worn"},
		{"开衫", "", "指向袖口后轻抚该部位", "worn"},
		{"外套", "", "整理衣襟，展示口袋和拉链，转身展示背面", "worn"},
		{"无内胆单冲外套", "涤纶100%", "只展示外壳，不展示内胆", "worn"},
		{"无内胆单冲外套", "涤纶100%", "只展示外壳，不生成内胆", "worn"},
		{"无内胆单冲外套", "涤纶100%", "不要补造内胆，不把内搭当内胆", "worn"},
		{"无内胆单冲外套", "涤纶100%", "不得展示内胆或新增内衬", "worn"},
		{"无内胆单冲外套", "涤纶100%", "不要生成内部配件", "worn"},
		{"外套", "内胆：摇粒绒", "拆开衣襟，展示内胆", "detail"},
		{"外套", "内胆：摇粒绒", "展示内胆，但不拆卸内胆", "detail"},
		{"外套", "内胆：摇粒绒", "展示内胆并且不拆卸内胆", "detail"},
		{"外套", "可拆卸摇粒绒内胆；固定网布内衬", "展示内衬，拆下内胆", "detail"},
	} {
		if err := validateSalesProductPart(0, test.action, salesProductEvidence(test.product, test.facts), test.view, "图1"); err != nil {
			t.Errorf("compatible original action rejected: %q: %v", test.action, err)
		}
	}
}

func TestPlanProductAmbiguityQuotesTheActualActionText(t *testing.T) {
	for _, term := range []string{"商品细节部位", "该部位"} {
		err := validateSalesProductPart(1, "右手按压门襟，轻抚"+term+"，展示口袋", "涤纶100%", "worn", "图1")
		if err == nil || !strings.Contains(err.Error(), "「"+term+"」指向不明确") {
			t.Fatalf("ambiguous %q was not quoted accurately: %v", term, err)
		}
		if term != "该部位" && strings.Contains(err.Error(), "「该部位」") {
			t.Fatalf("error introduced a phrase absent from the action: %v", err)
		}
	}
}

func TestPlanProductCompatibilityAllowsGenericVisualDetailDisplays(t *testing.T) {
	for _, action := range []string{
		"双手提至胸前指尖相对比划爱心手势，头部轻微向斜上方倾斜，展示商品细节部位。",
		"双手比心，展示{{商品细节部位}}。",
		"双手比心，同时自然展示{{ 商品细节部位 }}的外观。",
		"转身后停留，继续呈现商品细节部位的质感。",
	} {
		if err := validateSalesProductPart(2, action, "单冲外套\n涤纶100%", "worn", "图1"); err != nil {
			t.Errorf("ordinary visual display was treated as an unbound operation: %q: %v", action, err)
		}
	}
}

func TestPlanProductGenericDisplayDoesNotBypassSpecificOperations(t *testing.T) {
	for _, action := range []string{
		"轻抚商品细节部位，展示外观",
		"手指指向并展示商品细节部位",
		"展示商品细节部位并按压",
		"展示商品细节部位，左手轻抚商品细节部位",
		"展示{{商品细节部位}}，轻抚该部位",
		"展示商品细节部位，揉捏内胆下摆",
		"展示商品细节部位，拆下内胆",
	} {
		if err := validateSalesProductPart(2, action, "单冲外套\n涤纶100%", "worn", "图1"); err == nil {
			t.Errorf("generic visual display bypassed a specific product operation: %q", action)
		}
	}
}

func TestPlanAdaptPreservesDepthGesturesWithGenericDetailDisplay(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	action := "双手提至胸前指尖相对比划爱心手势，头部轻微向斜上方倾斜，展示{{商品细节部位}}。"
	body := planAdaptRequest{ProductName: "单冲外套", Facts: "涤纶100%", Model: "gpt-4o", VoiceMode: "none",
		PresentationMode: "clean_visual", ImitationMode: "depth_imitation",
		Beats: []planAdaptBeatInput{{Index: 0, Start: 0, End: 2.6, RefAction: action,
			AssignedView: "worn", ImageLabel: "图1", ActionReference: "深度视频的 5.2—7.8 秒动作"}},
	}
	input, _ := json.Marshal(body)
	calls := 0
	rec := httptest.NewRecorder()
	planAdaptHandler(setupPromptExecutionTestConfig(t), func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
		calls++
		return 200, scriptCompletion(`{"beats":[{"index":0,"subject":"穿着当前外套的人物","action":"模型尝试更换手势","spokenLine":"","subtitle":""}]}`, "stop"), nil
	}).ServeHTTP(rec, httptest.NewRequest("POST", "/api/sales/plan-adapt", strings.NewReader(string(input))))
	var result struct {
		Beats []adaptedBeatOutput `json:"beats"`
	}
	if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &result) != nil || len(result.Beats) != 1 || calls != 1 {
		t.Fatalf("depth gesture adaptation did not complete: %d %s", rec.Code, rec.Body.String())
	}
	if result.Beats[0].Action != action || result.Beats[0].SpokenLine != "" {
		t.Fatalf("depth gesture or silent mode changed during adaptation: %+v", result.Beats[0])
	}
}

func TestPlanProductAmbiguityLocatesTheActualInputAndOutputField(t *testing.T) {
	action := "镜头下移，右手按压门襟，左手轻抚商品细节部位，展示平整外观。"
	body := planAdaptRequest{ProductName: "单冲外套", Facts: "涤纶100%", Beats: []planAdaptBeatInput{
		{Index: 0, RefAction: "整理衣襟"},
		{Index: 1, Subject: "带口袋的外套", RefAction: action, AssignedView: "worn", ImageLabel: "图1"},
	}}
	err := validatePlanProductInput(body)
	if err == nil || !strings.Contains(err.Error(), "动作段 2 的画面动作中「商品细节部位」指向不明确") || strings.Contains(err.Error(), "「该部位」") {
		t.Fatalf("input diagnostic did not locate the actual text: %v", err)
	}
	beats := []adaptedBeatOutput{{Index: 0, Action: "整理衣襟"}, {Index: 1, Subject: "带口袋的外套", Action: "右手按压门襟", Transition: "左手继续轻抚商品细节部位"}}
	err = validatePlanProductOutput(beats, body)
	if err == nil || !strings.Contains(err.Error(), "动作段 2 的衔接中「商品细节部位」指向不明确") {
		t.Fatalf("output diagnostic did not locate the actual text: %v", err)
	}
	// An ordinary explicit action remains valid; diagnostics must not change the guard.
	body.Beats[1].Subject = "当前外套"
	if err := validatePlanProductInput(body); err != nil {
		t.Fatalf("a uniquely named contact object became ambiguous: %v", err)
	}
}

func TestPlanAdaptBlocksIncompatibleSourceBeforePaidRequest(t *testing.T) {
	input := `{"productName":"单冲外套","facts":"涤纶100%","summary":"内胆厚实","buyingPoints":["内胆可拆"],"beats":[{"index":0,"start":0,"end":3,"refAction":"整理衣襟"},{"index":1,"start":3,"end":6,"refAction":"揉捏内胆下摆","assignedView":"detail","imageLabel":"图1"}]}`
	rec := httptest.NewRecorder()
	planAdaptHandler(setupPromptExecutionTestConfig(t), func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
		t.Fatal("incompatible source must not trigger a paid request")
		return 0, nil, nil
	}).ServeHTTP(rec, httptest.NewRequest("POST", "/api/sales/plan-adapt", strings.NewReader(input)))
	if rec.Code != 400 || !strings.Contains(rec.Body.String(), "动作段 2") {
		t.Fatalf("source structure was not blocked before generation: %d %s", rec.Code, rec.Body.String())
	}
}

func TestPlanAdaptRejectsModelInventedStructureAndDraftPromises(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	for _, test := range []struct{ subject, spokenLine, errorText string }{
		{"展示厚实内胆", "", "没有该部件证据"},
		{"当前外套", "亲测显瘦", "未经证实"},
	} {
		body := map[string]any{"productName": "外套", "facts": "涤纶100%\n最终卖点文案：亲测显瘦，带可拆卸内胆", "summary": "亲测显瘦，内胆厚实", "buyingPoints": []string{"亲测显瘦", "内胆可拆"}, "voiceMode": "speech", "model": "gpt-4o", "beats": []any{map[string]any{"index": 0, "start": 0, "end": 3, "refAction": "整理衣襟", "assignedView": "worn", "imageLabel": "图1"}}}
		input, _ := json.Marshal(body)
		rec := httptest.NewRecorder()
		planAdaptHandler(setupPromptExecutionTestConfig(t), func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
			content, _ := json.Marshal(map[string]any{"beats": []any{map[string]any{"index": 0, "subject": test.subject, "action": "整理衣襟", "spokenLine": test.spokenLine}}})
			return 200, scriptCompletion(string(content), "stop"), nil
		}).ServeHTTP(rec, httptest.NewRequest("POST", "/api/sales/plan-adapt", strings.NewReader(string(input))))
		if rec.Code != 502 || !strings.Contains(rec.Body.String(), test.errorText) {
			t.Fatalf("generated summary/copy established unsupported output: %d %s", rec.Code, rec.Body.String())
		}
	}
}

func TestReframeOnlyIncompatibleUnlockedScriptOnlyPerformance(t *testing.T) {
	b := planAdaptRequest{AllowProductReframe: true, ImitationMode: "script_only", ProductName: "单冲外套", Facts: "无内胆", Beats: []planAdaptBeatInput{{RefAction: "拆下内胆展示", AssignedView: "front"}, {RefAction: "向镜头挥手"}}}
	performance, changes := planAdaptPerformance(b)
	if len(changes) != 1 || changes[0] == "" || performance[0].RefAction != "" || performance[1].RefAction != "向镜头挥手" || b.Beats[0].RefAction == "" {
		t.Fatal(performance, changes)
	}
	b.Beats[0].PreservePerformance = true
	if _, changes := planAdaptPerformance(b); len(changes) != 0 {
		t.Fatal("manual action changed")
	}
	b.Beats[0].PreservePerformance = false
	b.ImitationMode = "depth_imitation"
	if _, changes := planAdaptPerformance(b); len(changes) != 0 {
		t.Fatal("depth motion changed")
	}
}
