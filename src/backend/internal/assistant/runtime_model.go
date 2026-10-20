package assistant

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/system"
)

var approvedAssistantModels = map[string]bool{
	"gpt-6-luna": true, "grok-4.7": true, "gpt-6-sol": true, "gpt-5.6-luna": true, "gpt-5.6-sol": true,
	"gpt-5.6": true, "gpt-5.6-terra": true, "gpt-5.4-mini": true, "claude-opus-5": true, "claude-fable-5": true,
	"claude-opus-4-7": true, "claude-haiku-4-5-20251001-thinking": true, "claude-sonnet-5": true,
	"gemini-3.8-flash": true, "gemini-3.7-flash": true, "gemini-3.1-pro-preview": true,
	"deepseek-v4.1-flash": true, "deepseek-v4-flash": true, "qwen3.8-max": true, "grok-4.6": true, "kimi-k3": true,
	"deepseek-official:deepseek-flash": true, "deepseek-official:deepseek-v4-pro": true,
}

type gatewayCreds struct {
	baseURL  string
	apiKey   string
	protocol string
}

func resolveTurnCreds(r *http.Request, model, customBase, customKey string, production bool) (gatewayCreds, error) {
	if strings.HasPrefix(model, "deepseek-official:") {
		if customBase != "" && normalizeBase(customBase) != "https://api.deepseek.com" {
			return gatewayCreds{}, errors.New("DeepSeek 官方模型只能使用官方接口地址")
		}
		return gatewayCreds{baseURL: "https://api.deepseek.com", apiKey: strings.TrimSpace(customKey)}, nil
	}
	headerKey := strings.TrimSpace(r.Header.Get("x-custom-api-key"))
	headerBase := strings.TrimSpace(r.Header.Get("x-custom-base-url"))
	if customKey == "" {
		customKey = headerKey
	}
	if customBase == "" {
		customBase = headerBase
	}
	if customBase != "" && production && !safePublicHTTPS(customBase) {
		return gatewayCreds{}, errors.New("当前接口地址与服务器允许的视觉网关不一致。请在设置 → 服务接口配置中改为服务器配置的网关地址，或联系管理员配置该网关；密钥未发送到其他网关。")
	}
	base := "https://ai.comfly.org"
	if env := strings.TrimSpace(os.Getenv("AI_DRAWING_BASE_URL")); env != "" {
		base = env
	}
	if customBase != "" {
		base = customBase
	}
	key := strings.TrimSpace(customKey)
	if key == "" && !production && normalizeBase(base) == normalizeBase(defaultBase()) {
		key = strings.TrimSpace(os.Getenv("AI_DRAWING_API_KEY"))
		if key == "" {
			key = strings.TrimSpace(os.Getenv("AI_API_KEY"))
		}
	}
	return gatewayCreds{baseURL: normalizeBase(base), apiKey: key}, nil
}

func defaultBase() string {
	if env := strings.TrimSpace(os.Getenv("AI_DRAWING_BASE_URL")); env != "" {
		return env
	}
	return "https://ai.comfly.org"
}

func normalizeBase(raw string) string {
	raw = strings.TrimRight(strings.TrimSpace(raw), "/")
	return strings.TrimSuffix(strings.TrimSuffix(raw, "/v1"), "/V1")
}

func safePublicHTTPS(raw string) bool {
	return strings.HasPrefix(raw, "https://") && !strings.Contains(raw, "localhost") && !strings.Contains(raw, "127.0.0.1")
}

type modelRound struct {
	content    string
	reasoning  string
	toolCalls  []modelToolCall
	model      string
	prompt     int
	completion int
	usageOK    bool
	native     any
}

type modelToolCall struct {
	id, name, arguments string
	extra               any
}

