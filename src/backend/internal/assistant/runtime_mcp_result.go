package assistant

import (
	"encoding/json"
	"sort"
	"strings"

	"beike.local/cloud/src/backend/internal/platform/network"
)

func (box *toolBox) searchMCP(args map[string]any) string {
	if len(box.mcp) == 0 {
		return toolJSON(false, "本轮没有连接外部工具。")
	}
	query := strings.ToLower(strings.TrimSpace(textArg(args, "query")))
	limit := intArgDefault(args, "limit", 8)
	if limit < 1 {
		limit = 1
	}
	if limit > 20 {
		limit = 20
	}
	names := make([]string, 0, len(box.mcp))
	for name := range box.mcp {
		names = append(names, name)
	}
	sort.Strings(names)
	hits := []map[string]any{}
	for _, name := range names {
		binding := box.mcp[name]
		hay := strings.ToLower(name + " " + binding.remote + " " + binding.description + " " + binding.serverLabel())
		if query != "" && !strings.Contains(hay, query) {
			continue
		}
		hits = append(hits, map[string]any{
			"name": name, "server": binding.serverLabel(), "remote": binding.remote,
			"description": binding.description, "exposed": binding.exposed,
		})
		if len(hits) >= limit {
			break
		}
	}
	body, _ := json.Marshal(map[string]any{"success": true, "tools": hits})
	return string(body)
}

func (box *toolBox) loadMCP(args map[string]any) string {
	if len(box.mcp) == 0 {
		return toolJSON(false, "本轮没有连接外部工具。")
	}
	name := textArg(args, "name")
	if name == "" {
		return toolJSON(false, "缺少工具名。请先调用 search_mcp_tools，使用返回的 name。")
	}
	if _, ok := box.mcp[name]; !ok {
		return toolJSON(false, unknownMCP(name, box))
	}
	if box.activateMCP == nil {
		return toolJSON(false, "当前回合不能加载外部工具。")
	}
	return box.activateMCP(name)
}

func unknownMCP(name string, box *toolBox) string {
	seen := map[string]bool{}
	labels := []string{}
	for _, binding := range box.mcp {
		label := binding.serverLabel()
		if seen[label] {
			continue
		}
		seen[label] = true
		labels = append(labels, label)
	}
	sort.Strings(labels)
	where := "当前没有已连接的外部服务"
	if len(labels) > 0 {
		where = "已连接服务：" + strings.Join(labels, "、")
	}
	return "未知外部工具 " + name + "。" + where + "。请调用 search_mcp_tools 检索名称；名称确认后，已直接暴露的工具可修正参数再调用，未暴露的先调用 load_mcp_tool。"
}

func (box *toolBox) callMCP(name string, args map[string]any) string {
	binding, ok := box.mcp[name]
	if !ok || binding.server == nil {
		return toolJSON(false, unknownMCP(name, box))
	}
	response, sessionID := mcpRPC(network.SafeClient(), binding.server.url, "tools/call", map[string]any{"name": binding.remote, "arguments": args}, binding.server.headers, binding.server.sessionID, false)
	if sessionID != "" {
		binding.server.sessionID = sessionID
	}
	text, images := formatMCPResponse(response)
	return box.attachVisual(text, images)
}

func (box *toolBox) attachVisual(text string, images []string) string {
	if len(images) == 0 {
		return text
	}
	accepted := []string{}
	for _, image := range images {
		if box.visual != nil && box.visual.accept(image) {
			accepted = append(accepted, image)
		}
	}
	var parsed map[string]any
	if json.Unmarshal([]byte(text), &parsed) != nil {
		return text
	}
	if len(accepted) == 0 {
		if len(images) > 0 {
			parsed["omittedImages"] = len(images)
			body, err := json.Marshal(parsed)
			if err == nil {
				return string(body)
			}
		}
		return text
	}
	parsed["_visualImages"] = accepted
	if len(accepted) < len(images) {
		parsed["omittedImages"] = len(images) - len(accepted)
	}
	body, err := json.Marshal(parsed)
	if err != nil {
		return text
	}
	return string(body)
}

func formatMCPResponse(response map[string]any) (string, []string) {
	if errObj, ok := response["error"].(map[string]any); ok {
		message, _ := errObj["message"].(string)
		if strings.TrimSpace(message) == "" {
			message = "MCP 工具返回错误"
		}
		return toolJSON(false, message), nil
	}
	result, _ := response["result"].(map[string]any)
	if result == nil {
		return toolJSON(false, "MCP 工具没有返回结果"), nil
	}
	texts, imageCount, refs := extractMCPContent(result["content"])
	text := strings.TrimSpace(strings.Join(texts, "\n"))
	if result["isError"] == true {
		if text == "" {
			text = "MCP 工具返回错误"
		}
		return toolJSON(false, trimRunes(text, 4000)), nil
	}
	if text != "" || imageCount > 0 {
		body, _ := json.Marshal(map[string]any{"success": true, "text": trimRunes(text, 12000), "imageCount": imageCount})
		return string(body), refs
	}
	body, _ := json.Marshal(map[string]any{"success": true, "result": stripMCPBlobs(result)})
	return string(body), refs
}

func extractMCPContent(raw any) ([]string, int, []string) {
	rows, ok := raw.([]any)
	if !ok {
		return nil, 0, nil
	}
	texts := []string{}
	images := 0
	refs := []string{}
	for _, row := range rows {
		block, _ := row.(map[string]any)
		if block == nil {
			continue
		}
		kind, _ := block["type"].(string)
		switch kind {
		case "text":
			text, _ := block["text"].(string)
			if strings.TrimSpace(text) != "" {
				texts = append(texts, text)
			}
		case "image":
			images++
			if ref := imageRef(block); ref != "" {
				refs = append(refs, ref)
			}
		}
	}
	return texts, images, refs
}

func imageRef(block map[string]any) string {
	data, _ := block["data"].(string)
	data = strings.TrimSpace(data)
	if strings.HasPrefix(data, "data:image/") {
		return data
	}
	if data != "" {
		mime, _ := block["mimeType"].(string)
		mime = strings.TrimSpace(mime)
		if mime == "" {
			mime = "image/png"
		}
		if strings.HasPrefix(mime, "image/") && !strings.ContainsAny(mime, " ;") {
			return "data:" + mime + ";base64," + data
		}
	}
	url, _ := block["url"].(string)
	url = strings.TrimSpace(url)
	if strings.HasPrefix(url, "data:image/") || strings.HasPrefix(url, "https://") {
		return url
	}
	return ""
}

func stripMCPBlobs(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		out := map[string]any{}
		for key, item := range typed {
			lower := strings.ToLower(key)
			if text, ok := item.(string); ok && blobText(lower, text) {
				out[key] = "[省略]"
				continue
			}
			out[key] = stripMCPBlobs(item)
		}
		return out
	case []any:
		out := make([]any, len(typed))
		for index, item := range typed {
			out[index] = stripMCPBlobs(item)
		}
		return out
	case string:
		if strings.HasPrefix(typed, "data:") || len(typed) > 8000 {
			return "[省略]"
		}
		return typed
	default:
		return value
	}
}

func blobText(key, text string) bool {
	if strings.HasPrefix(text, "data:") {
		return true
	}
	return len(text) > 256 && (key == "data" || key == "blob" || strings.Contains(key, "base64"))
}
