package assistant

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
)

type toolBox struct {
	ctx               context.Context
	db                *sql.DB
	cfg               config.Config
	workspace         string
	documents         []attachedDoc
	client            map[string]any
	plan              *taskPlan
	results           *resultStore
	budget            *execBudget
	allowed           []string
	ceiling           []string
	pinnedCeiling     bool
	skillTools        []string
	exposedMCP        []string
	mcpEnabled        bool
	mcp               map[string]mcpBinding
	skills            []skillPackage
	skillFiles        []skillResource
	pinnedSkillID     string
	skillFilePackages map[string][]skillResource
	visual            *visualBudget
	spawn             func(skillID, prompt string) string
	applyTools        func(allowed []string)
	activateMCP       func(name string) string
}

type skillResource struct {
	Path    string
	Content string
}

type skillPackage struct {
	ID          string
	Name        string
	Description string
	Prompt      string
	Tools       []string
	Resources   []skillResource
}

func skillResources(raw json.RawMessage) []skillResource {
	if len(raw) == 0 {
		return nil
	}
	var rows []struct {
		Path    string `json:"path"`
		Content string `json:"content"`
	}
	if json.Unmarshal(raw, &rows) != nil {
		return nil
	}
	if len(rows) > 24 {
		rows = rows[:24]
	}
	out := make([]skillResource, 0, len(rows))
	for _, row := range rows {
		path := strings.TrimSpace(row.Path)
		if path == "" || len([]rune(path)) > 240 {
			continue
		}
		out = append(out, skillResource{Path: path, Content: trimRunes(row.Content, 40_000)})
	}
	return out
}

type attachedDoc struct {
	Name string
	Text string
}

func (box *toolBox) run(name string, args map[string]any) string {
	if box.ctx.Err() != nil || (len(box.allowed) > 0 && !containsTool(box.allowed, name)) {
		return toolJSON(false, "工具未授权或任务已停止")
	}
	switch name {
	case "update_plan":
		return box.plan.update(args)
	case "read_skill":
		return box.readSkill(args)
	case "read_skill_file":
		return box.readSkillFile(args)
	case "search_mcp_tools":
		return box.searchMCP(args)
	case "load_mcp_tool":
		return box.loadMCP(args)
	case "read_tool_result":
		return box.results.read(textArg(args, "result_id"), intArg(args, "offset"), intArgDefault(args, "length", 4000))
	case "execute_code":
		return box.runCode(textArg(args, "code"))
	case "read_attached_document":
		return readDocument(args, box.documents)
	case "list_user_products":
		return listProducts(box.ctx, box.db, box.workspace, args)
	case "query_asset_library":
		return queryAssets(box.ctx, box.db, box.workspace, args)
	case "get_prompt_asset_detail":
		return assetDetail(box.ctx, box.db, box.workspace, argText(args, "asset_id", "id"))
	case "parse_product_or_social_url":
		return parseProductTool(box.ctx, box.db, box.cfg, box.workspace, textArg(args, "url"))
	case "get_workshop_state":
		return workshopState(box.client)
	case "get_view_capabilities":
		return viewCapabilities(textArg(args, "view"), box.client)
	case "workspace_navigate":
		return navigateTool(textArg(args, "target_view"), textArg(args, "reason"))
	case "workspace_load_workshop_product":
		return loadWorkshopProduct(box.ctx, box.db, box.workspace, textArg(args, "itemId"))
	case "trigger_generate_batch":
		return box.generateBatch(args)
	case "trigger_generate":
		body, _ := json.Marshal(map[string]any{"success": true, "action": "trigger_generate", "prompt": args["prompt"], "requiresUserGenerate": true, "message": "已请求将提示词和参考图载入首页生图输入，等待用户确认生成"})
		return string(body)
	case "set_workshop_arch":
		arch := argText(args, "arch_id", "archId")
		body, _ := json.Marshal(map[string]any{"success": true, "action": "set_workshop_arch", "archId": arch, "message": "已请求切换拍摄架构"})
		return string(body)
	case "spawn_subagent":
		if box.spawn == nil {
			return toolJSON(false, "子任务请在当前回合直接完成，不要再拆分子智能体")
		}
		return box.spawn(argText(args, "skill_id"), argText(args, "prompt"))
	case "deconstruct_image":
		return box.deconstructImage(args)
	case "inspect_video_media":
		return box.inspectVideo(args)
	case "extract_video_storyboard":
		return box.extractStoryboard(args)
	case "extract_video_detailed_frames":
		return box.extractDetailedFrames(args)
	default:
		if strings.HasPrefix(name, "mcp_") {
			return box.callMCP(name, args)
		}
		return toolJSON(false, "未知工具: "+name)
	}
}

