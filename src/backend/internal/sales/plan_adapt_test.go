package sales

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
)

func TestPlanAdaptValidatesBeatsAndBlocksUnverifiedPromises(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	input := `{"productName":"条纹针织开衫","category":"fashion","buyingPoints":["绵羊毛混纺条纹有层次"],"voiceMode":"speech","presentationMode":"subtitled_intro","sourceExclusions":["蓝色冲锋衣"],"model":"gpt-4o","beats":[{"index":0,"start":0,"end":3,"purpose":"hook","refAction":"看镜头微笑"},{"index":1,"start":3,"end":6,"purpose":"proof","refAction":"近景展示面料"}]}`

	// Rejects unverified promises like 显瘦 when not in facts
	badRec := httptest.NewRecorder()
	planAdaptHandler(config.Config{}, func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
		return 200, scriptCompletion(`{"beats":[{"index":0,"subject":"模特穿开衫","action":"正面展示","spokenLine":"穿上巨显瘦不挑身材","subtitle":"巨显瘦"},{"index":1,"subject":"开衫近景","action":"推进纹理","spokenLine":"条纹很有层次","subtitle":"条纹层次"}]}`, "stop"), nil
	}).ServeHTTP(badRec, httptest.NewRequest(http.MethodPost, "/api/sales/plan-adapt", strings.NewReader(input)))
	if badRec.Code != 502 || !strings.Contains(badRec.Body.String(), "显瘦") {
		t.Fatalf("expected unverified promise rejection: %d %s", badRec.Code, badRec.Body.String())
	}

	// Scrubs residual source exclusions and accepts grounded adaptation with matching beat count
	okRec := httptest.NewRecorder()
	planAdaptHandler(config.Config{}, func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
		return 200, scriptCompletion(`{"beats":[{"index":0,"subject":"模特穿蓝色冲锋衣","action":"中近景看向镜头，自然抬手展示蓝色冲锋衣门襟","spokenLine":"秋天配纯色内搭，这种条纹开衫特别有层次。","subtitle":"条纹针织层次感"},{"index":1,"subject":"开衫面料纹理","action":"镜头缓慢推近至胸前条纹织面","spokenLine":"绵羊毛混纺的纹理细节看得很清楚。","subtitle":"绵羊毛混纺纹理"}]}`, "stop"), nil
	}).ServeHTTP(okRec, httptest.NewRequest(http.MethodPost, "/api/sales/plan-adapt", strings.NewReader(input)))
	if okRec.Code != 200 {
		t.Fatalf("expected 200, got %d %s", okRec.Code, okRec.Body.String())
	}
	var parsed struct {
		Success bool                `json:"success"`
		Beats   []adaptedBeatOutput `json:"beats"`
	}
	_ = json.Unmarshal(okRec.Body.Bytes(), &parsed)
	if !parsed.Success || len(parsed.Beats) != 2 || strings.Contains(parsed.Beats[0].Action, "蓝色冲锋衣") || !strings.Contains(parsed.Beats[0].Action, "条纹针织开衫") {
		t.Fatalf("unexpected adapted response: %+v", parsed)
	}

	// Clean visual mode clears spokenLine and subtitle automatically
	cleanInput := `{"productName":"条纹针织开衫","category":"fashion","buyingPoints":["绵羊毛混纺条纹有层次"],"voiceMode":"none","presentationMode":"clean_visual","model":"gpt-4o","beats":[{"index":0,"start":0,"end":3,"purpose":"hook","refAction":"看镜头微笑"}]}`
	cleanRec := httptest.NewRecorder()
	planAdaptHandler(config.Config{}, func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
		return 200, scriptCompletion(`{"beats":[{"index":0,"subject":"模特穿条纹针织开衫","action":"中近景看向镜头展示开衫门襟","spokenLine":"这段话应该被清空","subtitle":"字幕也应被清空"}]}`, "stop"), nil
	}).ServeHTTP(cleanRec, httptest.NewRequest(http.MethodPost, "/api/sales/plan-adapt", strings.NewReader(cleanInput)))
	if cleanRec.Code != 200 {
		t.Fatalf("expected 200 for clean_visual, got %d %s", cleanRec.Code, cleanRec.Body.String())
	}
	var cleanParsed struct {
		Beats []adaptedBeatOutput `json:"beats"`
	}
	_ = json.Unmarshal(cleanRec.Body.Bytes(), &cleanParsed)
	if len(cleanParsed.Beats) != 1 || cleanParsed.Beats[0].SpokenLine != "" || cleanParsed.Beats[0].Subtitle != "" {
		t.Fatalf("expected clean_visual to clear spokenLine and subtitle: %+v", cleanParsed.Beats)
	}
}

