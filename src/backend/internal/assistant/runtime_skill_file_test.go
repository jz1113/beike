package assistant

import (
	"encoding/json"
	"strings"
	"testing"
)

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
