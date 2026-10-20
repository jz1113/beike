package ppt

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/httpx"
)

// PptDetail handles generating detailed per-page layout and content descriptions
func PptDetail(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 8<<20))
		if err != nil || !json.Valid(body) {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "无效的 JSON 请求"})
			return
		}
		var payload map[string]any
		if json.Unmarshal(body, &payload) != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "JSON 解析失败"})
			return
		}

		var ok bool
		r, ok = generate.BindTextProtocol(w, r, payload)
		if !ok {
			return
		}
		rawPages, _ := payload["outlinePages"].([]any)
		if len(rawPages) == 0 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "大纲页面列表不能为空"})
			return
		}

		detailLevel := strings.TrimSpace(generate.StringField(payload, "detailLevel"))
		if detailLevel == "" {
			detailLevel = "default"
		}
		language := strings.TrimSpace(generate.StringField(payload, "language"))
		if language == "" {
			language = "zh"
		}

		model := strings.TrimSpace(generate.StringField(payload, "model"))
		if model == "" {
			model = "gemini-3.7-flash"
		}
		base, key := resolvePptCredentials(cfg, r, payload, model)

		if key != "" && base != "" {
			systemPrompt := "你是一位顶级 UI/UX 演示设计师。请将大纲逐页展开为字段严格解耦的页面描述（页面文字、配图与素材、版式与重点、演讲者备注）。'页面文字'中的字句将被逐字渲染在画面中，严禁包含任何设计说明。"
			outlineBytes, _ := json.Marshal(rawPages)
			layoutHint := ""
			if strings.TrimSpace(generate.StringField(payload, "renderMode")) == "layout" {
				layoutHint = "另外为可编辑排版补充 layoutType（cover、bullets、split、quote、metrics 之一）、bullets（字符串数组）和 imagePrompt（仅描述配图，不要包含标题文字）。"
			}
			userPrompt := fmt.Sprintf("大纲列表：\n%s\n\n详略程度要求：%s，语言：%s。\n请只输出 JSON 对象 {\"pages\":[...]}，每项包含：pageIndex, title, contentText, visualAssets, layoutEmphasis, speakerNotes。%s", string(outlineBytes), detailLevel, language, layoutHint)

			messages := []any{
				map[string]any{"role": "system", "content": systemPrompt},
				map[string]any{"role": "user", "content": userPrompt},
			}

			text, usageData, status, err := generate.ChatCompletionJSON(r.Context(), base, key, model, messages, 0.3, 120*time.Second)
			if err == nil && status < 300 && strings.TrimSpace(text) != "" {
				details := parseDetailPages(text)
				if len(details) > 0 {
					body := map[string]any{
						"success":      true,
						"details":      details,
						"fromFallback": false,
						"model":        model,
					}
					if usage := generate.NormalizeUsage(usageData); usage != nil {
						body["usage"] = usage
					}
					httpx.WriteJSON(w, http.StatusOK, body)
					return
				}
			}
		}

		if !wantsFallback(payload) || !generate.TextFallbackAllowed(r.Context(), model) {
			httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"success": false, "error": "页面编排模型调用失败，请检查模型与密钥后重试"})
			return
		}
		fallbackDetails := generateFallbackDetails(rawPages)
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"success":      true,
			"details":      fallbackDetails,
			"fromFallback": true,
		})
	})
}

func generateFallbackDetails(rawPages []any) []map[string]any {
	var details []map[string]any
	for idx, item := range rawPages {
		pageMap, ok := item.(map[string]any)
		if !ok {
			continue
		}
		pageIndex := idx + 1
		title, _ := pageMap["title"].(string)
		if title == "" {
			title = fmt.Sprintf("核心论断第 %d 页", pageIndex)
		}

		pointsRaw, _ := pageMap["points"].([]any)
		var points []string
		for _, p := range pointsRaw {
			if s, ok := p.(string); ok && strings.TrimSpace(s) != "" {
				points = append(points, strings.TrimSpace(s))
			}
		}

		var contentText, visualAssets, layoutEmphasis, speakerNotes string
		if pageIndex == 1 {
			// 封面页保持极简大气
			contentText = fmt.Sprintf("# %s\n\n%s", title, strings.Join(points, "\n"))
			visualAssets = "极简高质感微渐变光晕背景，无杂乱插画"
			layoutEmphasis = "居中对称排版，主标题大字报视觉聚焦，呼吸感微光漫反射"
			speakerNotes = "开场致辞，简述本次分享的背景与预期核心产出。"
		} else {
			pointsBlock := ""
			for _, pt := range points {
				pointsBlock += fmt.Sprintf("• %s\n", pt)
			}
			contentText = fmt.Sprintf("## %s\n\n%s", title, pointsBlock)
			visualAssets = "高精度科技感数据图表或具象业务架构示意图，线条锐利清晰"
			layoutEmphasis = "经典左文右图卡片布局，左侧论断标题与数据加粗高亮，右侧视觉焦点呼应"
			speakerNotes = fmt.Sprintf("深入拆解【%s】背后的逻辑与关键论据，结合实际业务场景延展。", title)
		}

		details = append(details, map[string]any{
			"pageIndex":      pageIndex,
			"title":          title,
			"contentText":    contentText,
			"visualAssets":   visualAssets,
			"layoutEmphasis": layoutEmphasis,
			"speakerNotes":   speakerNotes,
		})
	}
	return details
}

func parseDetailPages(text string) []map[string]any {
	if parsed := generate.DecodeObject(text); parsed != nil {
		if items, ok := parsed["pages"].([]any); ok {
			return detailMaps(items)
		}
	}
	cleaned := strings.TrimSpace(text)
	cleaned = strings.TrimPrefix(cleaned, "```json")
	cleaned = strings.TrimPrefix(cleaned, "```")
	cleaned = strings.TrimSuffix(cleaned, "```")
	cleaned = strings.TrimSpace(cleaned)
	var items []any
	if json.Unmarshal([]byte(cleaned), &items) == nil {
		return detailMaps(items)
	}
	start := strings.Index(cleaned, "[")
	end := strings.LastIndex(cleaned, "]")
	if start >= 0 && end > start && json.Unmarshal([]byte(cleaned[start:end+1]), &items) == nil {
		return detailMaps(items)
	}
	return nil
}

func detailMaps(items []any) []map[string]any {
	var details []map[string]any
	for _, it := range items {
		if m, ok := it.(map[string]any); ok {
			details = append(details, m)
		}
	}
	return details
}