func (box *toolBox) runCode(code string) string {
	input := map[string]any{"documents": box.documents, "workspace": box.client}
	tools := map[string]func(map[string]any) string{}
	for _, name := range []string{"list_user_products", "query_asset_library", "get_prompt_asset_detail", "read_attached_document", "get_workshop_state"} {
		toolName := name
		tools[toolName] = func(args map[string]any) string { return box.run(toolName, args) }
	}
	output, err := runSandbox(code, input, 120*time.Second, tools)
	if err != nil {
		return toolJSON(false, err.Error())
	}
	body, _ := json.Marshal(map[string]any{"success": true, "sandbox": "goja", "output": output})
	return string(body)
}

func readDocument(args map[string]any, documents []attachedDoc) string {
	if len(documents) == 0 {
		return toolJSON(false, "当前会话近期没有可读取的文档附件")
	}
	nameQ := strings.ToLower(textArg(args, "document_name"))
	var doc *attachedDoc
	if nameQ == "" {
		doc = &documents[0]
	} else {
		for i := range documents {
			if strings.Contains(strings.ToLower(documents[i].Name), nameQ) {
				doc = &documents[i]
				break
			}
		}
	}
	if doc == nil {
		return toolJSON(false, "未找到指定文档，请核对文件名")
	}
	full := doc.Text
	if full == "" {
		body, _ := json.Marshal(map[string]any{"success": false, "error": "文档无文本内容", "name": doc.Name})
		return string(body)
	}
	maxLen := intArgDefault(args, "length", 4000)
	if maxLen < 500 {
		maxLen = 500
	}
	if maxLen > 8000 {
		maxLen = 8000
	}
	query := strings.TrimSpace(textArg(args, "query"))
	if query != "" {
		idx := strings.Index(strings.ToLower(full), strings.ToLower(query))
		if idx < 0 {
			body, _ := json.Marshal(map[string]any{"success": true, "name": doc.Name, "found": false, "message": "未找到关键词「" + query + "」", "totalChars": len(full)})
			return string(body)
		}
		start := idx - 200
		if start < 0 {
			start = 0
		}
		end := idx + len(query) + maxLen
		if end > len(full) {
			end = len(full)
		}
		body, _ := json.Marshal(map[string]any{"success": true, "name": doc.Name, "found": true, "query": query, "offset": start, "totalChars": len(full), "excerpt": full[start:end]})
		return string(body)
	}
	offset := intArg(args, "offset")
	if offset < 0 {
		offset = 0
	}
	if offset > len(full) {
		offset = len(full)
	}
	end := offset + maxLen
	if end > len(full) {
		end = len(full)
	}
	body, _ := json.Marshal(map[string]any{"success": true, "name": doc.Name, "found": true, "offset": offset, "totalChars": len(full), "truncated": end < len(full), "excerpt": full[offset:end]})
	return string(body)
}

func workshopState(client map[string]any) string {
	body, _ := json.Marshal(map[string]any{"success": true, "workshopState": map[string]any{
		"currentView": clientText(client, "currentView", "home"), "workshopStep": client["workshopStep"],
		"productTitle": client["productTitle"], "productItemId": client["productItemId"],
		"selectedArchId": client["selectedArchId"], "workshopMode": client["workshopMode"],
		"assetLibraryTab": client["assetLibraryTab"], "assetLibraryKeyword": client["assetLibraryKeyword"],
		"generationBatches": client["generationBatches"],
	}})
	return string(body)
}

