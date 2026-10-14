package generate

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

const depthVideoMaxBytes = 35*1024*1024 + 2*1024*1024

func depthVideoSubmit(cfg config.Config, w http.ResponseWriter, r *http.Request) {
	if strings.Contains(r.Header.Get("Content-Type"), "multipart/form-data") {
		depthVideoForm(cfg, w, r)
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 48<<20))
	if err != nil || !json.Valid(body) {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{
			"success": false, "submissionRejected": true, "error": "请求数据格式异常",
		})
		return
	}
	if message := depthVideoJSONError(body); message != "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": message})
		return
	}
	if status, message := depthVideoJSONProbe(cfg, body); status != 0 {
		httpx.WriteJSON(w, status, map[string]any{"success": false, "error": message})
		return
	}
	var payload map[string]any
	_ = json.Unmarshal(body, &payload)
	operation := strings.TrimSpace(r.Header.Get("x-idempotency-key"))
	if operation == "" {
		operation, _ = payload["clientTaskId"].(string)
	}
	dataURL, _ := payload["videoDataUrl"].(string)
	videoURL, _ := payload["videoUrl"].(string)
	style, _ := payload["style"].(string)
	quality, _ := payload["quality"].(string)
	acceptDepthVideo(cfg, w, r, nil, dataURL, videoURL, style, quality, strings.TrimSpace(operation))
}

func depthVideoJSONError(body []byte) string {
	var raw any
	if json.Unmarshal(body, &raw) != nil {
		return "请求参数无效"
	}
	obj, ok := raw.(map[string]any)
	if !ok {
		return "Expected object, received " + zodReceived(raw)
	}
	if message := optionalMinString(obj, "videoDataUrl"); message != "" {
		return message
	}
	if message := optionalMinString(obj, "videoUrl"); message != "" {
		return message
	}
	if message := optionalEnum(obj, "style", "'mocap' | 'turbo' | 'raw'", "mocap", "turbo", "raw"); message != "" {
		return message
	}
	if message := optionalEnum(obj, "colormap", "'gray' | 'turbo'", "gray", "turbo"); message != "" {
		return message
	}
	if message := optionalEnum(obj, "quality", "'fast' | 'standard' | 'high'", "fast", "standard", "high"); message != "" {
		return message
	}
	if !trimmedPresent(obj, "videoDataUrl") && !trimmedPresent(obj, "videoUrl") {
		return "请提供 videoDataUrl 或 videoUrl"
	}
	return ""
}

func optionalMinString(obj map[string]any, key string) string {
	value, ok := obj[key]
	if !ok {
		return ""
	}
	text, ok := value.(string)
	if !ok {
		return "Expected string, received " + zodReceived(value)
	}
	if text == "" {
		return "String must contain at least 1 character(s)"
	}
	return ""
}

func optionalEnum(obj map[string]any, key, choices string, allowed ...string) string {
	value, ok := obj[key]
	if !ok {
		return ""
	}
	text, isString := value.(string)
	if !isString {
		return "Expected " + choices + ", received " + zodReceived(value)
	}
	for _, item := range allowed {
		if text == item {
			return ""
		}
	}
	return "Invalid enum value. Expected " + choices + ", received '" + text + "'"
}

func trimmedPresent(obj map[string]any, key string) bool {
	text, ok := obj[key].(string)
	return ok && strings.TrimSpace(text) != ""
}

func zodReceived(value any) string {
	switch value.(type) {
	case nil:
		return "null"
	case string:
		return "string"
	case bool:
		return "boolean"
	case float64:
		return "number"
	case []any:
		return "array"
	default:
		return "object"
	}
}

func headerInt(raw string) int64 {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0
	}
	end := 0
	for end < len(raw) && raw[end] >= '0' && raw[end] <= '9' {
		end++
	}
	if end == 0 {
		return 0
	}
	parsed, err := strconv.ParseInt(raw[:end], 10, 64)
	if err != nil {
		return 0
	}
	return parsed
}
