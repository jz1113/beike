package assistant

import (
	_ "embed"
	"encoding/json"
	"strings"
	"sync"
)

var alwaysSkillTools = []string{"update_plan", "read_skill", "read_skill_file", "read_tool_result"}

func parseSkillCatalog(raw json.RawMessage) []skillPackage {
	if len(raw) == 0 {
		return nil
	}
	var rows []struct {
		ID              string   `json:"id"`
		BuiltinRevision string   `json:"builtinRevision"`
		Name            string   `json:"name"`
		Description     string   `json:"description"`
		Prompt          string   `json:"prompt"`
		Tools           []string `json:"tools"`
		Resources       []struct {
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
		item.BuiltinRevision = trimRunes(strings.TrimSpace(row.BuiltinRevision), 128)
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
		if skill.Prompt == "" && skill.BuiltinRevision == "" {
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
		if len(skill.Resources) > 0 || skill.BuiltinRevision != "" {
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
	if id != "" && id == box.pinnedSkillID {
		paths := make([]string, 0, len(box.skillFiles))
		for _, file := range box.skillFiles {
			paths = append(paths, file.Path)
		}
		body, _ := json.Marshal(map[string]any{
			"success": true, "skillId": id, "resources": paths,
			"instructions": "本次技能主指令已在系统提示中展开，请遵循本次消息的正文与资料快照，不使用当前目录的新版本替换。主指令若指向 SKILL.md，仍须读取该文件。",
			"note":         "用 read_skill_file 和本技能 skill_id 读取快照资料；长文件按 nextOffset 续读。",
		})
		return string(body)
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
	if found.Prompt == "" && found.BuiltinRevision != "" {
		if snapshot, ok := builtinSkillSnapshot(found.ID, found.BuiltinRevision); ok {
			*found = snapshot
		} else {
			return toolJSON(false, "该内置技能的固定版本与服务器不一致，请更新应用并重新加载；不会用其他版本替换。")
		}
	}
	if found.Prompt == "" {
		return toolJSON(false, "「"+found.Name+"」本轮只携带了名称和用途，正文未随目录发送。请直接说明并改用最接近的做法。")
	}
	box.mergeSkillFiles(found.ID, found.Resources)
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
		"note": "附属文件未展开。需要细则时调用 read_skill_file，skill_id 使用本技能 id，path 使用 resources 中的路径。长文件按 nextOffset 继续读取。",
	})
	return string(body)
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

//go:embed builtinSkillPackages.json
var builtinSkillPackagesJSON []byte

// This seed is compiled and hash-verified at build time; lookup never touches user paths or a network.
var builtinSkillSnapshots = sync.OnceValue(func() map[string]skillPackage {
	var rows []struct {
		ID                  string   `json:"id"`
		Name                string   `json:"name"`
		DisplayName         string   `json:"displayName"`
		Description         string   `json:"description"`
		Prompt              string   `json:"prompt"`
		RuntimeInstructions string   `json:"runtimeInstructions"`
		Tools               []string `json:"tools"`
		RuntimeTools        []string `json:"runtimeTools"`
		Files               []struct {
			Path    string `json:"path"`
			Content string `json:"content"`
		} `json:"files"`
		Source struct {
			Revision string `json:"revision"`
		} `json:"source"`
	}
	if json.Unmarshal(builtinSkillPackagesJSON, &rows) != nil {
		return nil
	}
	out := map[string]skillPackage{}
	for _, row := range rows {
		name := row.DisplayName
		if name == "" {
			name = row.Name
		}
		prompt := strings.TrimSpace(row.Prompt)
		item := skillPackage{ID: row.ID, Name: name, Description: row.Description, BuiltinRevision: row.Source.Revision, Prompt: prompt, Tools: builtinRuntimeTools(row.Tools, row.RuntimeTools)}
		if len(prompt) > 9000 {
			item.Resources = append(item.Resources, skillResource{Path: "SKILL.md", Content: prompt})
			item.Prompt = "完整主指令在 SKILL.md。执行任务前必须用 read_skill_file 读取该文件，skill_id 使用当前技能 id；如有 hasMore，按 nextOffset 继续，直到读完主指令。"
		}
		if host := strings.TrimSpace(row.RuntimeInstructions); host != "" {
			item.Prompt += "\n\n【贝壳宿主执行适配】\n" + host
		}
		for _, file := range row.Files {
			item.Resources = append(item.Resources, skillResource{Path: file.Path, Content: strings.TrimSpace(file.Content)})
		}
		out[item.ID] = item
	}
	return out
})

// Host permissions never forward an upstream platform's tool identifiers.
func builtinRuntimeTools(original, mapped []string) []string {
	if mapped != nil {
		return mapped
	}
	return original
}

func builtinSkillSnapshot(id, revision string) (skillPackage, bool) {
	item, ok := builtinSkillSnapshots()[id]
	return item, ok && revision != "" && item.BuiltinRevision == revision
}

// Catalog packages must not overwrite the resource snapshot of a pinned skill.
func (box *toolBox) mergeSkillFiles(id string, files []skillResource) {
	if id == box.pinnedSkillID {
		return
	}
	if box.skillFilePackages == nil {
		box.skillFilePackages = map[string][]skillResource{}
	}
	box.skillFilePackages[id] = files
}

func (box *toolBox) readSkillFile(args map[string]any) string {
	path := textArg(args, "path")
	id := textArg(args, "skill_id")
	if path == "" {
		return toolJSON(false, "缺少技能文件路径")
	}
	type match struct {
		skillID string
		file    skillResource
	}
	var matches []match
	if id == "" || id == box.pinnedSkillID {
		for _, file := range box.skillFiles {
			if file.Path == path {
				matches = append(matches, match{box.pinnedSkillID, file})
			}
		}
	}
	for skillID, files := range box.skillFilePackages {
		if id != "" && id != skillID {
			continue
		}
		for _, file := range files {
			if file.Path == path {
				matches = append(matches, match{skillID, file})
			}
		}
	}
	if len(matches) == 0 {
		return toolJSON(false, "当前已读取的技能资料里没有这个文件，请先 read_skill 并核对 skill_id 与 path")
	}
	if len(matches) > 1 {
		return toolJSON(false, "多个技能包含同名文件，请指定 skill_id 后读取")
	}
	runes := []rune(matches[0].file.Content)
	offset, length := intArg(args, "offset"), intArgDefault(args, "length", 8000)
	if offset < 0 || offset > len(runes) || length < 1 || length > 12000 {
		return toolJSON(false, "文件读取范围无效；offset 不得超过总字符数，length 应为 1–12000")
	}
	end := offset + length
	if end > len(runes) {
		end = len(runes)
	}
	payload := map[string]any{"success": true, "path": path, "skillId": matches[0].skillID,
		"content": string(runes[offset:end]), "offset": offset, "total": len(runes), "hasMore": end < len(runes)}
	if end < len(runes) {
		payload["nextOffset"] = end
	}
	body, _ := json.Marshal(payload)
	return string(body)
}