func viewCapabilities(view string, client map[string]any) string {
	if view == "" {
		view = clientText(client, "currentView", "home")
	}
	actions := map[string][]string{
		"home": {"prepare_image_draft", "navigate"}, "workshop": {"load_product", "set_arch", "navigate"},
		"generate": {"prepare_image_draft_on_home", "navigate"}, "assets": {"search_assets", "get_asset_detail", "deconstruct_image", "navigate"},
		"collect": {"parse_url"}, "canvas": {"planning_from_workspace_summary"}, "replicate": {"planning_from_workspace_summary"}, "settings": {},
	}
	tools := map[string][]string{
		"home":     {"trigger_generate", "workspace_navigate", "parse_product_or_social_url"},
		"workshop": {"workspace_load_workshop_product", "set_workshop_arch", "trigger_generate", "list_user_products", "workspace_navigate", "deconstruct_image", "query_asset_library", "spawn_subagent"},
		"generate": {"trigger_generate", "workspace_navigate"},
		"assets":   {"query_asset_library", "get_prompt_asset_detail", "deconstruct_image", "workspace_navigate"},
		"collect":  {"parse_product_or_social_url"},
	}
	if batches, err := generationBatches(client); err == nil && len(batches) > 0 {
		actions[view] = append(actions[view], "request_generate_batch")
		tools[view] = append(tools[view], "trigger_generate_batch")
	}
	body, _ := json.Marshal(map[string]any{
		"success": true, "view": view, "actions": actions[view], "availableTools": tools[view],
		"note": "可用工具以本轮函数列表和权限为准；查询资料无需切换视图。trigger_generate 仅载入首页草稿；trigger_generate_batch 仅在用户明确要求生成时请求提交本轮客户端清单，客户端校验后执行，不表示提交或生成成功。写提示词不构成生成授权；模型设置由用户在界面操作。",
	})
	return string(body)
}

func navigateTool(target, reason string) string {
	label := map[string]string{"workshop": "电商图文", "generate": "极速生图", "assets": "资产中心"}[target]
	if label == "" {
		label = "灵感首页"
	}
	body, _ := json.Marshal(map[string]any{"success": true, "action": "navigate", "target_view": target, "reason": reason, "message": "已请求将工作台切换至「" + label + "」"})
	return string(body)
}

func toolJSON(success bool, message string) string {
	return toolOutcome(success, "", message)
}

func toolOutcome(success bool, outcome, message string) string {
	payload := map[string]any{"success": success}
	key := "message"
	if !success {
		key = "error"
	}
	payload[key] = message
	if outcome != "" {
		payload["outcome"] = outcome
	}
	body, _ := json.Marshal(payload)
	return string(body)
}

func textArg(args map[string]any, key string) string {
	text, _ := args[key].(string)
	return strings.TrimSpace(text)
}

func intArg(args map[string]any, key string) int {
	return intArgDefault(args, key, 0)
}

func intArgDefault(args map[string]any, key string, fallback int) int {
	switch typed := args[key].(type) {
	case float64:
		return int(typed)
	case int:
		return typed
	default:
		return fallback
	}
}

func clientText(client map[string]any, key, fallback string) string {
	text, _ := client[key].(string)
	if strings.TrimSpace(text) == "" {
		return fallback
	}
	return text
}

func summarizeToolResult(raw string) string {
	var parsed map[string]any
	if json.Unmarshal([]byte(raw), &parsed) == nil {
		if message, _ := parsed["message"].(string); message != "" {
			return clipText(message, 240)
		}
		if text, _ := parsed["text"].(string); text != "" {
			return clipText(text, 240)
		}
		if path, _ := parsed["path"].(string); path != "" {
			return clipText("已读取 "+path, 240)
		}
		if errText, _ := parsed["error"].(string); errText != "" {
			return clipText(errText, 240)
		}
	}
	return clipText(raw, 240)
}

func clipText(value string, limit int) string {
	if len(value) <= limit {
		return value
	}
	return value[:limit]
}

func toolFailed(raw string) bool {
	return strings.Contains(raw, `"success":false`) || strings.Contains(raw, `"success": false`)
}
