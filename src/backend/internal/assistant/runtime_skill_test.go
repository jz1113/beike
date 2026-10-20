package assistant

import (
	"strings"
	"testing"
)

func TestReadSkillDoesNotExpandPinnedTools(t *testing.T) {
	box := &toolBox{
		allowed:       []string{"query_asset_library", "read_skill"},
		pinnedCeiling: true,
		skills: []skillPackage{{
			ID: "other", Name: "其他", Prompt: "做生图", Tools: []string{"trigger_generate"},
		}},
	}
	raw := box.readSkill(map[string]any{"skill_id": "other"})
	if !strings.Contains(raw, "做生图") || containsTool(box.allowed, "trigger_generate") {
		t.Fatalf("pinned %s %#v", raw, box.allowed)
	}
}

func TestReadSkillNarrowsUnpinnedToolsAndListsResources(t *testing.T) {
	box := &toolBox{
		allowed: []string{"query_asset_library", "trigger_generate", "read_skill", "update_plan", "read_skill_file", "read_tool_result"},
		skills: []skillPackage{{
			ID: "copy", Name: "文案", Prompt: "写文案", Tools: []string{"query_asset_library"},
			Resources: []skillResource{{Path: "ex.md", Content: "资料正文"}},
		}},
	}
	var applied []string
	box.applyTools = func(names []string) { applied = append([]string{}, names...) }
	raw := box.readSkill(map[string]any{"skill_id": "copy"})
	if !strings.Contains(raw, "写文案") || !strings.Contains(raw, "ex.md") || strings.Contains(raw, "资料正文") {
		t.Fatalf("body %s", raw)
	}
	if !containsTool(applied, "query_asset_library") || !containsTool(applied, "read_skill") || containsTool(applied, "trigger_generate") {
		t.Fatalf("narrow %#v", applied)
	}
	file := box.readSkillFile(map[string]any{"path": "ex.md"})
	if !strings.Contains(file, "资料正文") {
		t.Fatalf("file %s", file)
	}
}

func TestSkillCatalogDropsBodiesPastThePayloadCap(t *testing.T) {
	big := strings.Repeat("长", 40_000)
	raw := []byte(`[{"id":"a","name":"甲","description":"用途","prompt":"指令","resources":[{"path":"a.md","content":"` + big + `"}]},{"id":"b","name":"乙","description":"用途","prompt":"指令","resources":[{"path":"b.md","content":"` + big + `"}]},{"id":"c","name":"丙","description":"用途","prompt":"指令","resources":[{"path":"c.md","content":"` + big + `"}]},{"id":"d","name":"丁","description":"后续","prompt":"指令","resources":[{"path":"d.md","content":"` + big + `"}]}]`)
	catalog := parseSkillCatalog(raw)
	if len(catalog) != 4 || catalog[0].Prompt == "" || catalog[3].Prompt != "" || catalog[3].Description != "后续" {
		t.Fatalf("catalog %#v", []string{catalog[0].ID, catalog[0].Prompt, catalog[3].ID, catalog[3].Prompt, catalog[3].Description})
	}
	note := skillCatalogNote(catalog, "a")
	if strings.Contains(note, big) || strings.Contains(note, "指令") || !strings.Contains(note, "正文未携带") || !strings.Contains(note, "本轮已展开的技能 id：a") {
		t.Fatalf("note %s", note)
	}
}

func TestChildToolsOmitSkillReadsAndWrites(t *testing.T) {
	names := []string{"read_skill", "read_skill_file", "query_asset_library", "spawn_subagent", "mcp_demo__read", "mcp_demo__write", "load_mcp_tool", "search_mcp_tools"}
	mcp := map[string]mcpBinding{
		"mcp_demo__read":  {readOnly: true},
		"mcp_demo__write": {destructive: true},
	}
	got := filterChildTools(names, mcp)
	joined := strings.Join(got, ",")
	if joined != "query_asset_library,mcp_demo__read" {
		t.Fatalf("child %s", joined)
	}
}