func TestAdaptedBeatsUseStableIndexesAndRejectIncompleteResponses(t *testing.T) {
	valid := `{"beats":[{"index":1,"subject":"第二段","action":"展示细节"},{"index":0,"subject":"第一段","action":"正面展示"}]}`
	beats, err := parseAdaptedBeats(scriptCompletion(valid, "stop"), 2, "speech", "subtitled_intro", "", nil, "商品")
	if err != nil || len(beats) != 2 || beats[0].Subject != "第一段" || beats[1].Subject != "第二段" || beats[0].Index != 0 || beats[1].Index != 1 {
		t.Fatalf("reordered beats no longer match timeline: %+v %v", beats, err)
	}
	for _, test := range []struct{ name, content, finish string }{
		{"duplicate", `{"beats":[{"index":0,"action":"正面展示"},{"index":0,"action":"展示细节"}]}`, "stop"},
		{"missing", `{"beats":[{"action":"正面展示"},{"index":1,"action":"展示细节"}]}`, "stop"},
		{"null", `{"beats":[{"index":null,"action":"正面展示"},{"index":1,"action":"展示细节"}]}`, "stop"},
		{"out of range", `{"beats":[{"index":0,"action":"正面展示"},{"index":2,"action":"展示细节"}]}`, "stop"},
		{"truncated", valid, "length"},
		{"filtered", valid, "content_filter"},
		{"unfinished", valid, ""},
	} {
		t.Run(test.name, func(t *testing.T) {
			if _, err := parseAdaptedBeats(scriptCompletion(test.content, test.finish), 2, "speech", "subtitled_intro", "", nil, "商品"); err == nil {
				t.Fatal("invalid adaptation accepted")
			}
		})
	}
}

func TestPlanAdaptPassesReferenceStyleAndBeatContinuityToModel(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	input := `{"productName":"开衫","model":"gpt-4o","oneTake":true,"voiceMode":"none","visualSpec":{"aspectRatio":"9:16","oneTake":true,"styleSummary":"手机随拍，保留织物纹理","lighting":"侧窗光，明暗不均","cameraFeel":"固定机位","moodTags":["松弛"],"pacing":"slow"},"beats":[{"index":0,"start":0,"end":3,"refAction":"捏住衣摆后松手","subject":"手握商品边缘","scene":"窗边站立","transition":"松手后衣摆回落","expression":"低头查看衣摆"}]}`
	recorder := httptest.NewRecorder()
	planAdaptHandler(config.Config{}, func(_ context.Context, req gateway.TextRequest, _ bool) (int, map[string]any, error) {
		messages := req.Payload["messages"].([]any)
		content := messages[1].(map[string]any)["content"].(string)
		var forwarded planAdaptRequest
		start := strings.Index(content, "{")
		if start < 0 || json.Unmarshal([]byte(content[start:]), &forwarded) != nil {
			t.Fatal("model input lost structured reference context")
		}
		style := forwarded.VisualSpec
		if style == nil || !style.OneTake || style.AspectRatio != "9:16" || style.StyleSummary != "手机随拍，保留织物纹理" || style.Lighting != "侧窗光，明暗不均" || style.CameraFeel != "固定机位" || style.Pacing != "slow" || len(style.MoodTags) != 1 || style.MoodTags[0] != "松弛" {
			t.Fatalf("reference style changed before model call: %+v", style)
		}
		beat := forwarded.Beats[0]
		if beat.Subject != "手握商品边缘" || beat.Scene != "窗边站立" || beat.Transition != "松手后衣摆回落" || beat.Expression != "低头查看衣摆" {
			t.Fatalf("beat continuity changed before model call: %+v", beat)
		}
		return 200, scriptCompletion(`{"beats":[{"index":0,"action":"捏住开衫衣摆后松手","expression":"低头查看当前开衫衣摆","transition":"松手后衣摆回落"}]}`, "stop"), nil
	}).ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/api/sales/plan-adapt", strings.NewReader(input)))
	if recorder.Code != 200 {
		t.Fatalf("expected accepted style context, got %d %s", recorder.Code, recorder.Body.String())
	}
}

