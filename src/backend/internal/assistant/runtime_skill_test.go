package assistant

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
	"unicode/utf8"
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

func TestBuiltinRuntimeToolsPreserveUpstreamDeclarations(t *testing.T) {
	original := []string{"upstream_image_tool"}
	mapped := []string{"query_asset_library", "inspect_video_media"}
	if !reflect.DeepEqual(builtinRuntimeTools(original, mapped), mapped) || original[0] != "upstream_image_tool" {
		t.Fatal("host mapping replaced or leaked original tools")
	}
	if !reflect.DeepEqual(builtinRuntimeTools(original, nil), original) {
		t.Fatal("unmapped packages lost their declared tools")
	}
	if len(builtinRuntimeTools(original, []string{})) != 0 {
		t.Fatal("an explicit empty mapping must not fall back to upstream tools")
	}
}

func TestBuiltinSkillsLazyReadAllVerifiedPackages(t *testing.T) {
	all := builtinSkillSnapshots()
	var declared []struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(builtinSkillPackagesJSON, &declared); err != nil || len(declared) == 0 {
		t.Fatalf("invalid verified package manifest: %v", err)
	}
	if len(all) != len(declared) {
		t.Fatalf("expected %d verified packages, got %d", len(declared), len(all))
	}
	for _, entry := range declared {
		if _, ok := all[entry.ID]; !ok {
			t.Fatalf("missing verified package %s", entry.ID)
		}
	}
	for id, skill := range all {
		t.Run(id, func(t *testing.T) {
			raw, _ := json.Marshal([]map[string]any{{"id": id, "name": skill.Name, "builtinRevision": skill.BuiltinRevision}})
			catalog := parseSkillCatalog(raw)
			if len(catalog) != 1 || catalog[0].Prompt != "" || !catalogHasResources(catalog) {
				t.Fatal("discovery must stay small and expose file reading")
			}
			box := &toolBox{skills: catalog}
			var result map[string]any
			if json.Unmarshal([]byte(box.readSkill(map[string]any{"skill_id": id})), &result) != nil || result["success"] != true {
				t.Fatalf("lazy read failed: %+v", result)
			}
			if len(skill.Resources) > 24 {
				t.Fatal("resource count exceeds existing cap")
			}
			for _, file := range skill.Resources {
				if utf8.RuneCountInString(file.Content) > 40000 {
					t.Fatalf("resource too large: %s", file.Path)
				}
				result = nil
				_ = json.Unmarshal([]byte(box.readSkillFile(map[string]any{"skill_id": id, "path": file.Path, "offset": 0, "length": 12000})), &result)
				if result["success"] != true || result["content"] == "" {
					t.Fatalf("missing resource %s: %+v", file.Path, result)
				}
			}
		})
	}
}

func TestBuiltinSkillReferenceCannotReplaceCustomOrPinnedSnapshot(t *testing.T) {
	box := &toolBox{skills: parseSkillCatalog(json.RawMessage(`[{"id":"scenario-veo","name":"我的副本","prompt":"自定义正文"}]`))}
	if !strings.Contains(box.readSkill(map[string]any{"skill_id": "scenario-veo"}), "自定义正文") {
		t.Fatal("custom content was overwritten")
	}
	box = &toolBox{skills: parseSkillCatalog(json.RawMessage(`[{"id":"scenario-veo","builtinRevision":"unknown-version"}]`))}
	if !strings.Contains(box.readSkill(map[string]any{"skill_id": "scenario-veo"}), "固定版本与服务器不一致") {
		t.Fatal("wrong revision accepted")
	}
	box = &toolBox{pinnedSkillID: "scenario-veo", skillFiles: []skillResource{{Path: "SKILL.md", Content: "历史快照"}}, skills: box.skills}
	if strings.Contains(box.readSkill(map[string]any{"skill_id": "scenario-veo"}), "固定版本与服务器不一致") {
		t.Fatal("pinned snapshot replaced by current catalog")
	}
	if !strings.Contains(box.readSkillFile(map[string]any{"skill_id": "scenario-veo", "path": "SKILL.md"}), "历史快照") {
		t.Fatal("history lost")
	}
}

