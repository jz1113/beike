package ppt

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/httpx"
)

// PptNarration handles generating natural spoken scripts for slide decks
func PptNarration(cfg config.Config) http.Handler {
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
		rawPages, _ := payload["pages"].([]any)
		if len(rawPages) == 0 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "页面列表不能为空"})
			return
		}

		speakerPersona := strings.TrimSpace(generate.StringField(payload, "speakerPersona"))
		if speakerPersona == "" {
			speakerPersona = "专业且富有激情的行业演说家"
		}
		tone := strings.TrimSpace(generate.StringField(payload, "tone"))
		if tone == "" {
			tone = "生动自然、口语化、逻辑严密"
		}

		model := strings.TrimSpace(generate.StringField(payload, "model"))
		if model == "" {
			model = "gemini-3.7-flash"
		}
		base, key := resolvePptCredentials(cfg, r, payload, model)

		if key != "" && base != "" {
			pagesContent := ""
			for _, p := range rawPages {
				if pm, ok := p.(map[string]any); ok {
					idx, _ := pm["pageIndex"].(float64)
					title, _ := pm["title"].(string)
					content, _ := pm["contentText"].(string)
					pagesContent += fmt.Sprintf("【第 %d 页 - %s】\n%s\n\n", int(idx), title, content)
				}
			}

			userPrompt := fmt.Sprintf(`请为以下 PPT 逐页撰写自然的口播讲解词（旁白）。
人设：%s
基调：%s

【PPT 内容】：
%s

要求：
1. 口语化流畅，每页控制在 80~150 字之间；
2. 严格使用 === SLIDE [页码] === 分割每页旁白。`, speakerPersona, tone, pagesContent)

			messages := []any{
				map[string]any{"role": "user", "content": userPrompt},
			}

			text, usageData, status, err := generate.ChatCompletion(r.Context(), base, key, model, messages, 0.4, 90*time.Second)
			if err == nil && status < 300 && strings.TrimSpace(text) != "" {
				parsed := parseNarrationSlides(text)
				if len(parsed) > 0 {
					body := map[string]any{
						"success":      true,
						"narrations":   parsed,
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
			httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"success": false, "error": "讲稿模型调用失败，请检查模型与密钥后重试"})
			return
		}
		fallbackNarrations := make(map[string]string)
		for _, p := range rawPages {
			if pm, ok := p.(map[string]any); ok {
				idx, _ := pm["pageIndex"].(float64)
				title, _ := pm["title"].(string)
				pageStr := strconv.Itoa(int(idx))
				if int(idx) == 1 {
					fallbackNarrations[pageStr] = fmt.Sprintf("大家好，非常荣幸向大家汇报本次主题——《%s》。接下来我将从市场洞察、核心方案与落地路径三个维度为大家展开分享。", title)
				} else {
					fallbackNarrations[pageStr] = fmt.Sprintf("我们现在看到的是这一页的核心结论：%s。通过底层数据分析与场景验证，我们可以清楚看到这一模式带来了显著的效率突破与增长空间。", title)
				}
			}
		}

		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"success":      true,
			"narrations":   fallbackNarrations,
			"fromFallback": true,
		})
	})
}

func parseNarrationSlides(text string) map[string]string {
	result := make(map[string]string)
	sections := regexp.MustCompile(`===\s*SLIDE\s+(\d+)\s*===`).FindAllStringSubmatchIndex(text, -1)
	if len(sections) == 0 {
		return result
	}

	for i := 0; i < len(sections); i++ {
		match := sections[i]
		pageStr := text[match[2]:match[3]]
		startPos := match[1]
		endPos := len(text)
		if i+1 < len(sections) {
			endPos = sections[i+1][0]
		}
		script := strings.TrimSpace(text[startPos:endPos])
		result[pageStr] = script
	}
	return result
}
