package assistant

import "encoding/json"

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
