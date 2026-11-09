package submission

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/httpx"
)

func Reply(w http.ResponseWriter, row Receipt) {
	if row.Status == 0 {
		httpx.WriteJSON(w, http.StatusConflict, map[string]any{"success": false, "status": "QUERY_FAILED", "submissionUnknown": true,
			"operationKey": row.Key, "error": "原操作正在执行或结果待核对；不会重新提交，请稍后查询原操作"})
		return
	}
	body := row.Body
	body["replayed"] = true
	body["operationKey"] = row.Key
	httpx.WriteJSON(w, row.Status, body)
}

// Guard allocates a durable receipt before invoking a billable operation.
func Guard(path, kind string, next http.Handler) http.Handler {
	return GuardWithOptions(path, kind, GuardOptions{}, next)
}

// GuardOptions allows large image stages to retain their existing request and execution limits.
type GuardOptions struct {
	MaxBytes int64
	Timeout  time.Duration
}

func GuardWithOptions(path, kind string, options GuardOptions, next http.Handler) http.Handler {
	if options.MaxBytes <= 0 {
		options.MaxBytes = 8 << 20
	}
	if options.Timeout <= 0 {
		options.Timeout = 3 * time.Minute
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		key := strings.TrimSpace(r.Header.Get("x-idempotency-key"))
		if r.Method == http.MethodGet {
			if key == "" {
				key = strings.TrimSpace(r.URL.Query().Get("operationKey"))
			}
			row, err := Read(r.Context(), path, httpx.WorkspaceFrom(r), kind, key)
			if err == nil {
				Reply(w, row)
				return
			}
			status, message := http.StatusServiceUnavailable, "原操作回执暂时无法读取，请稍后查询；不会重新提交"
			code := "operation_receipt_unavailable"
			if errors.Is(err, ErrNotFound) {
				status, message = http.StatusNotFound, "尚未找到原操作回执"
				code = "operation_not_found"
			}
			httpx.WriteJSON(w, status, map[string]any{"success": false, "code": code, "submissionUnknown": !errors.Is(err, ErrNotFound), "error": message})
			return
		}

		raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, options.MaxBytes))
		var payload map[string]any
		if err != nil || json.Unmarshal(raw, &payload) != nil || payload == nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "submissionRejected": true, "error": "请求数据格式异常"})
			return
		}
		if local, ok := payload["clientTaskId"].(string); ok && strings.TrimSpace(local) != "" {
			if key != "" && key != strings.TrimSpace(local) {
				httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "submissionRejected": true, "error": "客户端任务标识与幂等标识不一致"})
				return
			}
			key = strings.TrimSpace(local)
		}
		if key == "" {
			key = NewKey()
		}
		if key == "" || len(key) > 256 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "submissionRejected": true, "error": "操作标识无效"})
			return
		}
		input := map[string]any{}
		for field, value := range payload {
			if field != "customApiKey" && field != "storageConfig" && field != "clientTaskId" {
				input[field] = value
			}
		}
		credential, _ := payload["customApiKey"].(string)
		if credential == "" {
			credential = r.Header.Get("x-custom-api-key")
		}
		input["credentialDigest"] = Hash(credential)
		input["baseHeader"] = r.Header.Get("x-custom-base-url")
		row, owned, err := claim(r.Context(), path, httpx.WorkspaceFrom(r), kind, key, Hash(input))
		if err != nil {
			status, message := http.StatusServiceUnavailable, "操作回执暂时无法核对；请保留原操作标识，恢复存储后查询，不要重新提交"
			if errors.Is(err, ErrConflict) {
				status, message = http.StatusConflict, "同一操作标识不能用于不同参数或渠道，请查询原操作"
			}
			httpx.WriteJSON(w, status, map[string]any{"success": false, "submissionRejected": false, "submissionUnknown": true, "operationKey": key, "error": message})
			return
		}
		if !owned {
			Reply(w, row)
			return
		}
		// A request already canceled before dispatch cannot reach a billable endpoint.
		detached, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), options.Timeout)
		defer cancel()
		captured := &responseBuffer{header: make(http.Header), status: http.StatusOK}
		if r.Context().Err() != nil {
			httpx.WriteJSON(captured, http.StatusBadRequest, map[string]any{"success": false, "submissionRejected": true, "error": "提交前已取消，未调用模型"})
		} else {
			request := r.Clone(detached)
			request.Header.Set("x-idempotency-key", key)
			request.Body = io.NopCloser(bytes.NewReader(raw))
			next.ServeHTTP(captured, request)
		}
		body := map[string]any{}
		if json.Unmarshal(captured.body.Bytes(), &body) != nil || body == nil {
			body = map[string]any{"success": false, "error": "操作响应未确认"}
			captured.status = http.StatusBadGateway
		}
		body["operationKey"] = key
		if captured.status >= 500 && body["submissionRejected"] != true {
			body["submissionUnknown"] = true
		}
		if captured.status >= 400 && captured.status < 500 && body["submissionUnknown"] != true && body["usage"] == nil {
			body["submissionRejected"] = true
		}
		settlement, stop := context.WithTimeout(context.WithoutCancel(r.Context()), 5*time.Second)
		defer stop()
		if err := finish(settlement, path, row, captured.status, body); err != nil {
			body["success"] = false
			body["submissionUnknown"] = true
			body["submissionRejected"] = false
			body["error"] = "操作已执行，但回执结算未确认；请核对原操作，不要重新提交"
			captured.status = http.StatusServiceUnavailable
		}
		httpx.WriteJSON(w, captured.status, body)
	})
}

type responseBuffer struct {
	header http.Header
	status int
	body   bytes.Buffer
}

func (w *responseBuffer) Header() http.Header             { return w.header }
func (w *responseBuffer) WriteHeader(status int)          { w.status = status }
func (w *responseBuffer) Write(value []byte) (int, error) { return w.body.Write(value) }