func completionBody(model string, messages []map[string]any, tools []map[string]any, effort string, stream bool) ([]byte, error) {
	payload := map[string]any{"model": model, "messages": messages, "stream": stream}
	if len(tools) > 0 {
		payload["tools"] = tools
		payload["tool_choice"] = "auto"
	}
	tokens := 16384
	if effort == "low" {
		tokens = 8192
	}
	if strings.HasPrefix(model, "gpt-") || model == "kimi-k3" {
		payload["max_completion_tokens"] = tokens
	} else {
		payload["max_tokens"] = tokens
	}
	if effort != "" && effort != "auto" && effort != "none" && modelSupportsReasoning(model) {
		payload["reasoning_effort"] = effort
	}
	if !strings.HasPrefix(model, "deepseek-official:") {
		return json.Marshal(payload)
	}
	id := strings.TrimPrefix(model, "deepseek-official:")
	payload["model"] = id
	if effort != "" && effort != "none" {
		delete(payload, "tool_choice")
		mapped := "high"
		if effort == "low" {
			mapped = "low"
		}
		if effort == "xhigh" || effort == "max" {
			mapped = "max"
		}
		payload["reasoning_effort"] = mapped
		payload["thinking"] = map[string]any{"type": "enabled"}
	} else {
		payload["thinking"] = map[string]any{"type": "disabled"}
	}
	for _, message := range messages {
		if message["role"] == "assistant" && message["content"] == nil && message["tool_calls"] != nil {
			message["content"] = ""
		}
	}
	return json.Marshal(payload)
}

func modelSupportsReasoning(model string) bool {
	id := strings.ToLower(strings.TrimSpace(model))
	if strings.Contains(id, "4o") || strings.Contains(id, "gpt-4") || strings.Contains(id, "gpt-3") {
		return false
	}
	if strings.HasPrefix(id, "o1") || strings.HasPrefix(id, "o3") || strings.HasPrefix(id, "o4") {
		return true
	}
	if strings.Contains(id, "reason") || strings.Contains(id, "thinking") {
		return true
	}
	if strings.HasPrefix(id, "gpt-5") || strings.HasPrefix(id, "gpt-6") || strings.Contains(id, "grok-4") || strings.Contains(id, "gemini-3") || strings.Contains(id, "qwen3.8") || strings.Contains(id, "kimi-k3") || strings.Contains(id, "deepseek") {
		return true
	}
	return false
}

func preserveReasoning(model string) bool {
	switch model {
	case "qwen3.8-max", "kimi-k3", "deepseek-v4-flash", "deepseek-v4.1-flash":
		return true
	default:
		return strings.HasPrefix(model, "deepseek-official:")
	}
}

var assistantHTTP = func() *http.Client {
	return &http.Client{Timeout: 10 * time.Minute}
}

func postModel(ctx context.Context, creds gatewayCreds, body []byte, stream bool) (*http.Response, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, system.ChatCompletionsURL(creds.baseURL), bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+creds.apiKey)
	client := assistantHTTP()
	return client.Do(request)
}

