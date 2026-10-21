package generate

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

const maxImageBatch = 20

func ImageBatch(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 32<<20))
		if err != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求数据格式异常或体积过大 ()"})
			return
		}
		var envelope struct {
			Items []json.RawMessage `json:"items"`
		}
		if json.Unmarshal(body, &envelope) != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求数据格式异常或体积过大 ()"})
			return
		}
		if len(envelope.Items) < 1 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "至少提交 1 张图片"})
			return
		}
		if len(envelope.Items) > maxImageBatch {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "一批最多提交 20 张图片"})
			return
		}
		results := make([]map[string]any, len(envelope.Items))
		var group sync.WaitGroup
		slots := make(chan struct{}, maxImageBatch)
		for index, raw := range envelope.Items {
			group.Add(1)
			go func(index int, raw json.RawMessage) {
				defer group.Done()
				slots <- struct{}{}
				defer func() { <-slots }()
				results[index] = submitImageBatchItem(cfg, r, raw)
			}(index, raw)
		}
		group.Wait()
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "items": results})
	})
}

func submitImageBatchItem(cfg config.Config, r *http.Request, raw json.RawMessage) map[string]any {
	var payload map[string]json.RawMessage
	if json.Unmarshal(raw, &payload) != nil || payload == nil {
		return map[string]any{"success": false, "error": "单张请求数据格式异常"}
	}
	id := rawString(payload, "id")
	key := rawString(payload, "idempotencyKey")
	if len(key) > 256 {
		return stampImageBatchItem(id, map[string]any{"success": false, "error": "任务标识无效"}, http.StatusBadRequest)
	}
	if status, fields := imagePayloadError(cfg, r, payload); status != 0 {
		return stampImageBatchItem(id, fields, status)
	}
	status, body := executeImageSubmission(cfg, r, payload, key)
	return stampImageBatchItem(id, body, status)
}

func stampImageBatchItem(id string, body map[string]any, status int) map[string]any {
	if body == nil {
		body = map[string]any{"success": false, "error": "生图提交失败"}
	}
	if id != "" {
		body["id"] = id
	}
	body["httpStatus"] = status
	return body
}

func imagePayloadError(cfg config.Config, r *http.Request, payload map[string]json.RawMessage) (int, map[string]any) {
	prompt, ok := jsonString(payload["prompt"])
	if !ok || strings.TrimSpace(prompt) == "" {
		return http.StatusBadRequest, map[string]any{"success": false, "error": "提示词不能为空"}
	}
	model := "gpt-image-2"
	if raw, exists := payload["model"]; exists {
		model = jsString(raw)
	}
	if strings.TrimSpace(model) == "" {
		return http.StatusBadRequest, map[string]any{"success": false, "error": "模型名称不能为空"}
	}
	if status, fields := imageGatewayError(cfg, r, payload, model); status != 0 {
		return status, fields
	}
	if message := workshopProductImageError(payload); message != "" {
		return http.StatusBadRequest, map[string]any{"success": false, "error": message}
	}
	if message := imageModelRuleError(payload, model); message != "" {
		return http.StatusBadRequest, map[string]any{"success": false, "error": message}
	}
	return 0, nil
}
