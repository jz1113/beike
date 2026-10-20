package assistant

import (
	"encoding/json"
	"strings"
)

var alwaysSkillTools = []string{"update_plan", "read_skill", "read_skill_file", "read_tool_result"}

func parseSkillCatalog(raw json.RawMessage) []skillPackage {
	if len(raw) == 0 {
		return nil
	}
	var rows []struct {
		ID          string   `json:"id"`
		Name        string   `json:"name"`
		Description string   `json:"description"`
		Prompt      string   `json:"prompt"`
		Tools       []string `json:"tools"`
		Resources   []struct {
			Path    string `json:"path"`
			Content string `json:"content"`
		} `json:"resources"`
	}
	if json.Unmarshal(raw, &rows) != nil {
		return nil
	}
	if len(rows) > 16 {
		rows = rows[:16]
	}
	used := 0
	seen := map[string]bool{}
	out := []skillPackage{}
	for _, row := range rows {
		id := strings.TrimSpace(row.ID)
		if id == "" || seen[id] || len([]rune(id)) > 128 {
			continue
		}
		seen[id] = true
		name := trimRunes(strings.TrimSpace(row.Name), 200)
		if name == "" {
			name = id
		}
		item := skillPackage{ID: id, Name: name, Description: trimRunes(strings.TrimSpace(row.Description), 400)}
		prompt := trimRunes(strings.TrimSpace(row.Prompt), 12_000)
		resources := []skillResource{}
		for _, file := range row.Resources {
			if len(resources) >= 24 {
				break
			}
			path := strings.TrimSpace(file.Path)
			if path == "" || len([]rune(path)) > 240 {
				continue
			}
			resources = append(resources, skillResource{Path: path, Content: trimRunes(file.Content, 40_000)})
		}
		tools := []string{}
		for _, tool := range row.Tools {
			tool = strings.TrimSpace(tool)
			if tool == "" || len(tool) > 128 || len(tools) >= 50 {
				continue
			}
			tools = append(tools, tool)
		}
		cost := len([]rune(prompt))
		for _, file := range resources {
			cost += len([]rune(file.Content))
		}
		if prompt != "" && used+cost <= 120_000 {
			item.Prompt = prompt
			item.Resources = resources
			item.Tools = tools
			used += cost
		}
		out = append(out, item)
	}
	return out
}

func skillCatalogNote(skills []skillPackage, pinned string) string {
	if len(skills) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString("【可用技能】\n")
	b.WriteString("这里只列出名称和用途。用户点名技能，或任务与用途明显匹配时，主代理必须先调用 read_skill 读完正文，再按返回的路径用 read_skill_file 读取必要资料，然后才执行任务。不要一次读取无关技能，也不要把技能阅读交给子任务。本轮已经展开的点选技能视为已读。若技能没有正文，直接说明并改用最接近的做法。\n")
	if strings.TrimSpace(pinned) != "" {
		b.WriteString("本轮已展开的技能 id：" + strings.TrimSpace(pinned) + "。\n")
	}
	for _, skill := range skills {
		line := "- " + skill.ID + " · " + skill.Name
		if skill.Description != "" {
			line += "：" + skill.Description
		}
		if skill.Prompt == "" {
			line += "（正文未携带）"
		}
		b.WriteString(line + "\n")
	}
	return strings.TrimRight(b.String(), "\n")
}

func insertSkillCatalog(messages []map[string]any, note string) []map[string]any {
	if note == "" {
		return messages
	}
	noteMsg := map[string]any{"role": "system", "content": note}
	if len(messages) > 0 && messages[0]["role"] == "system" {
		out := make([]map[string]any, 0, len(messages)+1)
		out = append(out, messages[0], noteMsg)
		return append(out, messages[1:]...)
	}
	return append([]map[string]any{noteMsg}, messages...)
}

func catalogHasResources(skills []skillPackage) bool {
	for _, skill := range skills {
		if len(skill.Resources) > 0 {
			return true
		}
	}
	return false
}

func (box *toolBox) readSkill(args map[string]any) string {
	id := textArg(args, "skill_id")
	if id == "" {
		id = textArg(args, "id")
	}
	var found *skillPackage
	for i := range box.skills {
		if box.skills[i].ID == id {
			found = &box.skills[i]
			break
		}
	}
	if found == nil {
		ids := []string{}
		for _, skill := range box.skills {
			if len(ids) >= 8 {
				break
			}
			ids = append(ids, skill.ID)
		}
		hint := "技能目录里没有这个 id。"
		if len(ids) > 0 {
			hint += "可用 id：" + strings.Join(ids, "、") + "。"
		}
		return toolJSON(false, hint+"请改用目录中的 id，或直接说明并继续。")
	}
	if found.Prompt == "" {
		return toolJSON(false, "「"+found.Name+"」本轮只携带了名称和用途，正文未随目录发送。请直接说明并改用最接近的做法。")
	}
	box.mergeSkillFiles(found.Resources)
	if !box.pinnedCeiling && len(found.Tools) > 0 {
		box.noteSkillTools(found.Tools)
	}
	paths := make([]string, 0, len(found.Resources))
	for _, file := range found.Resources {
		paths = append(paths, file.Path)
	}
	body, _ := json.Marshal(map[string]any{
		"success": true, "skillId": found.ID, "name": found.Name,
		"message":      "已读取技能 " + found.Name,
		"instructions": found.Prompt, "resources": paths,
		"note": "附属文件未展开。需要细则时调用 read_skill_file，path 必须与 resources 一致。",
	})
	return string(body)
}

func (box *toolBox) mergeSkillFiles(files []skillResource) {
	for _, file := range files {
		replaced := false
		for i := range box.skillFiles {
			if box.skillFiles[i].Path != file.Path {
				continue
			}
			box.skillFiles[i] = file
			replaced = true
			break
		}
		if !replaced {
			box.skillFiles = append(box.skillFiles, file)
		}
	}
}

func (box *toolBox) noteSkillTools(extra []string) {
	if box.pinnedCeiling {
		return
	}
	for _, name := range extra {
		name = strings.TrimSpace(name)
		if name != "" && !containsTool(box.skillTools, name) {
			box.skillTools = append(box.skillTools, name)
		}
	}
	if len(box.skillTools) == 0 {
		return
	}
	next := append([]string{}, alwaysSkillTools...)
	if box.mcpEnabled {
		next = append(next, "search_mcp_tools", "load_mcp_tool")
	}
	for _, name := range box.exposedMCP {
		if !containsTool(next, name) {
			next = append(next, name)
		}
	}
	for _, name := range box.skillTools {
		if !containsTool(next, name) {
			next = append(next, name)
		}
	}
	if len(box.ceiling) > 0 {
		filtered := []string{}
		for _, name := range next {
			if containsTool(box.ceiling, name) || containsTool(alwaysSkillTools, name) || name == "search_mcp_tools" || name == "load_mcp_tool" || strings.HasPrefix(name, "mcp_") {
				filtered = append(filtered, name)
			}
		}
		next = filtered
	}
	box.allowed = next
	if box.applyTools != nil {
		box.applyTools(next)
	}
}
