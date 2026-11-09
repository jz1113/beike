package assistant

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"context"
	"encoding/json"
	"errors"
	"github.com/dop251/goja"
	"io"
	"net/http"
	"strings"
	"time"
)

func Chat(cfg config.Config) http.Handler {
	next := StartTurn(cfg)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Deprecation", "true")
		w.Header().Set("Link", `</api/assistant/turn/start>; rel="successor-version"`)
		next.ServeHTTP(w, r)
	})
}

func StartTurn(cfg config.Config) http.Handler {
	return turnHandler(cfg, "start", 32_000_000, "请求内容为空", "请求附件过大，请减少附件后重试", "请求内容格式异常，请检查消息和附件后重试", turnStartError)
}

func ApproveTurn(cfg config.Config) http.Handler {
	return turnHandler(cfg, "approve", 4096, "审批内容过大或为空", "审批内容过大或为空", "无效 JSON", turnApproveError)
}

func InterruptTurn(cfg config.Config) http.Handler {
	return turnHandler(cfg, "interrupt", 4096, "中断请求内容过大或为空", "中断请求内容过大或为空", "无效 JSON", turnInterruptError)
}

func turnHandler(cfg config.Config, mode string, limit int64, empty, tooLarge, badJSON string, validate func(map[string]json.RawMessage) string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, limit+1))
		if err != nil || len(body) > int(limit) {
			status := http.StatusRequestEntityTooLarge
			message := tooLarge
			if err != nil {
				status = http.StatusBadRequest
				message = badJSON
			}
			httpx.WriteJSON(w, status, map[string]any{"success": false, "error": message})
			return
		}
		if len(body) == 0 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": empty})
			return
		}
		if !json.Valid(body) {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": badJSON})
			return
		}
		var payload map[string]json.RawMessage
		if json.Unmarshal(body, &payload) != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": badJSON})
			return
		}
		if message := validate(payload); message != "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": message})
			return
		}
		switch mode {
		case "approve":
			approveAssistantTurn(w, r, payload)
		case "interrupt":
			interruptAssistantTurn(w, r, payload)
		default:
			startAssistantTurn(cfg, w, r, payload)
		}
	})
}

func turnStartError(payload map[string]json.RawMessage) string {
	if raw, exists := payload["textProtocol"]; exists {
		protocol, ok := rawText(raw)
		if !ok || !validTextProtocol(protocol) {
			return "textProtocol: 不支持的文本协议"
		}
	}
	if raw, exists := payload["reasoningEffort"]; exists {
		effort, ok := rawText(raw)
		if !ok || (effort != "auto" && effort != "low" && effort != "medium" && effort != "high" && effort != "xhigh" && effort != "max") {
			return "reasoningEffort: 不支持的思考强度"
		}
	}
	raw, ok := payload["messages"]
	if !ok {
		return "messages: Required"
	}
	if turnKind(raw) != "array" {
		return "messages: Expected array, received " + turnKind(raw)
	}
	var messages []json.RawMessage
	if json.Unmarshal(raw, &messages) != nil {
		return "messages: Expected array, received array"
	}
	if len(messages) == 0 {
		return "messages: Array must contain at least 1 element(s)"
	}
	if len(messages) > 500 {
		return "messages: Array must contain at most 500 element(s)"
	}
	hasUser := false
	for _, message := range messages {
		var item map[string]json.RawMessage
		if json.Unmarshal(message, &item) != nil {
			return ""
		}
		role, roleOK := rawText(item["role"])
		content, contentOK := rawText(item["content"])
		if !roleOK || !contentOK {
			return ""
		}
		if role != "user" && role != "assistant" && role != "system" {
			return ""
		}
		if len(content) > 100_000 {
			return ""
		}
		attachments, hasAttachments := item["attachments"]
		if hasAttachments && turnKind(attachments) == "array" {
			var files []json.RawMessage
			if json.Unmarshal(attachments, &files) == nil && len(files) > 0 && role == "user" {
				hasUser = true
			}
		}
		if role == "user" && strings.TrimSpace(content) != "" {
			hasUser = true
		}
	}
	if !hasUser {
		return "messages: 缺少用户消息或附件"
	}
	return ""
}

