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

func TestPlanAdaptValidatesBeatsAndBlocksUnverifiedPromises(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	input := `{"productName":"条纹针织开衫","category":"fashion","buyingPoints":["绵羊毛混纺条纹有层次"],"voiceMode":"speech","presentationMode":"subtitled_intro","sourceExclusions":["蓝色冲锋衣"],"model":"gpt-4o","beats":[{"index":0,"start":0,"end":3,"purpose":"hook","refAction":"看镜头微笑"},{"index":1,"start":3,"end":6,"purpose":"proof","refAction":"近景展示面料"}]}`

	// Rejects unverified promises like 显瘦 when not in facts
	badRec := httptest.NewRecorder()
	planAdaptHandler(setupPromptExecutionTestConfig(t), func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
		return 200, scriptCompletion(`{"beats":[{"index":0,"subject":"模特穿开衫","action":"正面展示","spokenLine":"穿上巨显瘦不挑身材","subtitle":"巨显瘦"},{"index":1,"subject":"开衫近景","action":"推进纹理","spokenLine":"条纹很有层次","subtitle":"条纹层次"}]}`, "stop"), nil
	}).ServeHTTP(badRec, httptest.NewRequest(http.MethodPost, "/api/sales/plan-adapt", strings.NewReader(input)))
	if badRec.Code != 502 || !strings.Contains(badRec.Body.String(), "显瘦") {
		t.Fatalf("expected unverified promise rejection: %d %s", badRec.Code, badRec.Body.String())
	}

	// Scrubs residual source exclusions and accepts grounded adaptation with matching beat count
	okRec := httptest.NewRecorder()
	planAdaptHandler(setupPromptExecutionTestConfig(t), func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
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
	if !parsed.Success || len(parsed.Beats) != 2 || parsed.Beats[0].Action != "看镜头微笑" || parsed.Beats[1].Action != "近景展示面料" || strings.Contains(parsed.Beats[0].Subject, "蓝色冲锋衣") || !strings.Contains(parsed.Beats[0].Subject, "条纹针织开衫") {
		t.Fatalf("unexpected adapted response: %+v", parsed)
	}

	// Clean visual mode clears spokenLine and subtitle automatically
	cleanInput := `{"productName":"条纹针织开衫","category":"fashion","buyingPoints":["绵羊毛混纺条纹有层次"],"voiceMode":"none","presentationMode":"clean_visual","model":"gpt-4o","beats":[{"index":0,"start":0,"end":3,"purpose":"hook","refAction":"看镜头微笑"}]}`
	cleanRec := httptest.NewRecorder()
	planAdaptHandler(setupPromptExecutionTestConfig(t), func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
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
	beats, err := parseAdaptedBeats(scriptCompletion(valid, "stop"), 2, "speech", "subtitled_intro", "", nil, "商品", nil)
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
			if _, err := parseAdaptedBeats(scriptCompletion(test.content, test.finish), 2, "speech", "subtitled_intro", "", nil, "商品", nil); err == nil {
				t.Fatal("invalid adaptation accepted")
			}
		})
	}
}

func TestPlanAdaptPassesReferenceStyleAndBeatContinuityToModel(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	input := `{"productName":"开衫","model":"gpt-4o","oneTake":true,"voiceMode":"none","visualSpec":{"aspectRatio":"9:16","oneTake":true,"styleSummary":"手机随拍，保留织物纹理","lighting":"侧窗光，明暗不均","cameraFeel":"固定机位","moodTags":["松弛"],"pacing":"slow"},"beats":[{"index":0,"start":0,"end":3,"refAction":"捏住衣摆后松手","subject":"手握商品边缘","scene":"窗边站立","transition":"松手后衣摆回落","expression":"低头查看衣摆"}]}`
	recorder := httptest.NewRecorder()
	planAdaptHandler(setupPromptExecutionTestConfig(t), func(_ context.Context, req gateway.TextRequest, _ bool) (int, map[string]any, error) {
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

func TestPlanAdaptKeepsReferencePerformanceWhenModelChangesOrOmitsIt(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	input := `{"productName":"条纹开衫","model":"gpt-4o","voiceMode":"none","presentationMode":"clean_visual","sourceExclusions":["旧款外套"],"beats":[{"index":0,"start":0,"end":3,"refAction":"举手后回落，旧款外套随动作回落","expression":"举臂看镜头，末段放松","transition":"双手回落保持站位"}]}`
	for _, test := range []struct {
		name, fields string
	}{
		{"missing performance", `"subject":"当前人物穿条纹开衫"`},
		{"missing expression", `"action":"拉扯门襟展示卖点","transition":"前倾靠近镜头"`},
		{"missing transition", `"action":"转身展示背面","expression":"全程露齿大笑"`},
		{"changed performance", `"action":"挥臂展示商品","expression":"看向旧款外套后抬眼，嘴唇轻微分合","transition":"挥手离开"`},
	} {
		t.Run(test.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			planAdaptHandler(setupPromptExecutionTestConfig(t), func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
				return 200, scriptCompletion(`{"beats":[{"index":0,`+test.fields+`}]}`, "stop"), nil
			}).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/sales/plan-adapt", strings.NewReader(input)))
			var parsed struct {
				Beats []adaptedBeatOutput `json:"beats"`
			}
			if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &parsed) != nil || len(parsed.Beats) != 1 {
				t.Fatalf("invalid accepted response: %d %s", rec.Code, rec.Body.String())
			}
			beat := parsed.Beats[0]
			if beat.Action != "举手后回落，条纹开衫随动作回落" || beat.Expression != "举臂看镜头，末段放松" || beat.Transition != "双手回落保持站位" || beat.SpokenLine != "" || beat.Subtitle != "" {
				t.Fatalf("performance lost or source terms leaked: %+v", beat)
			}
		})
	}
}

