package assistant

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"context"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"strings"
)

func parseToolArguments(name, raw string) (map[string]any, error) {
	if len(raw) > 100_000 {
		return nil, errArgs("工具参数过大")
	}
	if strings.TrimSpace(raw) == "" {
		raw = "{}"
	}
	var value any
	if json.Unmarshal([]byte(raw), &value) != nil {
		return nil, errArgs("工具参数不是有效 JSON")
	}
	args, ok := value.(map[string]any)
	if !ok {
		return nil, errArgs("工具参数必须是对象")
	}
	def, known := toolByName(name)
	if !known && !strings.HasPrefix(name, "mcp_") {
		return nil, errArgs("工具不存在")
	}
	schema := map[string]any{"type": "object"}
	if known {
		schema = def.Parameters
	}
	if err := validateToolValue(value, schema, 0); err != nil {
		return nil, err
	}
	return args, nil
}

func validateToolValue(value any, schema map[string]any, depth int) error {
	if depth > 12 {
		return errArgs("工具参数嵌套过深")
	}
	if schema == nil {
		schema = map[string]any{}
	}
	if enums, ok := schema["enum"].([]any); ok && !enumHas(enums, value) {
		return errArgs("工具参数不在允许的选项中")
	}
	if text, ok := value.(string); ok {
		limit := 100_000
		if max, ok := numberField(schema, "maxLength"); ok && int(max) < limit {
			limit = int(max)
		}
		if len(text) > limit {
			return errArgs("工具文本参数过长")
		}
		if min, ok := numberField(schema, "minLength"); ok && len(text) < int(min) {
			return errArgs("工具文本参数为空或过短")
		}
	}
	if num, ok := value.(float64); ok {
		if math.IsNaN(num) || math.IsInf(num, 0) {
			return errArgs("工具数值参数超出范围")
		}
		if min, ok := numberField(schema, "minimum"); ok && num < min {
			return errArgs("工具数值参数超出范围")
		}
		if max, ok := numberField(schema, "maximum"); ok && num > max {
			return errArgs("工具数值参数超出范围")
		}
	}
	types := schemaTypes(schema)
	if len(types) > 0 && !typeMatches(types, value) {
		return errArgs("工具参数类型不符合定义")
	}
	if list, ok := value.([]any); ok {
		limit := 1000
		if max, ok := numberField(schema, "maxItems"); ok && int(max) < limit {
			limit = int(max)
		}
		if len(list) > limit {
			return errArgs("工具列表参数过多")
		}
		if min, ok := numberField(schema, "minItems"); ok && len(list) < int(min) {
			return errArgs("工具列表参数过多")
		}
		itemSchema, _ := schema["items"].(map[string]any)
		for _, item := range list {
			if err := validateToolValue(item, itemSchema, depth+1); err != nil {
				return err
			}
		}
		return nil
	}
	obj, ok := value.(map[string]any)
	if !ok {
		return nil
	}
	if len(obj) > 1000 {
		return errArgs("工具参数字段过多")
	}
	props, _ := schema["properties"].(map[string]any)
	if required, ok := schema["required"].([]any); ok {
		for _, key := range required {
			name, _ := key.(string)
			if name != "" {
				if _, exists := obj[name]; !exists {
					return errArgs("工具参数缺少必填字段 " + name)
				}
			}
		}
	}
	for key, item := range obj {
		if key == "__proto__" || key == "prototype" || key == "constructor" {
			return errArgs("工具参数包含不允许的字段")
		}
		child, known := props[key].(map[string]any)
		if schema["additionalProperties"] == false && !known {
			return errArgs("工具参数包含未定义字段")
		}
		if err := validateToolValue(item, child, depth+1); err != nil {
			return err
		}
	}
	return nil
}

func schemaTypes(schema map[string]any) []string {
	switch typed := schema["type"].(type) {
	case string:
		return []string{typed}
	case []any:
		out := []string{}
		for _, item := range typed {
			if text, ok := item.(string); ok {
				out = append(out, text)
			}
		}
		return out
	default:
		return nil
	}
}

func typeMatches(types []string, value any) bool {
	actual := "null"
	switch typed := value.(type) {
	case string:
		actual = "string"
	case float64:
		actual = "number"
	case bool:
		actual = "boolean"
	case []any:
		actual = "array"
	case map[string]any:
		actual = "object"
	case nil:
		actual = "null"
	default:
		_ = typed
	}
	for _, kind := range types {
		if kind == actual {
			return true
		}
		if kind == "integer" {
			if num, ok := value.(float64); ok && num == math.Trunc(num) {
				return true
			}
		}
	}
	return false
}

