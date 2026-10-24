package assistant

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
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