func turnApproveError(payload map[string]json.RawMessage) string {
	if message := assistantIDError(payload, "turnId"); message != "" {
		return message
	}
	if message := assistantIDError(payload, "approvalId"); message != "" {
		return message
	}
	decision, ok := rawText(payload["decision"])
	if !ok {
		if _, exists := payload["decision"]; !exists {
			return "decision: Required"
		}
		return "decision: Invalid enum value. Expected 'accept' | 'decline' | 'acceptForSession' | 'cancel', received " + turnKind(payload["decision"])
	}
	switch decision {
	case "accept", "decline", "acceptForSession", "cancel":
		return ""
	default:
		return "decision: Invalid enum value. Expected 'accept' | 'decline' | 'acceptForSession' | 'cancel', received '" + decision + "'"
	}
}

func turnInterruptError(payload map[string]json.RawMessage) string {
	return assistantIDError(payload, "turnId")
}

func assistantIDError(payload map[string]json.RawMessage, key string) string {
	raw, ok := payload[key]
	if !ok {
		return key + ": Required"
	}
	text, isString := rawText(raw)
	if !isString {
		return key + ": Expected string, received " + turnKind(raw)
	}
	text = strings.TrimSpace(text)
	if text == "" {
		return key + ": String must contain at least 1 character(s)"
	}
	if len(text) > 255 {
		return key + ": String must contain at most 255 character(s)"
	}
	return ""
}

func rawText(raw json.RawMessage) (string, bool) {
	if turnKind(raw) != "string" {
		return "", false
	}
	var value string
	if json.Unmarshal(raw, &value) != nil {
		return "", false
	}
	return value, true
}

func turnKind(raw json.RawMessage) string {
	text := strings.TrimSpace(string(raw))
	switch {
	case text == "" || text == "null":
		return "null"
	case text == "true" || text == "false":
		return "boolean"
	case strings.HasPrefix(text, "\""):
		return "string"
	case strings.HasPrefix(text, "["):
		return "array"
	case strings.HasPrefix(text, "{"):
		return "object"
	default:
		return "number"
	}
}

const DeletedThreadMessages = `{"version":1,"deleted":true}`

func ThreadTime(raw string) int64 {
	if parsed, err := time.Parse(time.RFC3339Nano, raw); err == nil {
		return parsed.UnixMilli()
	}
	if parsed, err := time.Parse("2006-01-02 15:04:05", raw); err == nil {
		return parsed.UnixMilli()
	}
	if parsed, err := time.Parse(time.RFC3339, raw); err == nil {
		return parsed.UnixMilli()
	}
	return 0
}

func ThreadTurns(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		threadID := r.PathValue("threadId")
		if threadID == "" || len(threadID) >= 256 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "缺少 threadId"})
			return
		}
		deleted, err := threadDeleted(cfg, r, threadID)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "对话记录读取失败，请稍后重试"})
			return
		}
		if deleted {
			httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "error": "对话已删除"})
			return
		}
		turns, err := listThreadTurnRows(r.Context(), cfg, httpx.WorkspaceFrom(r), threadID, r.URL.Query().Get("status"))
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "对话记录读取失败，请稍后重试"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "turns": turns})
	})
}

func TurnRecover(cfg config.Config) http.Handler { return TurnSnapshot(cfg) }

func AllRuns(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		markRunsDeprecated(w)
		writeRuns(cfg, w, r, "")
	})
}

func ThreadRuns(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		markRunsDeprecated(w)
		threadID := r.PathValue("threadId")
		if threadID == "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "缺少 threadId"})
			return
		}
		deleted, err := threadDeleted(cfg, r, threadID)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "任务列表读取失败，请稍后重试"})
			return
		}
		if deleted {
			httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "error": "对话已删除"})
			return
		}
		writeRuns(cfg, w, r, threadID)
	})
}

func writeRuns(cfg config.Config, w http.ResponseWriter, r *http.Request, threadID string) {
	includeCompleted := false
	limit := 20
	if threadID == "" {
		includeCompleted = r.URL.Query().Get("includeCompleted") == "1"
		limit = httpx.QueryInt(r, "limit", 20)
		if limit < 1 {
			limit = 1
		}
		if limit > 50 {
			limit = 50
		}
	}
	runs, err := listRunRows(r.Context(), cfg, httpx.WorkspaceFrom(r), threadID, includeCompleted, limit)
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "任务列表读取失败，请稍后重试"})
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "runs": runs})
}

