package generate

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/submission"
)

// Audio handles audio generation (TTS / Music) endpoints.
func Audio(cfg config.Config) http.Handler {
	guarded := submission.Guard(cfg.SQLiteFile(), "audio", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 8<<20))
		if err != nil || !json.Valid(body) {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求格式不正确"})
			return
		}

		var payload map[string]json.RawMessage
		if json.Unmarshal(body, &payload) != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求格式不正确"})
			return
		}

		prompt := strings.TrimSpace(rawString(payload, "prompt"))
		if prompt == "" {
			prompt = strings.TrimSpace(rawString(payload, "text"))
		}
		if prompt == "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "submissionRejected": true, "error": "音频生成文本不能为空"})
			return
		}

		model := strings.TrimSpace(rawString(payload, "model"))
		if model == "" {
			model = "speech-2.8-hd"
		}

		submitAudio(cfg, w, r, payload, model, prompt)
	}))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			audioPoll(cfg, w, r)
			return
		}
		guarded.ServeHTTP(w, r)
	})
}

func submitAudio(cfg config.Config, w http.ResponseWriter, r *http.Request, payload map[string]json.RawMessage, model, prompt string) {
	base, apiKey := audioCredentials(cfg, r, payload)
	format := strings.ToLower(strings.TrimSpace(rawString(payload, "format")))
	if format == "" {
		format = "mp3"
	}
	switch format {
	case "mp3", "wav", "ogg", "opus", "aac", "flac", "m4a", "pcm":
	default:
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "submissionRejected": true, "error": "不支持的音频格式"})
		return
	}
	voice := rawString(payload, "voice")
	if voice == "" {
		voice = "zh-female-commercial"
	}
	taskID := fmt.Sprintf("task_aud_%d", time.Now().UnixNano())
	clientTaskID := rawString(payload, "clientTaskId")
	idempotencyKey := r.Header.Get("x-idempotency-key")
	if idempotencyKey == "" {
		idempotencyKey = clientTaskID
	}
	workspaceID := httpx.WorkspaceFrom(r)
	failResult := func(status int, message string, unknown bool, usage map[string]any) {
		state := "FAILED"
		if unknown {
			state = "QUERY_FAILED"
		}
		recordID, recordErr := recordAudioTask(r.Context(), cfg, workspaceID, imageTaskDraft{
			Prompt: prompt, TaskID: taskID, Model: model, Size: format, Quality: "high", Status: state,
			FailReason: message, MediaType: "audio", IdempotencyKey: idempotencyKey,
		})
		body := map[string]any{"success": false, "error": message, "taskId": taskID, "recordId": recordID, "status": state, "retryable": false, "submissionUnknown": unknown, "submissionRejected": !unknown}
		if usage != nil {
			body["usage"] = usage
			settleAudioUsage(r, cfg, taskID, recordID, usage)
		}
		if recordErr != nil && unknown {
			body["error"] = message + "；任务记录未确认，请查询原操作回执"
		}
		httpx.WriteJSON(w, status, body)
	}
	fail := func(status int, message string) { failResult(status, message, false, nil) }

	if apiKey == "" || base == "" {
		fail(http.StatusBadRequest, "未配置音频接口。请前往「设置 → 服务接口配置」填入网关地址和密钥。")
		return
	}
	result, err := SynthesizeSpeech(r.Context(), SpeechRequest{
		Base: base, APIKey: apiKey, Model: model, Text: prompt, Voice: voice, Format: format, Speed: rawFloat(payload, "speed"), Volume: rawFloat(payload, "volume"),
	})
	if err != nil {
		var upstream *SpeechSubmissionError
		unknown := !errors.As(err, &upstream) || upstream.Unknown
		failResult(http.StatusBadGateway, err.Error(), unknown, result.Usage)
		return
	}
	audioURL := result.RemoteURL
	if len(result.Bytes) > 0 {
		filename := taskID + "." + format
		localURL, publicURL, saveErr := SaveWorkspaceBytes(workspaceID, "audio", filename, result.ContentType, result.Bytes)
		if saveErr != nil && audioURL == "" {
			failResult(http.StatusInternalServerError, "音频已生成，但保存失败", true, result.Usage)
			return
		}
		if publicURL != "" {
			audioURL = publicURL
		} else if localURL != "" {
			audioURL = localURL
		}
	}
	if audioURL == "" {
		failResult(http.StatusBadGateway, "音频接口未返回可播放地址", true, result.Usage)
		return
	}
	recordID, recordErr := recordAudioTask(r.Context(), cfg, workspaceID, imageTaskDraft{
		Prompt: prompt, TaskID: taskID, Model: model, Size: format, Quality: "high",
		Status: "SUCCESS", ResultURL: audioURL, MediaType: "audio", IdempotencyKey: idempotencyKey,
	})
	if recordErr != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{
			"success": false, "submissionUnknown": true, "error": "音频已生成，但写入任务记录失败", "taskId": taskID, "audioUrl": audioURL, "usage": result.Usage,
		})
		return
	}
	body := map[string]any{
		"success": true, "taskId": taskID, "recordId": recordID, "model": model,
		"status": "SUCCESS", "audioUrl": audioURL, "prompt": prompt,
	}
	if result.Usage != nil {
		body["usage"] = result.Usage
		settleAudioUsage(r, cfg, taskID, recordID, result.Usage)
	}
	httpx.WriteJSON(w, http.StatusOK, body)
}

func recordAudioTask(ctx context.Context, cfg config.Config, workspace string, draft imageTaskDraft) (string, error) {
	db, err := openTaskDB(cfg)
	if err != nil {
		return "", err
	}
	defer db.Close()
	settlement, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	return insertImageTask(settlement, db, workspace, draft)
}