func TestAdaptedBeatsOnlyScrubEntitiesFromLockedReferencePerformance(t *testing.T) {
	source := []planAdaptBeatInput{{
		RefAction:  "手指捏住旧外套衣摆后松开，镜头固定",
		Expression: "看向旧人物后垂眼，嘴角回落",
		Transition: "朝旧房间方向侧身后停住",
	}}
	exclusions := []planSourceExclusion{{Term: "旧外套", Type: "product"}, {Term: "旧人物", Type: "person_appearance"}, {Term: "旧房间", Type: "scene"}}
	data := scriptCompletion(`{"beats":[{"index":0,"subject":"当前人物穿旧外套","action":"拉扯领口","expression":"闭眼大笑","transition":"向镜头走近","spokenLine":"条纹有层次","subtitle":"条纹层次"}]}`, "stop")
	beats, err := parseAdaptedBeats(data, 1, "speech", "subtitled_intro", "条纹有层次", exclusions, "条纹开衫", source)
	if err != nil {
		t.Fatal(err)
	}
	beat := beats[0]
	if beat.Action != "手指捏住条纹开衫衣摆后松开，镜头固定" || beat.Expression != "看向后垂眼，嘴角回落" || beat.Transition != "朝方向侧身后停住" {
		t.Fatalf("reference performance changed beyond entity scrubbing: %+v", beat)
	}
	if beat.Subject != "当前人物穿条纹开衫" || beat.SpokenLine != "条纹有层次" || beat.Subtitle != "条纹层次" {
		t.Fatalf("model copy or current subject was lost: %+v", beat)
	}
}

func TestAdaptedBeatsDoNotInventMissingReferencePerformance(t *testing.T) {
	data := scriptCompletion(`{"beats":[{"index":0,"action":"挥手显瘦","expression":"闭眼大笑","transition":"朝镜头走近"}]}`, "stop")
	source := []planAdaptBeatInput{{RefAction: "抬手后回落"}}
	beats, err := parseAdaptedBeats(data, 1, "none", "clean_visual", "", nil, "开衫", source)
	if err != nil || len(beats) != 1 || beats[0].Action != "抬手后回落" || beats[0].Expression != "" || beats[0].Transition != "" {
		t.Fatalf("discarded model performance changed or blocked the reference: %+v %v", beats, err)
	}
	source[0].RefAction = "展示显瘦效果"
	if _, err := parseAdaptedBeats(data, 1, "none", "clean_visual", "", nil, "开衫", source); err == nil || !strings.Contains(err.Error(), "显瘦") {
		t.Fatalf("locked reference bypassed unverified-promise checks: %v", err)
	}
}

func TestAdaptedBeatsWithoutReferenceActionKeepLegacyModelPerformance(t *testing.T) {
	data := scriptCompletion(`{"beats":[{"index":0,"action":"举手后回落","expression":"垂眼后抬头","transition":"保持末姿势"}]}`, "stop")
	beats, err := parseAdaptedBeats(data, 1, "none", "clean_visual", "", nil, "开衫", []planAdaptBeatInput{{}})
	if err != nil || len(beats) != 1 || beats[0].Action != "举手后回落" || beats[0].Expression != "垂眼后抬头" || beats[0].Transition != "保持末姿势" {
		t.Fatalf("legacy request lost its model performance: %+v %v", beats, err)
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
		planAdaptHandler(setupPromptExecutionTestConfig(t), func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
			t.Fatal("invalid timeline must not trigger a paid request")
			return 0, nil, nil
		}).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/sales/plan-adapt", strings.NewReader(`{"productName":"开衫","beats":`+beats+`}`)))
		if rec.Code != 400 || !strings.Contains(rec.Body.String(), "编号或时间范围") {
			t.Fatalf("invalid timeline accepted: %d %s", rec.Code, rec.Body.String())
		}
	}
}

