package sales

import (
	"context"
	"database/sql"
	"strings"
	"testing"
)

func TestGridPromptsReplaceSingleViewPromptsAndIgnoreTheirOverrides(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	retired := []string{"persona-face", "persona-side", "persona-front", "scene-left", "scene-right", "scene-reverse"}
	for _, id := range retired {
		if _, err := db.Exec(`INSERT INTO "SalesPromptOverride" ("workspaceId","promptId","prompt","updatedAt") VALUES (?,?,?,?)`, "local", id, "旧的单图规则：不要拼图", "old"); err != nil {
			t.Fatal(err)
		}
	}
	items := parsePromptList(t, requestPrompt(promptTestMux(cfg), "GET", "/api/sales/prompts", "", "local"))
	want := []string{"summary", "script-analysis", "script-normalize", "plan-adapt", "persona-grid", "scene-grid"}
	for i, id := range want {
		if items[i].ID != id || items[i].Customized || strings.Contains(items[i].Prompt, "旧的单图规则") {
			t.Fatalf("unexpected active prompt: %+v", items[i])
		}
	}
	for _, id := range retired {
		if _, found := findPromptDefinition(id); found {
			t.Fatal("retired prompt still registered", id)
		}
		if _, err := loadSalesPrompt(context.Background(), cfg, "local", id); err == nil {
			t.Fatal("retired override still loadable", id)
		}
		if rec := requestPrompt(promptTestMux(cfg), "PUT", "/api/sales/prompts/"+id, promptUpdateJSON(nil, "old"), "local"); rec.Code != 404 {
			t.Fatal("retired prompt can still be saved", id, rec.Code)
		}
	}
	// Every current workflow keeps independent editable content, including both new grids.
	for _, item := range items {
		custom := item.Prompt + "\n保留用户补充的当前规则。"
		if rec := requestPrompt(promptTestMux(cfg), "PUT", "/api/sales/prompts/"+item.ID, promptUpdateJSON(&custom, item.Version), "local"); rec.Code != 200 {
			t.Fatal("current prompt no longer editable", item.ID, rec.Code, rec.Body.String())
		}
		loaded, err := loadSalesPrompt(context.Background(), cfg, "local", item.ID)
		if err != nil || loaded.Prompt != custom || !loaded.Customized {
			t.Fatal("current prompt was not preserved", item.ID, err)
		}
	}
}

func TestGridPromptOrderMatchesCropSlots(t *testing.T) {
	for _, item := range []struct {
		id, ratio string
		labels    []string
	}{
		{"persona-grid", "3:4", []string{"脸部", "正身", "左侧身", "左前侧", "右前侧", "背身", "右侧身", "半身", "后侧身"}},
		{"scene-grid", "4:3", []string{"左侧视角", "右侧视角", "反向视角", "正面广角", "左侧广角", "右侧广角", "反向左侧", "反向右侧", "局部细节"}},
	} {
		d, found := findPromptDefinition(item.id)
		if !found {
			t.Fatal("grid prompt missing", item.id)
		}
		for _, rule := range []string{"一次只生成 1 张", item.ratio, "3 行 × 3 列", "九格等宽等高", "格间间隙", "三分之一和三分之二", "只输出这一张九宫格"} {
			if !strings.Contains(d.text, rule) {
				t.Errorf("%s missing crop contract %q", item.id, rule)
			}
		}
		if strings.Contains(d.text, "不要拼图") {
			t.Fatal("grid prompt retained conflicting single-view rule", item.id)
		}
		previous := -1
		for _, label := range item.labels {
			next := strings.Index(d.text, "（"+label+"）")
			if next <= previous {
				t.Fatal("crop-slot order differs from prompt", item.id, label)
			}
			previous = next
		}
	}
}

func TestPersonaGridKeepsOriginalMakeupAndDoesNotInventPerformance(t *testing.T) {
	d, found := findPromptDefinition("persona-grid")
	if !found {
		t.Fatal("persona grid prompt missing")
	}
	for _, rule := range []string{"唯一的人物身份与妆容主图", "唇色和妆容浓淡", "二次磨皮", "补图即使更清晰", "不是表情包", "视频中的眼神与表情变化另由分镜指定"} {
		if !strings.Contains(d.text, rule) {
			t.Errorf("persona grid lost original-appearance rule %q", rule)
		}
	}
}
