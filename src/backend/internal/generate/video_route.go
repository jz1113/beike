package generate

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"unicode/utf8"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/modelgw"
)

func Video(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			videoPoll(cfg, w, r)
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, 8<<20))
		if err != nil || json.Valid(body) == false {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求格式不正确"})
			return
		}
		var payload map[string]json.RawMessage
		if json.Unmarshal(body, &payload) != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求格式不正确"})
			return
		}
		if message := videoBodyError(payload); message != "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": message, "retryable": false})
			return
		}
		if message := videoModelError(payload); message != "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": message})
			return
		}
		if message := videoInputError(payload, videoRequestedModel(payload)); message != "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": message})
			return
		}
		submitVideo(cfg, w, r, payload)
	})
}

func videoRequestedModel(payload map[string]json.RawMessage) string {
	model := "doubao-seedance-2.0-mini"
	if raw, ok := payload["model"]; ok {
		if json.Unmarshal(raw, &model) != nil {
			return "doubao-seedance-2.0-mini"
		}
	}
	return model
}

func videoModelError(payload map[string]json.RawMessage) string {
	model := videoRequestedModel(payload)
	if modelgw.IsApprovedVideo(model) {
		return ""
	}
	return "模型 " + model + " 不在当前生视频白名单中"
}

func videoPoll(cfg config.Config, w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	if query.Get("taskId") == "" && query.Has("taskKey") {
		key := query.Get("taskKey")
		if strings.TrimSpace(key) == "" || len(key) > 256 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "任务标识无效"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"status": "QUERY_FAILED", "retryable": true, "error": "原任务提交结果待核对，请稍后查询；不会自动重新提交"})
		return
	}
	if query.Get("taskId") == "" && !query.Has("taskKey") {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "缺少 taskId 参数"})
		return
	}
	pollVideoTask(cfg, w, r, query.Get("taskId"))
}

func videoBodyError(payload map[string]json.RawMessage) string {
	steps := []func() string{
		func() string { return requiredString(payload, "prompt", 100_000, "视频提示词不能为空") },
		func() string { return optionalString(payload, "model", 200, true) },
		func() string { return optionalNumber(payload, "duration", false, false) },
		func() string { return optionalString(payload, "aspect_ratio", 32, false) },
		func() string { return optionalString(payload, "resolution", 32, false) },
		func() string { return stringList(payload, "images", 24) },
		func() string { return stringList(payload, "videos", 8) },
		func() string { return optionalBool(payload, "watermark") },
		func() string { return optionalString(payload, "productId", 256, false) },
		func() string { return optionalString(payload, "referenceImageUrl", 0, false) },
		func() string { return optionalString(payload, "first_frame_image", 0, false) },
		func() string { return optionalString(payload, "last_frame_image", 0, false) },
		func() string { return optionalString(payload, "ref_mode", 64, false) },
		func() string { return optionalString(payload, "camera_motion", 200, false) },
		func() string { return optionalString(payload, "camera_control", 200, false) },
		func() string { return optionalBool(payload, "audio") },
		func() string { return optionalNumber(payload, "fps", true, false) },
		func() string { return optionalNumber(payload, "seed", false, true) },
		func() string { return optionalString(payload, "character", 2000, false) },
		func() string { return optionalString(payload, "character_id", 256, false) },
		func() string { return optionalString(payload, "customBaseUrl", 2048, false) },
		func() string { return optionalString(payload, "customApiKey", 4096, false) },
		func() string { return optionalString(payload, "clientTaskId", 256, false) },
	}
	for _, step := range steps {
		if message := step(); message != "" {
			return message
		}
	}
	return ""
}

func requiredString(payload map[string]json.RawMessage, key string, max int, empty string) string {
	raw, ok := payload[key]
	if !ok {
		return "Required"
	}
	return boundedString(raw, max, true, empty)
}

func optionalString(payload map[string]json.RawMessage, key string, max int, minOne bool) string {
	raw, ok := payload[key]
	if !ok {
		return ""
	}
	return boundedString(raw, max, minOne, "")
}

func boundedString(raw json.RawMessage, max int, minOne bool, empty string) string {
	kind := rawKind(raw)
	if kind != "string" {
		return "Expected string, received " + kind
	}
	var value string
	if json.Unmarshal(raw, &value) != nil {
		return "Expected string, received string"
	}
	value = strings.TrimSpace(value)
	if minOne && value == "" {
		if empty != "" {
			return empty
		}
		return "String must contain at least 1 character(s)"
	}
	if max > 0 && utf8.RuneCountInString(value) > max {
		return "String must contain at most " + Itoa(max) + " character(s)"
	}
	return ""
}

func stringList(payload map[string]json.RawMessage, key string, max int) string {
	raw, ok := payload[key]
	if !ok {
		return ""
	}
	if rawKind(raw) != "array" {
		return "Expected array, received " + rawKind(raw)
	}
	var items []json.RawMessage
	if json.Unmarshal(raw, &items) != nil {
		return "Expected array, received array"
	}
	if len(items) > max {
		return "Array must contain at most " + Itoa(max) + " element(s)"
	}
	for _, item := range items {
		if message := boundedString(item, 0, true, ""); message != "" {
			return message
		}
	}
	return ""
}

func optionalBool(payload map[string]json.RawMessage, key string) string {
	raw, ok := payload[key]
	if !ok {
		return ""
	}
	if rawKind(raw) != "boolean" {
		return "Expected boolean, received " + rawKind(raw)
	}
	return ""
}

func optionalNumber(payload map[string]json.RawMessage, key string, positive bool, integer bool) string {
	raw, ok := payload[key]
	if !ok {
		return ""
	}
	kind := rawKind(raw)
	if kind != "number" {
		return "Expected number, received " + kind
	}
	var value float64
	if json.Unmarshal(raw, &value) != nil {
		return "Number must be finite"
	}
	if integer && value != float64(int64(value)) {
		return "Expected integer, received float"
	}
	if positive && value <= 0 {
		return "Number must be greater than 0"
	}
	return ""
}

func rawKind(raw json.RawMessage) string {
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