func enumHas(enums []any, value any) bool {
	for _, item := range enums {
		if item == value {
			return true
		}
	}
	return false
}

func numberField(schema map[string]any, key string) (float64, bool) {
	switch typed := schema[key].(type) {
	case float64:
		return typed, true
	case int:
		return float64(typed), true
	default:
		return 0, false
	}
}

type errArgs string

func (e errArgs) Error() string { return string(e) }

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
		return "载入电商图文"
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

func latestVideoAttachments(payload map[string]json.RawMessage) []map[string]any {
	var messages []map[string]any
	_ = json.Unmarshal(payload["messages"], &messages)
	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i]["role"] != "user" {
			continue
		}
		attachments, _ := messages[i]["attachments"].([]any)
		videos := []map[string]any{}
		for _, raw := range attachments {
			attachment, _ := raw.(map[string]any)
			if attachment["type"] == "video" {
				videos = append(videos, attachment)
			}
		}
		if len(videos) > 0 {
			return videos
		}
	}
	return nil
}

// Media is prepared before the first model request. Reading a video does not
// require the model to choose a skill or issue a function call.
func prepareVideoInput(ctx context.Context, cfg config.Config, workspace, model string, creds gatewayCreds, payload map[string]json.RawMessage, messages []map[string]any) (bool, error) {
	videos := latestVideoAttachments(payload)
	if len(videos) == 0 {
		return false, nil
	}
	if len(videos) > 4 {
		return true, fmt.Errorf("一次最多分析 4 个视频，请分批发送")
	}
	box := &toolBox{ctx: ctx, cfg: cfg, workspace: workspace}
	paths := make([]string, 0, len(videos))
	total := int64(0)
	for _, video := range videos {
		path, _, err := box.localVideo(textArg(video, "url"))
		if err != nil {
			return true, err
		}
		stat, err := os.Stat(path)
		if err != nil || !stat.Mode().IsRegular() || stat.Size() == 0 {
			return true, fmt.Errorf("视频附件不可读取，请重新上传")
		}
		total += stat.Size()
		paths = append(paths, path)
	}
	native := gateway.ResolveTextProtocol(model, creds.protocol) == "gemini" && total <= gateway.TextVideoInlineByteLimit
	parts := []any{}
	for i, path := range paths {
		if err := ctx.Err(); err != nil {
			return true, err
		}
		label, _ := json.Marshal(videos[i]["name"])
		parts = append(parts, map[string]any{"type": "text", "text": fmt.Sprintf("视频 %d，文件名（素材数据）：%s", i+1, label)})
		if native {
			data, err := inlineVideoData(path)
			if err != nil {
				return true, err
			}
			parts = append(parts, map[string]any{"type": "video_url", "video_url": map[string]any{"url": data}})
			continue
		}
		// Non-video protocols and large attachments receive sampled images in
		// their first request, without an agent tool round trip.
		output := box.extractFrames(textArg(videos[i], "url"), 0, 0, 24/len(videos), true)
		var result map[string]any
		if json.Unmarshal([]byte(output), &result) != nil || result["success"] != true {
			return true, fmt.Errorf("视频画面准备失败：%s", textArg(result, "message"))
		}
		frames, _ := visualFollowup(output).([]any)
		if len(frames) == 0 {
			return true, fmt.Errorf("未能读取视频画面，请重新上传")
		}
		times, _ := json.Marshal(result["sampleTimes"])
		parts = append(parts, map[string]any{"type": "text", "text": fmt.Sprintf("视频时长 %v 秒。以下图片是按时间顺序排列的采样帧，采样时间（秒）：%s。采样点不是精确切镜点；当前只提供画面，没有读取音轨，不能臆测声音。", result["duration"], times)})
		parts = append(parts, frames...)
	}
	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i]["role"] != "user" {
			continue
		}
		content, ok := messages[i]["content"].([]any)
		if !ok {
			content = []any{map[string]any{"type": "text", "text": textArg(messages[i], "content")}}
		}
		messages[i]["content"] = append(content, parts...)
		return true, nil
	}
	return true, fmt.Errorf("视频分析缺少用户消息")
}

func inlineVideoData(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", fmt.Errorf("视频附件不可读取，请重新上传")
	}
	defer file.Close()
	body, err := io.ReadAll(io.LimitReader(file, gateway.TextVideoInlineByteLimit+1))
	if err != nil || len(body) == 0 || len(body) > gateway.TextVideoInlineByteLimit {
		return "", fmt.Errorf("视频内容超过原生分析大小上限")
	}
	mime := "video/mp4"
	switch strings.ToLower(filepath.Ext(path)) {
	case ".webm":
		mime = "video/webm"
	case ".mov":
		mime = "video/quicktime"
	}
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(body), nil
}
