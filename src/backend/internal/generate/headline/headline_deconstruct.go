package headline

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/httpx"
)

// HeadlineDeconstruct 处理优质封面样张的多模态深度反推拆解（支持单图与多图群组反推）
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
			model = "gemini-3.7-flash"
		}
		if len(imagesRaw) > 10 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "一次最多反推 10 张封面"})
			return
		}
		if message := generate.HeadlineAccessError(cfg, r, payload, "未配置视觉多模态分析模型的 API Key"); message != "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": message})
			return
		}

		base, key := headlineCredentials(cfg, r, payload, model)
		images, message := headlineImages(r, imagesRaw)
		if message != "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "样张图片读取失败，请检查链接或网络"})
			return
		}

		title := strings.TrimSpace(generate.StringField(payload, "title"))
		sampleID := coverID("sample")
		workspace := httpx.WorkspaceFrom(r)
		if db, ok := openCoverDB(cfg); ok {
			if err := insertCoverSample(r.Context(), db, workspace, sampleID, title, model, images); err != nil {
				sampleID = ""
			}
			db.Close()
		} else {
			sampleID = ""
		}
		prompt := coverDeconstructPrompt(len(images))
		content := []any{map[string]any{"type": "text", "text": prompt}}
		for _, img := range images {
			content = append(content, map[string]any{"type": "image_url", "image_url": map[string]any{"url": img}})
		}

		text, usageData, status, err := generate.ChatCompletionJSON(r.Context(), base, key, model, []any{map[string]any{"role": "user", "content": content}}, 0.2, 120*time.Second)
		if err != nil || status >= 300 || strings.TrimSpace(text) == "" {
			markCoverSample(r, cfg, workspace, sampleID, "failed", "", headlineErrorText(err, status, "反推分析模型响应异常"))
			code := headlineFailure(err, status)
			httpx.WriteJSON(w, code, map[string]any{"success": false, "error": headlineErrorText(err, status, "反推分析模型响应异常")})
			return
		}

		parsed := generate.DecodeObject(text)
		if parsed == nil {
			markCoverSample(r, cfg, workspace, sampleID, "failed", "", "反推模型未返回合法 JSON 特征")
			httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"success": false, "error": "反推模型未返回合法 JSON 特征"})
			return
		}

		raw, _ := json.Marshal(parsed)
		entries := entriesFromDeconstruction(sampleID, parsed)
		markCoverSample(r, cfg, workspace, sampleID, "completed", string(raw), "")
		if db, ok := openCoverDB(cfg); ok && sampleID != "" {
			_ = insertCoverEntries(r.Context(), db, workspace, entries)
			db.Close()
		}
		parsed["sampleCount"] = len(images)
		parsed["sampleId"] = sampleID
		response := map[string]any{
			"success": true,
			"data":    parsed,
			"entries": entries,
			"model":   model,
		}
		if usage := generate.NormalizeUsage(usageData); usage != nil {
			response["usage"] = usage
		}
		httpx.WriteJSON(w, http.StatusOK, response)
	})
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
	_ = finishCoverSample(r.Context(), db, workspace, id, status, deconstruction, errText)
}
