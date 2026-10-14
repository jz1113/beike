package generate

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/modelgw"
)

func Image(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			imagePoll(cfg, w, r)
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, 32<<20))
		if err != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求数据格式异常或体积过大 ()"})
			return
		}
		var payload map[string]json.RawMessage
		if json.Unmarshal(body, &payload) != nil {
			if len(body) >= 8_000_000 {
				httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "参考图体积过大，请求在传输中被截断。请压缩垫图后重试，或减少同时传入的参考图数量。"})
				return
			}
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求数据格式异常或体积过大 ()"})
			return
		}
		prompt, ok := jsonString(payload["prompt"])
		if !ok || strings.TrimSpace(prompt) == "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "提示词不能为空"})
			return
		}
		model := "gpt-image-2"
		if raw, exists := payload["model"]; exists {
			model = jsString(raw)
		}
		if !modelgw.IsApprovedImage(model) {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "模型 " + model + " 不在当前生图白名单中"})
			return
		}
		if status, fields := imageGatewayError(cfg, r, payload, model); status != 0 {
			httpx.WriteJSON(w, status, fields)
			return
		}
		if message := workshopProductImageError(payload); message != "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": message})
			return
		}
		if message := imageModelRuleError(payload, model); message != "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": message})
			return
		}
		submitImage(cfg, w, r, payload)
	})
}

func imagePoll(cfg config.Config, w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	if query.Get("taskId") == "" && query.Has("taskKey") {
		key := query.Get("taskKey")
		if strings.TrimSpace(key) == "" || len(key) > 256 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "任务标识无效"})
			return
		}
		taskID, err := lookupImageTaskByKey(cfg, r, key)
		if err != nil {
			httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{"success": false, "retryable": true, "error": "原任务提交记录暂时无法核对，请稍后查询"})
			return
		}
		if taskID == "" {
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"status": "QUERY_FAILED", "retryable": true, "error": "尚未找到原任务记录，请稍后核对；不会自动重新提交"})
			return
		}
		if strings.HasPrefix(taskID, "direct_") {
			writeDirectImagePoll(cfg, w, r, taskID)
			return
		}
		pollImageTask(cfg, w, r, taskID)
		return
	}
	if query.Get("taskId") == "" && !query.Has("taskKey") {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "缺少 taskId 参数"})
		return
	}
	if taskID := query.Get("taskId"); strings.HasPrefix(taskID, "direct_") {
		writeDirectImagePoll(cfg, w, r, taskID)
		return
	}
	pollImageTask(cfg, w, r, query.Get("taskId"))
}

func jsonString(raw json.RawMessage) (string, bool) {
	if len(raw) == 0 || string(raw) == "null" {
		return "", false
	}
	var value string
	if json.Unmarshal(raw, &value) != nil {
		return "", false
	}
	return value, true
}

func jsString(raw json.RawMessage) string {
	if text, ok := jsonString(raw); ok {
		return text
	}
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "null" || trimmed == "" {
		return "null"
	}
	if trimmed == "true" || trimmed == "false" {
		return trimmed
	}
	if number, err := strconv.ParseFloat(trimmed, 64); err == nil {
		return strconv.FormatFloat(number, 'f', -1, 64)
	}
	return trimmed
}
