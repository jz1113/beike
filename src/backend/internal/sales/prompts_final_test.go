package sales

import (
	"database/sql"
	"encoding/json"
	"strings"
	"testing"
)

func TestFinalVideoPromptsRemoveStaleRulesAndSaveIndependently(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	// An old override without a matching template version must be removed.
	legacy := "  用户此前保存的最终规则，不能因新增模式被替换。\n  "
	if _, err := db.Exec(`INSERT INTO "SalesPromptOverride" ("workspaceId","promptId","prompt","updatedAt") VALUES ('local','final-video',?,'existing')`, legacy); err != nil {
		t.Fatal(err)
	}
	mux := promptTestMux(cfg)
	items := parsePromptList(t, requestPrompt(mux, "GET", "/api/sales/prompts", "", "local"))
	byID := make(map[string]salesPrompt, len(items))
	for _, item := range items {
		byID[item.ID] = item
	}
	script, depth := byID["final-video"], byID["final-video-depth"]
	if script.ID != "final-video" || script.Title != "最终视频生成 · 纯分镜版" || script.Prompt != script.DefaultPrompt || !script.Configured {
		t.Fatalf("existing final-video content was replaced: %+v", script)
	}
	if depth.ID != "final-video-depth" || depth.Title != "最终视频生成 · 深度视频版" || depth.Prompt != depth.DefaultPrompt || !depth.Configured {
		t.Fatalf("new depth workflow silently inherited executable rules: %+v", depth)
	}
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM "SalesPromptOverride"`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("listing prompts initialized user data: %d %v", count, err)
	}
	depthText := "  用户保存的完整深度规则。\n" + depth.DefaultPrompt + "\n  "
	if rec := requestPrompt(mux, "PUT", "/api/sales/prompts/final-video-depth", promptUpdateJSON(&depthText, depth.Version), "local"); rec.Code != 200 {
		t.Fatal(rec.Code, rec.Body.String())
	}
	storedDepth, err := loadSalesPrompt(t.Context(), cfg, "local", "final-video-depth")
	if err != nil || storedDepth.Prompt != depthText {
		t.Fatalf("depth rule was rewritten: %+v %v", storedDepth, err)
	}
	storedScript, err := loadSalesPrompt(t.Context(), cfg, "local", "final-video")
	if err != nil || storedScript.Prompt != script.Prompt || storedScript.Version != script.Version {
		t.Fatalf("saving depth changed existing script rule: %+v %v", storedScript, err)
	}
	if other, err := loadSalesPrompt(t.Context(), cfg, "other", "final-video-depth"); err != nil || other.Prompt != depth.DefaultPrompt {
		t.Fatal("depth configuration leaked across workspaces")
	}
	if rec := requestPrompt(mux, "PUT", "/api/sales/prompts/final-video-depth", promptUpdateJSON(nil, storedDepth.Version), "local"); rec.Code != 200 {
		t.Fatal(rec.Code, rec.Body.String())
	}
	storedScript, err = loadSalesPrompt(t.Context(), cfg, "local", "final-video")
	if err != nil || storedScript.Prompt != script.Prompt {
		t.Fatal("clearing depth removed existing script content", err)
	}
}

func TestStoryboardCopyStartersDescribeReferenceAndActionBoundaries(t *testing.T) {
	for name, text := range map[string]string{"plan-adapt": planAdaptPrompt, "spoken-copy": spokenCopyPrompt} {
		for _, field := range []string{"sourceVoiceText", "sourceLinePattern", "sourceSubtitle"} {
			if !strings.Contains(text, field) {
				t.Errorf("%s starter does not explain %s", name, field)
			}
		}
	}
	for _, rule := range []string{"不是当前商品事实", "不得为迁就原话更改或增补动作", "本段动作正在展示且已有依据"} {
		if !strings.Contains(planAdaptPrompt, rule) {
			t.Errorf("storyboard starter lost rule %q", rule)
		}
	}
	for _, rule := range []string{"不是当前商品事实", "不是事实依据", "以 `action` 为画面依据", "不能为了配合台词增加或修改动作"} {
		if !strings.Contains(spokenCopyPrompt, rule) {
			t.Errorf("spoken-copy starter lost rule %q", rule)
		}
	}
}

func TestBothFinalVideoPromptUpdatesRejectBrokenFactBlocksWithoutOverwriting(t *testing.T) {
	for _, id := range []string{"final-video", "final-video-depth"} {
		t.Run(id, func(t *testing.T) {
			cfg := setupSalesTestConfig(t)
			mux := promptTestMux(cfg)
			d, _ := findPromptDefinition(id)
			valid := "  用户完整规则\n{{ referenceFacts }}\n{{photographyFacts}}\n{{timelineFacts}}\n{{ audioFacts }}\n  "
			if rec := requestPrompt(mux, "PUT", "/api/sales/prompts/"+id, promptUpdateJSON(&valid, d.resolve(nil).Version), "local"); rec.Code != 200 {
				t.Fatalf("valid user rules were rejected: %d %s", rec.Code, rec.Body.String())
			}
			stored, err := loadSalesPrompt(t.Context(), cfg, "local", id)
			if err != nil || stored.Prompt != valid {
				t.Fatal("saving changed user whitespace or appended instructions", err)
			}
			for _, invalid := range []string{
				strings.ReplaceAll(valid, "{{timelineFacts}}", ""),
				valid + "\n{{unknownFacts}}",
				strings.ReplaceAll(valid, "{{timelineFacts}}", "【仅无口播】{{timelineFacts}}"),
				strings.ReplaceAll(valid, "{{timelineFacts}}", "{{{timelineFacts}}}"),
				valid + "\n{{broken",
				valid + "\n{{}}",
			} {
				rec := requestPrompt(mux, "PUT", "/api/sales/prompts/"+id, promptUpdateJSON(&invalid, stored.Version), "local")
				var result struct {
					Code     string `json:"code"`
					PromptID string `json:"promptId"`
				}
				if rec.Code != 400 || json.Unmarshal(rec.Body.Bytes(), &result) != nil || result.Code != "sales_prompt_template" || result.PromptID != id {
					t.Fatalf("broken fact blocks were accepted: %d %s", rec.Code, rec.Body.String())
				}
				current, err := loadSalesPrompt(t.Context(), cfg, "local", id)
				if err != nil || current.Prompt != valid || current.Version != stored.Version {
					t.Fatalf("rejected update changed saved content: %+v %v", current, err)
				}
			}
		})
	}
}

func TestFinalVideoFactValidationDoesNotRestrictOtherWorkflowTemplates(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	d, _ := findPromptDefinition("summary")
	text := "自定义商品规则 {{customUserField}}"
	rec := requestPrompt(promptTestMux(cfg), "PUT", "/api/sales/prompts/summary", promptUpdateJSON(&text, d.resolve(nil).Version), "local")
	if rec.Code != 200 {
		t.Fatalf("final-video fact contract leaked into another workflow: %d %s", rec.Code, rec.Body.String())
	}
}

func TestFinalVideoStartersUseSingleStoryboardFactBlocks(t *testing.T) {
	for _, id := range []string{"final-video", "final-video-depth"} {
		t.Run(id, func(t *testing.T) {
			d, _ := findPromptDefinition(id)
			if err := validateFinalVideoPrompt(id, d.text); err != nil {
				t.Fatalf("starter cannot be saved: %v", err)
			}
			fields := []string{"【画面质感与参数】", "{{photographyFacts}}", "{{audioFacts}}", "【人物说明】", "{{personaFacts}}", "【道具说明】", "【商品说明】", "{{productFacts}}", "【场景说明】", "{{sceneFacts}}"}
			if id == "final-video-depth" {
				fields = append(fields, "【深度视频说明】", "{{depthFacts}}")
			} else if strings.Contains(d.text, "【深度视频说明】") {
				t.Fatal("script-only starter includes a depth section")
			}
			fields = append(fields, "【画面情绪风格说明】", "【画面内容及视频动线及场景说明】", "{{timelineFacts}}")
			last := -1
			for _, field := range fields {
				token := field
				at := strings.Index(d.text, token)
				if strings.Count(d.text, token) != 1 || at <= last {
					t.Fatalf("fact block must appear once in photography / assets / audio / storyboard order: %s", field)
				}
				last = at
			}
			if !strings.HasSuffix(strings.TrimSpace(d.text), "{{timelineFacts}}") {
				t.Fatal("the actual storyboard must finish the generation prompt")
			}
			for _, inactive := range []string{"日常 Vlog", "本片要求生成口播时", "仅手部出镜时", "尚未绑定"} {
				if strings.Contains(d.text, inactive) {
					t.Fatalf("starter includes an inactive conditional: %s", inactive)
				}
			}
		})
	}
}

func TestFinalVideoStartersSeparateDepthMotionFromTextAndImageSources(t *testing.T) {
	if strings.Contains(finalVideoTemplate, "源片时间") || !strings.Contains(finalVideoTemplate, "按分镜文字执行") {
		t.Fatal("script-only motion must use the written storyboard")
	}
	for _, rule := range []string{"源片时间匹配前景动作", "速度、停顿和接触", "不循环或变速", "表情与镜头按分镜文字"} {
		if !strings.Contains(finalVideoDepthTemplate, rule) {
			t.Errorf("depth starter lost motion rule: %s", rule)
		}
	}
}

func TestSpokenStartersPreserveVoiceSources(t *testing.T) {
	for _, text := range []string{spokenCopyPrompt, planAdaptPrompt} {
		if !strings.Contains(text, "无出镜人物时画外发声") || !strings.Contains(text, "后期旁白") {
			t.Error("spoken-copy or plan adaptation conflicts with current voice-mode semantics")
		}
	}
}

func TestStoryboardStartersShareSceneLightingAuthorityAndRetainedEnding(t *testing.T) {
	for _, text := range []string{finalVideoTemplate, finalVideoDepthTemplate, planAdaptPrompt} {
		for _, rule := range []string{"当前场景布局与光源优先", "成像质感和既有镜头关系"} {
			if !strings.Contains(text, rule) {
				t.Errorf("starter conflicts with scene photography authority: %s", rule)
			}
		}
		if strings.Contains(text, "参考 `visualSpec` 中有证据的摄影特征 > 当前资产") || strings.Contains(text, "保留参考的光线方向") {
			t.Error("starter still overwrites current scene lighting with source lighting")
		}
	}
	for _, text := range []string{finalVideoTemplate, finalVideoDepthTemplate} {
		for _, rule := range []string{"仅呈现有依据的可见部件", "保持末姿势和自然回落"} {
			if !strings.Contains(text, rule) {
				t.Errorf("starter lost material verification or retained-ending boundary: %s", rule)
			}
		}
	}
	for _, rule := range []string{"不把内搭当成内胆", "不把提示词中的展示要求当作已经实测的结果", "动作源片时间用于定位画面，不是逐句口播时间"} {
		if !strings.Contains(spokenCopyPrompt, rule) {
			t.Errorf("spoken-copy starter lost evidence or timing boundary: %s", rule)
		}
	}
}