func TestPlanAdaptRejectsDroppedPerformanceAndKeepsAdaptedFields(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	input := `{"productName":"条纹开衫","model":"gpt-4o","voiceMode":"none","presentationMode":"clean_visual","sourceExclusions":["旧款外套"],"beats":[{"index":0,"start":0,"end":3,"refAction":"举手后回落","expression":"举臂看镜头，末段放松","transition":"双手回落保持站位"}]}`
	for _, test := range []struct {
		name, fields, missing string
	}{
		{"missing expression", `"transition":"双手回落"`, "眼神表情"},
		{"missing transition", `"expression":"举臂看镜头"`, "段落衔接"},
		{"complete", `"expression":"看向旧款外套后抬眼，嘴唇轻微分合","transition":"双手回落，保持站位"`, ""},
	} {
		t.Run(test.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			planAdaptHandler(config.Config{}, func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
				return 200, scriptCompletion(`{"beats":[{"index":0,"action":"举臂后回落",`+test.fields+`}]}`, "stop"), nil
			}).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/sales/plan-adapt", strings.NewReader(input)))
			if test.missing != "" {
				if rec.Code != 502 || !strings.Contains(rec.Body.String(), test.missing) {
					t.Fatalf("lost performance must not silently pass: %d %s", rec.Code, rec.Body.String())
				}
				return
			}
			var parsed struct {
				Beats []adaptedBeatOutput `json:"beats"`
			}
			if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &parsed) != nil || len(parsed.Beats) != 1 {
				t.Fatalf("invalid accepted response: %d %s", rec.Code, rec.Body.String())
			}
			beat := parsed.Beats[0]
			if beat.Expression != "看向条纹开衫后抬眼，嘴唇轻微分合" || beat.Transition != "双手回落，保持站位" || beat.SpokenLine != "" || beat.Subtitle != "" {
				t.Fatalf("performance lost or source terms leaked: %+v", beat)
			}
		})
	}
}

func TestPlanAdaptRejectsInvalidTimelineBeforeCallingModel(t *testing.T) {
	for _, beats := range []string{
		`[{"index":1,"start":0,"end":3}]`,
		`[{"index":0,"start":3,"end":3}]`,
		`[{"index":0,"start":-1,"end":3}]`,
		`[{"index":0,"start":0,"end":601}]`,
		`[{"index":0,"shotIndex":-1,"start":0,"end":3}]`,
		`[{"index":0,"start":0,"end":3},{"index":1,"start":1,"end":4}]`,
	} {
		rec := httptest.NewRecorder()
		planAdaptHandler(config.Config{}, func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
			t.Fatal("invalid timeline must not trigger a paid request")
			return 0, nil, nil
		}).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/sales/plan-adapt", strings.NewReader(`{"productName":"开衫","beats":`+beats+`}`)))
		if rec.Code != 400 || !strings.Contains(rec.Body.String(), "编号或时间范围") {
			t.Fatalf("invalid timeline accepted: %d %s", rec.Code, rec.Body.String())
		}
	}
}