func markRunsDeprecated(w http.ResponseWriter) {
	w.Header().Set("Deprecation", "true")
	w.Header().Set("Link", `</api/assistant/threads/:threadId/turns>; rel="successor-version"`)
}

func TurnSnapshot(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		turnID := r.PathValue("turnId")
		if turnID == "" || len(turnID) >= 256 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "缺少 turnId"})
			return
		}
		snapshot, err := readTurnSnapshot(r.Context(), cfg, httpx.WorkspaceFrom(r), turnID)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "对话记录读取失败，请稍后重试"})
			return
		}
		if snapshot == nil {
			httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "error": "Turn 不存在或对话已删除"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "snapshot": snapshot})
	})
}

const (
	sandboxMaxCode      = 32_000
	sandboxMaxInput     = 1_000_000
	sandboxMaxOutput    = 32_000
	sandboxMaxLines     = 100
	sandboxMaxToolCalls = 64
)

func RunSandbox(code string, input any, timeout time.Duration) ([]string, error) {
	return runSandbox(context.Background(), code, input, timeout, nil)
}

func runSandbox(ctx context.Context, code string, input any, timeout time.Duration, tools map[string]func(map[string]any) string) ([]string, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if len(code) > sandboxMaxCode {
		return nil, errors.New("代码超过 32000 字符限制")
	}
	if timeout <= 0 || timeout > 120*time.Second {
		timeout = 120 * time.Second
	}
	payload, err := json.Marshal(input)
	if err != nil || len(payload) > sandboxMaxInput {
		return nil, errors.New("沙箱输入过大")
	}
	vm := goja.New()
	vm.SetMaxCallStackSize(512 * 1024)
	output := []string{}
	outputSize := 0
	vm.Set("__print", func(call goja.FunctionCall) goja.Value {
		text := call.Argument(0).String()
		outputSize += len(text)
		if outputSize > sandboxMaxOutput || len(output) >= sandboxMaxLines {
			panic(vm.ToValue("沙箱输出超过限制，请先筛选或汇总数据"))
		}
		output = append(output, text)
		return goja.Undefined()
	})
	if err := vm.Set("__input", string(payload)); err != nil {
		return nil, err
	}
	toolObject := vm.NewObject()
	toolCalls := 0
	for name, call := range tools {
		toolName := name
		toolCall := call
		_ = toolObject.Set(toolName, func(call goja.FunctionCall) goja.Value {
			toolCalls++
			if toolCalls > sandboxMaxToolCalls {
				panic(vm.ToValue("沙箱工具调用次数超过限制，请先使用筛选参数缩小查询范围"))
			}
			args := map[string]any{}
			if len(call.Arguments) > 0 && !goja.IsUndefined(call.Arguments[0]) && !goja.IsNull(call.Arguments[0]) {
				switch exported := call.Arguments[0].Export().(type) {
				case map[string]any:
					args = exported
				case string:
					_ = json.Unmarshal([]byte(exported), &args)
				default:
					if raw, err := json.Marshal(exported); err == nil {
						_ = json.Unmarshal(raw, &args)
					}
				}
			}
			return vm.ToValue(toolCall(args))
		})
	}
	_ = vm.Set("tools", toolObject)
	runCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	done := make(chan struct{})
	defer close(done)
	go func() {
		select {
		case <-runCtx.Done():
			vm.Interrupt("沙箱执行超时")
		case <-done:
		}
	}()
	if _, err := vm.RunString(`
		globalThis.input = JSON.parse(__input);
		delete globalThis.__input;
		globalThis.text = function(value) { __print(typeof value === "string" ? value : JSON.stringify(value)); };
		globalThis.console = { log: function() {
			var values = Array.prototype.slice.call(arguments);
			text(values.length === 1 ? values[0] : values);
		} };
	`); err != nil {
		return nil, errors.New("沙箱执行失败")
	}
	_, err = vm.RunString("(function(){\n" + code + "\n})()")
	if err != nil {
		var interrupted *goja.InterruptedError
		if errors.As(err, &interrupted) {
			if errors.Is(ctx.Err(), context.Canceled) {
				return nil, ctx.Err()
			}
			return nil, errors.New("沙箱执行超时")
		}
		return nil, err
	}
	return output, nil
}
