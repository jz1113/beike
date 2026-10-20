package assistant

import (
	_ "embed"
	"encoding/json"
)

type assistantTool struct {
	Name        string
	Description string
	Approval    string
	Parameters  map[string]any
}

//go:embed assistantTools.json
var assistantToolsJSON []byte

func assistantTools() []assistantTool {
	var raw []struct {
		Function struct {
			Name        string         `json:"name"`
			Description string         `json:"description"`
			Parameters  map[string]any `json:"parameters"`
		} `json:"function"`
	}
	if err := json.Unmarshal(assistantToolsJSON, &raw); err != nil {
		panic(err)
	}
	approval := map[string]string{
		"deconstruct_image": "per_turn", "workspace_navigate": "per_turn",
		"workspace_load_workshop_product": "per_turn", "trigger_generate": "per_turn", "set_workshop_arch": "per_turn",
		"trigger_generate_batch": "per_turn",
	}
	tools := make([]assistantTool, 0, len(raw))
	for _, item := range raw {
		tools = append(tools, assistantTool{
			Name: item.Function.Name, Description: item.Function.Description,
			Approval: approval[item.Function.Name], Parameters: item.Function.Parameters,
		})
	}
	return tools
}

func toolByName(name string) (assistantTool, bool) {
	for _, tool := range assistantTools() {
		if tool.Name == name {
			if tool.Approval == "" {
				tool.Approval = "none"
			}
			return tool, true
		}
	}
	return assistantTool{}, false
}

func toolDisplayName(name string) string {
	switch name {
	case "update_plan":
		return "更新执行计划"
	case "read_skill":
		return "读取技能"
	case "read_skill_file":
		return "读取技能资料"
	case "search_mcp_tools":
		return "检索外部工具"
	case "load_mcp_tool":
		return "加载外部工具"
	case "read_tool_result":
		return "读取工具结果"
	case "execute_code":
		return "运行代码"
	case "parse_product_or_social_url":
		return "解析商品/社媒链接"
	case "read_attached_document":
		return "阅读附件文档"
	case "list_user_products":
		return "查询商品库"
	case "query_asset_library":
		return "搜索资产库"
	case "get_prompt_asset_detail":
		return "读取提示词资产详情"
	case "deconstruct_image":
		return "反推图片提示词"
	case "get_workshop_state":
		return "读取工作台状态"
	case "get_view_capabilities":
		return "读取视图能力"
	case "workspace_navigate":
		return "调度工作台视图"
	case "workspace_load_workshop_product":
		return "载入种草工坊"
	case "trigger_generate":
		return "准备生图"
	case "trigger_generate_batch":
		return "请求批量生成"
	case "set_workshop_arch":
		return "切换拍摄架构"
	case "inspect_video_media":
		return "探查视频物理规格"
	case "extract_video_storyboard":
		return "提取全片故事板九宫格"
	case "extract_video_detailed_frames":
		return "提取关键镜头特写画面"
	case "spawn_subagent":
		return "启动子任务"
	default:
		if label, ok := mcpDisplayLabel(name); ok {
			return label
		}
		return name
	}
}

func openAITools(allowed []string) []map[string]any {
	out := []map[string]any{}
	for _, tool := range assistantTools() {
		if len(allowed) > 0 && !containsTool(allowed, tool.Name) {
			continue
		}
		out = append(out, map[string]any{"type": "function", "function": map[string]any{
			"name": tool.Name, "description": tool.Description, "parameters": tool.Parameters,
		}})
	}
	return out
}

func ensureTool(loop *agentLoop, name string) {
	if loop == nil || containsTool(loop.names, name) {
		return
	}
	tool, ok := toolByName(name)
	if !ok {
		return
	}
	loop.tools = append(loop.tools, map[string]any{"type": "function", "function": map[string]any{
		"name": tool.Name, "description": tool.Description, "parameters": tool.Parameters,
	}})
	loop.names = append(loop.names, name)
	if loop.box != nil {
		loop.box.allowed = append(loop.box.allowed, name)
	}
}

func containsTool(allowed []string, name string) bool {
	for _, item := range allowed {
		if item == name {
			return true
		}
	}
	return false
}

func needsToolApproval(name string, granted map[string]bool) bool {
	def, known := toolByName(name)
	if !known {
		return true
	}
	if def.Approval == "none" {
		return false
	}
	if def.Approval == "per_session" && granted[name] {
		return false
	}
	return true
}