func readModelStream(body io.Reader, onDelta func(kind, text string)) (modelRound, error) {
	round := modelRound{}
	calls := map[int]*modelToolCall{}
	finish := ""
	emit := func(kind, text string) {
		if text == "" || onDelta == nil {
			return
		}
		onDelta(kind, text)
	}
	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 64*1024), 4*1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "[DONE]" {
			break
		}
		var chunk map[string]any
		if json.Unmarshal([]byte(data), &chunk) != nil {
			return round, errors.New("模型返回的工具调用格式异常")
		}
		if usage, ok := chunk["usage"].(map[string]any); ok {
			prompt, promptOK := usage["prompt_tokens"].(float64)
			completion, completionOK := usage["completion_tokens"].(float64)
			if promptOK && completionOK {
				round.prompt = int(prompt)
				round.completion = int(completion)
				round.usageOK = true
			}
		}
		choices, _ := chunk["choices"].([]any)
		if len(choices) == 0 {
			continue
		}
		choice, _ := choices[0].(map[string]any)
		if reason, _ := choice["finish_reason"].(string); reason != "" {
			finish = reason
		}
		delta, _ := choice["delta"].(map[string]any)
		if delta == nil {
			if message, ok := choice["message"].(map[string]any); ok {
				delta = message
			}
		}
		if text, _ := delta["reasoning_content"].(string); text != "" {
			round.reasoning += text
			emit("reasoning", text)
		}
		if text, _ := delta["content"].(string); text != "" {
			round.content += text
			emit("content", text)
		}
		rawCalls, exists := delta["tool_calls"]
		if !exists || rawCalls == nil {
			continue
		}
		list, ok := rawCalls.([]any)
		if !ok {
			return round, errors.New("模型返回的工具调用格式异常")
		}
		for _, raw := range list {
			call, _ := raw.(map[string]any)
			index := 0
			if value, ok := call["index"].(float64); ok {
				index = int(value)
			}
			if index < 0 || index >= 24 {
				return round, errors.New("模型工具调用数量或索引超出限制")
			}
			entry := calls[index]
			if entry == nil {
				entry = &modelToolCall{}
				calls[index] = entry
			}
			if id, _ := call["id"].(string); id != "" {
				if len(id) > 256 {
					return round, errors.New("模型工具调用标识异常")
				}
				entry.id = id
			}
			if extra, ok := call["extra_content"]; ok {
				entry.extra = extra
			}
			fn, _ := call["function"].(map[string]any)
			if name, _ := fn["name"].(string); name != "" {
				if name == entry.name {
					entry.name = name
				} else {
					entry.name += name
				}
				if len(entry.name) > 128 {
					return round, errors.New("模型工具名称过长")
				}
			}
			if args, _ := fn["arguments"].(string); args != "" {
				if len(entry.arguments)+len(args) > 100_000 {
					return round, errors.New("模型工具参数过大")
				}
				entry.arguments += args
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return round, err
	}
	for i := 0; i < 24; i++ {
		if call := calls[i]; call != nil {
			if call.name == "" {
				return round, errors.New("模型工具调用缺少完整名称，不执行不完整操作")
			}
			if call.id == "" {
				call.id = newRuntimeID("call")
			}
			round.toolCalls = append(round.toolCalls, *call)
		}
	}
	if finish == "" {
		return round, errors.New("模型连接提前关闭，回复尚未完成，已生成内容已保留，请重试。")
	}
	if finish == "length" {
		return round, errors.New("模型达到输出长度限制，回复尚未完成，请发送“接着上一段继续”。")
	}
	if finish != "stop" && finish != "tool_calls" {
		return round, errors.New("模型未正常完成本轮（" + finish + "），已保留现有内容。")
	}
	if strings.TrimSpace(round.content) == "" && len(round.toolCalls) == 0 {
		return round, errors.New("模型返回空内容，本轮尚未完成。")
	}
	return round, nil
}

func unsupportedTools(status int, body string) bool {
	if status != http.StatusBadRequest && status != http.StatusUnprocessableEntity {
		return false
	}
	lower := strings.ToLower(body)
	return (strings.Contains(lower, "tool") || strings.Contains(lower, "function") || strings.Contains(lower, "stream")) &&
		(strings.Contains(lower, "unsupported") || strings.Contains(lower, "not support") || strings.Contains(lower, "not allowed"))
}

func formatUpstreamModelError(payload []byte, status int) string {
	if len(payload) > 0 {
		var data map[string]any
		if json.Unmarshal(payload, &data) == nil {
			if nested, ok := data["error"].(map[string]any); ok {
				if msg, ok := nested["message"].(string); ok && strings.TrimSpace(msg) != "" {
					return strings.TrimSpace(msg)
				}
			}
			if msg, ok := data["error"].(string); ok && strings.TrimSpace(msg) != "" {
				return strings.TrimSpace(msg)
			}
			if msg, ok := data["message"].(string); ok && strings.TrimSpace(msg) != "" {
				return strings.TrimSpace(msg)
			}
			if msg, ok := data["detail"].(string); ok && strings.TrimSpace(msg) != "" {
				return strings.TrimSpace(msg)
			}
		}
	}
	switch status {
	case http.StatusUnauthorized:
		return "API 凭证未配置或令牌不合法，请前往「⚙️ 设置 -> 服务接口配置」检查并填入有效凭证"
	case http.StatusPaymentRequired:
		return "服务商账户余额不足，请充值后重试"
	case http.StatusTooManyRequests:
		return "模型请求频率超限 (429)，请稍后重试"
	case http.StatusNotFound:
		return "所请求的模型不存在或网关未开放该模型通道"
	}
	return "模型请求失败 (HTTP " + strconv.Itoa(status) + ")"
}
