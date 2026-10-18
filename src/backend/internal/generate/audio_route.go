package generate

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/system"
)

// Audio handles audio generation (TTS / Music) endpoints.
func Audio(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			audioPoll(cfg, w, r)
			return
		}

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
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "音频生成文本不能为空"})
			return
		}

		model := strings.TrimSpace(rawString(payload, "model"))
		if model == "" {
			model = "speech-2.8-hd"
		}

		submitAudio(cfg, w, r, payload, model, prompt)
	})
}

func submitAudio(cfg config.Config, w http.ResponseWriter, r *http.Request, payload map[string]json.RawMessage, model, prompt string) {
	base, apiKey := audioCredentials(cfg, r, payload)
	format := strings.ToLower(rawString(payload, "format"))
	if format == "" {
		format = "mp3"
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
	fail := func(status int, message string) {
		_, _ = recordAudioTask(r.Context(), cfg, workspaceID, imageTaskDraft{
			Prompt: prompt, TaskID: taskID, Model: model, Size: format, Quality: "high",
			Status: "FAILED", FailReason: message, MediaType: "audio", IdempotencyKey: idempotencyKey,
		})
		httpx.WriteJSON(w, status, map[string]any{
			"success": false, "error": message, "taskId": taskID, "status": "FAILED", "retryable": status >= 500,
		})
	}
	if apiKey == "" || base == "" {
		fail(http.StatusBadRequest, "未配置音频接口。请前往「设置 → 服务接口配置」填入网关地址和密钥。")
		return
	}
	result, err := SynthesizeSpeech(r.Context(), SpeechRequest{
		Base: base, APIKey: apiKey, Model: model, Text: prompt, Voice: voice, Format: format, Speed: rawFloat(payload, "speed"), Volume: rawFloat(payload, "volume"),
	})
	if err != nil {
		fail(http.StatusBadGateway, err.Error())
		return
	}
	audioURL := result.RemoteURL
	if len(result.Bytes) > 0 {
		filename := taskID + "." + format
		localURL, publicURL, saveErr := SaveWorkspaceBytes(workspaceID, "audio", filename, result.ContentType, result.Bytes)
		if saveErr != nil && audioURL == "" {
			fail(http.StatusInternalServerError, "音频已生成，但保存失败")
			return
		}
		if publicURL != "" {
			audioURL = publicURL
		} else if localURL != "" {
			audioURL = localURL
		}
	}
	if audioURL == "" {
		fail(http.StatusBadGateway, "音频接口未返回可播放地址")
		return
	}
	recordID, recordErr := recordAudioTask(r.Context(), cfg, workspaceID, imageTaskDraft{
		Prompt: prompt, TaskID: taskID, Model: model, Size: format, Quality: "high",
		Status: "SUCCESS", ResultURL: audioURL, MediaType: "audio", IdempotencyKey: idempotencyKey,
	})
	if recordErr != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{
			"success": false, "error": "音频已生成，但写入任务记录失败", "taskId": taskID, "audioUrl": audioURL,
		})
		return
	}
	body := map[string]any{
		"success": true, "taskId": taskID, "recordId": recordID, "model": model,
		"status": "SUCCESS", "audioUrl": audioURL, "prompt": prompt,
	}
	if result.Usage != nil {
		body["usage"] = result.Usage
		rememberTaskUsage(r.Context(), cfg, taskID, result.Usage)
	}
	httpx.WriteJSON(w, http.StatusOK, body)
}

func recordAudioTask(ctx context.Context, cfg config.Config, workspace string, draft imageTaskDraft) (string, error) {
	db, err := openTaskDB(cfg)
	if err != nil {
		return "", err
	}
	defer db.Close()
	return insertImageTask(ctx, db, workspace, draft)
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

	db, err := openTaskDB(cfg)
	if err != nil {
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"status": "IN_PROGRESS", "retryable": true})
		return
	}
	defer db.Close()

	if taskID != "" {
		status, result, reason, usage, ok, err := taskStatus(r.Context(), db, taskID)
		if err == nil && ok {
			body := map[string]any{
				"success":    true,
				"status":     status,
				"resultUrl":  result,
				"audioUrl":   result,
				"failReason": reason,
			}
			putStoredUsage(body, usage)
			httpx.WriteJSON(w, http.StatusOK, body)
			return
		}
	}

	if taskKey != "" {
		var id, result, status string
		err := db.QueryRowContext(r.Context(), `
			SELECT "taskId", "resultUrl", "status" FROM "ImageTask"
			WHERE "idempotencyKey" = ? AND "mediaType" = 'audio'
			ORDER BY "createdAt" DESC LIMIT 1`, taskKey).Scan(&id, &result, &status)
		if err == nil && id != "" {
			body := map[string]any{
				"success":   true,
				"taskId":    id,
				"status":    status,
				"resultUrl": result,
				"audioUrl":  result,
			}
			putStoredUsage(body, readTaskUsage(r.Context(), db, id))
			httpx.WriteJSON(w, http.StatusOK, body)
			return
		}
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"status":    "IN_PROGRESS",
		"retryable": true,
	})
}

func audioCredentials(cfg config.Config, r *http.Request, payload map[string]json.RawMessage) (string, string) {
	clientBase := rawString(payload, "customBaseUrl")
	if clientBase == "" {
		clientBase = strings.TrimSpace(r.Header.Get("x-custom-base-url"))
	}
	base := ImageDefaultBase()
	if clientBase != "" {
		base = system.NormalizeGatewayBaseURL(clientBase)
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
