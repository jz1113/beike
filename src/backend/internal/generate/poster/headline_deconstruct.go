package poster

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/httpx"
)

// HeadlineDeconstruct 用视觉模型反推一张封面，结果先进入待确认。
func HeadlineDeconstruct(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 16<<20))
		if err != nil || len(bytes.TrimSpace(body)) == 0 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求数据格式异常"})
			return
		}
		var payload map[string]any
		if json.Unmarshal(body, &payload) != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求数据格式异常"})
			return
		}
		var protocolOK bool
		r, protocolOK = generate.BindTextProtocol(w, r, payload)
		if !protocolOK {
			return
		}
		imagesRaw := generate.StringListField(payload, "imageUrls")
		if len(imagesRaw) == 0 {
			singleUrl, _ := payload["imageUrl"].(string)
			if strings.TrimSpace(singleUrl) != "" {
				imagesRaw = []string{strings.TrimSpace(singleUrl)}
			}
		}
		if len(imagesRaw) == 0 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "未提供待反推的封面图片"})
			return
		}

		model := strings.TrimSpace(generate.StringField(payload, "model"))
		if model == "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请选择已同步且能读取图片的反推模型"})
			return
		}
		if len(imagesRaw) != 1 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "一次反推一张封面"})
			return
		}
		effort, effortOK := coverReasoningEffort(payload)
		if !effortOK {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "不支持的思考强度"})
			return
		}
		if message := generate.HeadlineAccessError(cfg, r, payload, "未配置视觉多模态分析模型的 API Key"); message != "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": message})
			return
		}

		requestKey, validKey := coverRequestKey(payload)
		if !validKey {
			httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": "投喂标识需要 8 到 128 个字符"})
			return
		}
		base, key := headlineCredentials(cfg, r, payload, model)
		title := strings.TrimSpace(generate.StringField(payload, "title"))
		workspace := httpx.WorkspaceFrom(r)
		db, ok := openCoverDB(cfg)
		if !ok {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "封面记忆数据库不可用，未调用反推模型"})
			return
		}
		defer db.Close()
		hash := coverFeedHash(imagesRaw, model, title, effort, generate.StringField(payload, "textProtocol"), base)
		operation, claimed, err := beginCoverFeed(r.Context(), db, workspace, requestKey, title, model, hash, imagesRaw)
		if err != nil {
			if errors.Is(err, errCoverRequestMismatch) {
				httpx.WriteJSON(w, 409, map[string]any{"success": false, "error": errCoverRequestMismatch.Error()})
			} else {
				httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "投喂登记失败，未调用反推模型；请核对原请求"})
			}
			return
		}
		if !claimed {
			replayCoverFeed(w, operation)
			return
		}
		sampleID := operation.ID
		// The persisted operation survives a lost browser response and can be reconciled without another paid call.
		ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 150*time.Second)
		defer cancel()
		r = r.WithContext(ctx)
		defer func() {
			cleanup, stop := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
			defer stop()
			_, _ = db.ExecContext(cleanup, `UPDATE "CoverMemorySample" SET "status"='failed',"error"='反推未完成，请核对后重试',"updatedAt"=? WHERE "id"=? AND "workspaceId"=? AND "status"='running'`, coverNow(), sampleID, workspace)
		}()
		images, message := headlineImages(cfg, r, imagesRaw)
		if message != "" {
			markCoverSample(r, cfg, workspace, sampleID, "failed", "", "样张图片读取失败，请检查链接或网络")
			httpx.WriteJSON(w, 400, map[string]any{"success": false, "sampleId": sampleID, "error": "样张图片读取失败，请检查链接或网络"})
			return
		}

		prompt := coverDeconstructPrompt()
		content := []any{map[string]any{"type": "text", "text": prompt}}
		for _, img := range images {
			content = append(content, map[string]any{"type": "image_url", "image_url": map[string]any{"url": img}})
		}

		text, usageData, status, err := generate.ChatCompletionJSONWithEffort(r.Context(), base, key, model, []any{map[string]any{"role": "user", "content": content}}, 0.2, 120*time.Second, effort)
		if err != nil || status >= 300 || strings.TrimSpace(text) == "" {
			markCoverSample(r, cfg, workspace, sampleID, "failed", "", headlineErrorText(err, status, "反推分析模型响应异常"))
			code := headlineFailure(err, status)
			httpx.WriteJSON(w, code, map[string]any{"success": false, "sampleId": sampleID, "error": headlineErrorText(err, status, "反推分析模型响应异常")})
			return
		}

		parsed := generate.DecodeObject(text)
		if parsed == nil {
			markCoverSample(r, cfg, workspace, sampleID, "failed", "", "反推模型未返回合法 JSON 特征")
			httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"success": false, "error": "反推模型未返回合法 JSON 特征"})
			return
		}

		entries := entriesFromDeconstruction(sampleID, parsed)
		if len(entries) == 0 {
			markCoverSample(r, cfg, workspace, sampleID, "failed", "", "反推结果没有可保存的特点")
			httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"success": false, "error": "反推结果没有可保存的特点"})
			return
		}
		raw, _ := json.Marshal(parsed)
		if err := saveCoverDeconstruction(r.Context(), db, workspace, sampleID, string(raw), entries); err != nil {
			markCoverSample(r, cfg, workspace, sampleID, "failed", "", "反推结果没有写入封面记忆，请先刷新核对，不要重复投喂")
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "反推结果没有写入封面记忆，请先刷新核对，不要重复投喂"})
			return
		}
		parsed["sampleCount"] = len(images)
		parsed["sampleId"] = sampleID
		response := map[string]any{
			"success":  true,
			"data":     parsed,
			"entries":  entries,
			"model":    model,
			"sampleId": sampleID,
		}
		if usage := generate.NormalizeUsage(usageData); usage != nil {
			response["usage"] = usage
		}
		httpx.WriteJSON(w, http.StatusOK, response)
	})
}

func coverReasoningEffort(payload map[string]any) (string, bool) {
	raw, exists := payload["reasoningEffort"]
	if !exists || raw == nil {
		return "", true
	}
	text, ok := raw.(string)
	if !ok {
		return "", false
	}
	effort := strings.ToLower(strings.TrimSpace(text))
	if effort == "" {
		return "", true
	}
	switch effort {
	case "low", "medium", "high", "xhigh", "max":
		return effort, true
	default:
		return "", false
	}
}

func markCoverSample(r *http.Request, cfg config.Config, workspace, id, status, deconstruction, errText string) {
	if id == "" {
		return
	}
	db, ok := openCoverDB(cfg)
	if !ok {
		return
	}
	defer db.Close()
	ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 5*time.Second)
	defer cancel()
	_ = finishCoverSample(ctx, db, workspace, id, status, deconstruction, errText)
}