func settleAudioUsage(r *http.Request, cfg config.Config, taskID, recordID string, usage map[string]any) {
	ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 5*time.Second)
	defer cancel()
	rememberTaskUsage(ctx, cfg, taskScope{workspace: workspaceOf(r), media: "audio", recordID: recordID}, taskID, usage)
}

func rawFloat(payload map[string]json.RawMessage, key string) float64 {
	raw, ok := payload[key]
	if !ok {
		return 0
	}
	var number float64
	if json.Unmarshal(raw, &number) == nil {
		return number
	}
	var text string
	if json.Unmarshal(raw, &text) == nil {
		number, _ = strconv.ParseFloat(strings.TrimSpace(text), 64)
	}
	return number
}

func audioPoll(cfg config.Config, w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	taskID := strings.TrimSpace(query.Get("taskId"))
	taskKey := strings.TrimSpace(query.Get("taskKey"))

	if taskID == "" && taskKey == "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "缺少 taskId 或 taskKey 参数"})
		return
	}

	if len(taskKey) > 256 {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "任务标识无效"})
		return
	}
	if taskID == "" && taskKey != "" && query.Get("closeMissing") == "true" {
		if err := closeMissingAudioSubmission(cfg, r, taskKey); err != nil {
			httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{"success": false, "status": "QUERY_FAILED", "submissionUnknown": true, "error": "原音频操作暂时无法封闭，请继续核对原操作"})
			return
		}
	}

	if taskID != "" && !authorizeTaskPoll(cfg, w, r, "audio", taskID) {
		return
	}
	var pendingReceipt *submission.Receipt
	var receiptReadErr error
	if taskKey != "" {
		receipt, err := submission.Read(r.Context(), cfg.SQLiteFile(), workspaceOf(r), "audio", taskKey)
		receiptReadErr = err
		if err == nil {
			if receipt.Status != 0 {
				submission.Reply(w, receipt)
				return
			}
			pendingReceipt = &receipt
		}
	}
	db, err := openTaskDB(cfg)
	if err != nil {
		httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{"success": false, "status": "QUERY_FAILED", "retryable": true, "error": "音频任务记录暂时无法查询"})
		return
	}
	defer db.Close()

	if taskID != "" {
		status, result, reason, usage, ok, err := taskStatus(r.Context(), db, scopeOf(r, "audio"), taskID)
		if err == nil && ok {
			body := map[string]any{
				"success":    true,
				"status":     status,
				"resultUrl":  result,
				"audioUrl":   result,
				"failReason": reason,
			}
			if status == "QUERY_FAILED" {
				body["submissionUnknown"] = true
				body["error"] = reason
			}
			putStoredUsage(body, usage)
			httpx.WriteJSON(w, http.StatusOK, body)
			return
		}
		if err != nil {
			httpx.WriteJSON(w, 503, map[string]any{"success": false, "status": "QUERY_FAILED", "submissionUnknown": true, "error": "音频任务记录暂时无法查询"})
			return
		}
	}

	if taskKey != "" {
		var id, result, status, reason string
		err := db.QueryRowContext(r.Context(), `
			SELECT COALESCE("taskId",''), COALESCE("resultUrl",''), "status", COALESCE("failReason",'') FROM "ImageTask"
			WHERE "workspaceId" = ? AND "idempotencyKey" = ? AND "mediaType" = 'audio'
			ORDER BY "createdAt" DESC LIMIT 1`, workspaceOf(r), taskKey).Scan(&id, &result, &status, &reason)
		if err == nil && id != "" {
			body := map[string]any{
				"success":   true,
				"taskId":    id,
				"status":    status,
				"resultUrl": result,
				"audioUrl":  result, "failReason": reason,
			}
			if status == "QUERY_FAILED" {
				body["submissionUnknown"] = true
				body["error"] = reason
			}
			putStoredUsage(body, readTaskUsage(r.Context(), db, scopeOf(r, "audio"), id))
			httpx.WriteJSON(w, http.StatusOK, body)
			return
		}
		if err != nil && err != sql.ErrNoRows {
			httpx.WriteJSON(w, 503, map[string]any{"success": false, "status": "QUERY_FAILED", "submissionUnknown": true, "error": "音频操作暂时无法核对"})
			return
		}
	}
	if receiptReadErr != nil && !errors.Is(receiptReadErr, submission.ErrNotFound) {
		httpx.WriteJSON(w, 503, map[string]any{"success": false, "status": "QUERY_FAILED", "submissionUnknown": true, "error": "音频操作回执暂时无法核对"})
		return
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"status": "QUERY_FAILED", "submissionUnknown": pendingReceipt != nil,
		"retryable": true, "error": "未找到已确认的音频结果，请查询原操作；不会重新提交",
	})
}

func audioCredentials(cfg config.Config, r *http.Request, payload map[string]json.RawMessage) (string, string) {
	clientBase := rawString(payload, "customBaseUrl")
	if clientBase == "" {
		clientBase = strings.TrimSpace(r.Header.Get("x-custom-base-url"))
	}
	base := ImageDefaultBase()
	if clientBase != "" {
		base = gateway.NormalizeGatewayBaseURL(clientBase)
	}

	apiKey := rawString(payload, "customApiKey")
	if apiKey == "" {
		apiKey = strings.TrimSpace(r.Header.Get("x-custom-api-key"))
	}
	if apiKey == "" && !cfg.Production() {
		apiKey = strings.TrimSpace(os.Getenv("AI_AUDIO_API_KEY"))
		if apiKey == "" {
			apiKey = strings.TrimSpace(os.Getenv("AI_API_KEY"))
		}
	}

	return base, apiKey
}
