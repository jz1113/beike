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
	retired := []string{"script-normalize", "persona-face", "persona-side", "persona-front", "scene-left", "scene-right", "scene-reverse"}
	for _, id := range retired {
		if _, err := db.Exec(`INSERT INTO "SalesPromptOverride" ("workspaceId","promptId","prompt","updatedAt") VALUES (?,?,?,?)`, "local", id, "旧的单图规则：不要拼图", "old"); err != nil {
			t.Fatal(err)
		}
	}
	items := parsePromptList(t, requestPrompt(promptTestMux(cfg), "GET", "/api/sales/prompts", "", "local"))
	want := []string{"summary", "script-analysis", "plan-adapt", "spoken-copy", "spoken-review", "persona-grid", "scene-grid", "final-video", "final-video-depth"}
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
		custom := item.DefaultPrompt + "\n保留用户补充的当前规则。"
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
		{"persona-grid", "1 行 × 4 列", []string{"正面全身", "侧面全身", "背面全身", "脸部特写"}},
		{"scene-grid", "4:3", []string{"左侧视角", "右侧视角", "反向视角", "正面广角", "左侧广角", "右侧广角", "反向左侧", "反向右侧", "局部细节"}},
	} {
		d, found := findPromptDefinition(item.id)
		if !found {
			t.Fatal("grid prompt missing", item.id)
		}
		rules := []string{"一次只生成 1 张", item.ratio}
		if item.id == "scene-grid" {
			rules = append(rules, "3 行 × 3 列", "九格等宽等高", "格间间隙", "三分之一和三分之二", "只输出这一张九宫格")
		} else {
			rules = append(rules, "四格等宽", "四分之三", "人物不跨格")
		}
		for _, rule := range rules {
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
	for _, rule := range []string{"以参考图锁定同一张脸", "妆容依照参考图与年龄", "自然神态", "自然融合", "光影自然匹配", "自然肤质和纹理", "标准清晰"} {
		if !strings.Contains(d.text, rule) {
			t.Errorf("persona grid lost original-appearance rule %q", rule)
		}
	}
}