func skillFileResponse(t *testing.T, raw string) map[string]any {
	t.Helper()
	var value map[string]any
	if err := json.Unmarshal([]byte(raw), &value); err != nil {
		t.Fatalf("invalid tool response: %s", raw)
	}
	return value
}

func TestReadSkillFileScopesIdenticalPaths(t *testing.T) {
	box := &toolBox{skills: []skillPackage{
		{ID: "a", Prompt: "甲", Resources: []skillResource{{Path: "references/timeline.md", Content: "甲的时间线"}}},
		{ID: "b", Prompt: "乙", Resources: []skillResource{{Path: "references/timeline.md", Content: "乙的时间线"}}},
	}}
	if got := skillFileResponse(t, box.readSkillFile(map[string]any{"skill_id": "a", "path": "references/timeline.md"})); got["success"] != false {
		t.Fatal("must read the skill before its resources", got)
	}
	box.readSkill(map[string]any{"skill_id": "a"})
	unscoped := skillFileResponse(t, box.readSkillFile(map[string]any{"path": "references/timeline.md"}))
	if unscoped["content"] != "甲的时间线" || unscoped["skillId"] != "a" {
		t.Fatal("a unique resource must report its resolved skill id", unscoped)
	}
	box.readSkill(map[string]any{"skill_id": "b"})
	if got := skillFileResponse(t, box.readSkillFile(map[string]any{"path": "references/timeline.md"})); got["success"] != false {
		t.Fatal("must not silently select an ambiguous resource", got)
	}
	for id, expected := range map[string]string{"a": "甲的时间线", "b": "乙的时间线"} {
		got := skillFileResponse(t, box.readSkillFile(map[string]any{"skill_id": id, "path": "references/timeline.md"}))
		if got["content"] != expected || got["skillId"] != id {
			t.Fatal(id, got)
		}
	}
}

func TestReadSkillFileKeepsPinnedMessageSnapshot(t *testing.T) {
	box := &toolBox{
		pinnedSkillID: "a",
		skillFiles:    []skillResource{{Path: "rules.md", Content: "发送时的规则"}},
		skills:        []skillPackage{{ID: "a", Prompt: "当前规则", Resources: []skillResource{{Path: "rules.md", Content: "编辑后的规则"}}}},
	}
	instructions := box.readSkill(map[string]any{"skill_id": "a"})
	if strings.Contains(instructions, "当前规则") || strings.Contains(instructions, "编辑后的规则") {
		t.Fatal("catalog must not replace pinned main instructions", instructions)
	}
	got := skillFileResponse(t, box.readSkillFile(map[string]any{"skill_id": "a", "path": "rules.md"}))
	if got["content"] != "发送时的规则" {
		t.Fatal("catalog must not overwrite pinned snapshot", got)
	}
}

func TestReadSkillFilePaginatesUnicodeWithoutLosingTail(t *testing.T) {
	body := strings.Repeat("中🙂文", 6000) + "最后一条验收规则"
	box := &toolBox{pinnedSkillID: "a", skillFiles: []skillResource{{Path: "SKILL.md", Content: body}}}
	var joined strings.Builder
	offset := 0
	for {
		got := skillFileResponse(t, box.readSkillFile(map[string]any{"skill_id": "a", "path": "SKILL.md", "offset": offset, "length": 7999}))
		if got["success"] != true {
			t.Fatal(got)
		}
		joined.WriteString(got["content"].(string))
		if got["hasMore"] == false {
			break
		}
		next := int(got["nextOffset"].(float64))
		if next <= offset {
			t.Fatal("pagination must progress", got)
		}
		offset = next
	}
	if joined.String() != body {
		t.Fatal("pagination lost or split content")
	}
	for _, args := range []map[string]any{
		{"offset": -1}, {"offset": len([]rune(body)) + 1}, {"length": 0}, {"length": 12001},
	} {
		args["path"] = "SKILL.md"
		if got := skillFileResponse(t, box.readSkillFile(args)); got["success"] != false {
			t.Fatal(args, got)
		}
	}
}