func TestPlanAdaptResponsesRouteSendsSavedPromptAndDataWithoutHiddenInstructions(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	d, _ := findPromptDefinition("plan-adapt")
	savedText := "  唯一保存的分镜改编文本。\n保留这些原始空白与换行。  "
	saved, err := saveSalesPrompt(t.Context(), cfg, "local", d, &savedText, d.resolve(nil).Version)
	if err != nil {
		t.Fatal(err)
	}
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/v1/responses" || r.Header.Get("Authorization") != "Bearer test-key" {
			t.Errorf("wrong Responses route: %s", r.URL.Path)
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
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		if body.Model != "gpt-5.4" || len(body.Input) != 2 || len(body.Input[0].Content) != 1 || len(body.Input[1].Content) != 1 {
			t.Errorf("saved prompt/data missing: %+v", body)
			http.Error(w, "invalid adapter input", 400)
			return
		}
		if body.Input[0].Role != "system" || body.Input[0].Content[0].Text != savedText || body.Input[0].Content[0].Type != "input_text" {
			t.Errorf("saved system text changed: %+v", body.Input[0])
		}
		data, prefixed := strings.CutPrefix(body.Input[1].Content[0].Text, "分镜输入数据：\n")
		var input planAdaptRequest
		if body.Input[1].Role != "user" || !prefixed || json.Unmarshal([]byte(data), &input) != nil || input.ProductName != "当前商品" || len(input.Beats) != 1 {
			t.Errorf("structured user input lost or extra instructions appended: %+v", body.Input[1])
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"status": "completed", "output_text": `{"beats":[{"index":0,"action":"展示当前商品","expression":"","transition":"","spokenLine":"","subtitle":""}]}`})
	}))
	defer server.Close()
	previous := gateway.ModelHTTP
	gateway.ModelHTTP = server.Client
	t.Cleanup(func() { gateway.ModelHTTP = previous })
	body, _ := json.Marshal(map[string]any{"productName": "当前商品", "model": "openai-responses:gpt-5.4", "customBaseUrl": server.URL, "customApiKey": "test-key", "apiFormat": "openai-responses", "voiceMode": "none", "presentationMode": "clean_visual", "beats": []any{map[string]any{"index": 0, "start": 0, "end": 3, "refAction": "展示商品"}}})
	response := httptest.NewRecorder()
	PlanAdapt(cfg).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/sales/plan-adapt", strings.NewReader(string(body))))
	if response.Code != 200 || calls != 1 || !strings.Contains(response.Body.String(), saved.Version) {
		t.Fatalf("Responses adaptation failed or replayed: %d calls=%d %s", response.Code, calls, response.Body.String())
	}
}

func TestJointPlanUsesSavedWritingPromptAndEditedCopy(t *testing.T) {
	cfg := setupPromptExecutionTestConfig(t)
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	writer, _ := loadSalesPrompt(t.Context(), cfg, "local", "spoken-copy")
	calls := 0
	handler := planAdaptHandler(cfg, func(_ context.Context, req gateway.TextRequest, _ bool) (int, map[string]any, error) {
		calls++
		messages := req.Payload["messages"].([]any)
		if !strings.Contains(messages[0].(map[string]any)["content"].(string), writer.Prompt) {
			t.Fatal("saved writing template missing")
		}
		input := messages[1].(map[string]any)["content"].(string)
		for _, field := range []string{"用户只想讲条纹搭配", "成分有冲突", "timingBudget"} {
			if !strings.Contains(input, field) {
				t.Fatal("missing", field)
			}
		}
		return 200, scriptCompletion(`{"beats":[{"index":0,"action":"展示条纹","spokenLine":"条纹配纯色","subtitle":"条纹搭配"}]}`, "stop"), nil
	})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest("POST", "/", strings.NewReader(`{"productName":"条纹上衣","model":"test","voiceMode":"speech","facts":"有条纹","narration":{"sourceCopy":"用户只想讲条纹搭配","duration":3,"targetCps":3.8},"unresolved":["成分有冲突"],"beats":[{"index":0,"start":0,"end":3,"refAction":"展示条纹"}]}`)))
	if rec.Code != 200 || calls != 1 || !strings.Contains(rec.Body.String(), writer.Version) {
		t.Fatal(rec.Code, calls, rec.Body.String())
	}
}
