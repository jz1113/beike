package ppt

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/httpx"
)

// PptOutline handles generation and Vibe-refinement of assertion-evidence slide outlines
func PptOutline(cfg config.Config) http.Handler {
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

		ideaPrompt := strings.TrimSpace(generate.StringField(payload, "ideaPrompt"))
		outlineText := strings.TrimSpace(generate.StringField(payload, "outlineText"))
		userRequirement := strings.TrimSpace(generate.StringField(payload, "userRequirement"))
		language := strings.TrimSpace(generate.StringField(payload, "language"))
		if language == "" {
			language = "zh"
		}

		// Check if upstream AI service is configured
		model := strings.TrimSpace(generate.StringField(payload, "model"))
		if model == "" {
			model = "gemini-3.7-flash"
		}
		base, key := resolvePptCredentials(cfg, r, payload, model)

		if key != "" && base != "" {
			var systemPrompt, userPrompt string
			if userRequirement != "" {
				// Vibe 口头修改已有大纲
				currentOutlineJSON, _ := json.Marshal(payload["currentOutline"])
				systemPrompt = "你是一位顶级演示文稿架构师。请根据用户提出的口头修改意见，精准调整现存的大纲，保持其余未修改页面结构与论断逻辑稳定。"
				userPrompt = fmt.Sprintf("当前大纲：\n%s\n\n用户修改指令：\n%s\n\n请按标准 Markdown 输出修改后的完整大纲（## 页面标题，- 要点）。", string(currentOutlineJSON), userRequirement)
			} else {
				// 新生成论断式大纲
				systemPrompt = "你是一位顶级演示文稿架构师与麦肯锡级商业顾问。请生成一份符合论断式（assertion-evidence）要求的 PPT 大纲。正文页标题必须是一句笃定的论断结论，紧跟 2~4 条论据数据要点。"
				inputDesc := ideaPrompt
				if outlineText != "" {
					inputDesc = "用户已有素材/大纲：\n" + outlineText
				}
				if inputDesc == "" {
					inputDesc = "商业演示文稿"
				}
				userPrompt = fmt.Sprintf("主题或资料：\n%s\n\n语言要求：%s。请使用 Markdown 格式直接输出大纲：以 ## 页面标题 引导，下方用 - 列表书写论据要点；若章节较多可用 # Part 1: 分区。", inputDesc, language)
			}

			messages := []any{
				map[string]any{"role": "system", "content": systemPrompt},
				map[string]any{"role": "user", "content": userPrompt},
			}

			text, usageData, status, err := generate.ChatCompletion(r.Context(), base, key, model, messages, 0.4, 90*time.Second)
			if err == nil && status < 300 && strings.TrimSpace(text) != "" {
				pages := parseMarkdownOutline(text)
				if len(pages) > 0 {
					body := map[string]any{
						"success":      true,
						"markdown":     text,
						"pages":        pages,
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

		if !wantsFallback(payload) {
			httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"success": false, "error": "大纲模型调用失败，请检查模型与密钥后重试"})
			return
		}
		fallbackMarkdown, fallbackPages := generateFallbackOutline(ideaPrompt, outlineText, userRequirement)
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"success":      true,
			"markdown":     fallbackMarkdown,
			"pages":        fallbackPages,
			"fromFallback": true,
		})
	})
}

func parseMarkdownOutline(md string) []map[string]any {
	lines := strings.Split(md, "\n")
	var pages []map[string]any
	var currentPart string
	var currentPage map[string]any
	var currentPoints []string
	pageIdx := 1

	flushPage := func() {
		if currentPage != nil {
			currentPage["points"] = currentPoints
			pages = append(pages, currentPage)
			currentPage = nil
			currentPoints = nil
		}
	}

	for _, raw := range lines {
		line := strings.TrimSpace(raw)
		if line == "" {
			continue
		}
		if strings.HasPrefix(line, "# ") {
			currentPart = strings.TrimSpace(strings.TrimPrefix(line, "# "))
		} else if strings.HasPrefix(line, "## ") {
			flushPage()
			title := strings.TrimSpace(strings.TrimPrefix(line, "## "))
			// Clean up any trailing numbers
			title = regexp.MustCompile(`^第\s*\d+\s*页[：:]\s*`).ReplaceAllString(title, "")
			page := map[string]any{
				"pageIndex": pageIdx,
				"title":     title,
				"takeaway":  title,
				"part":      currentPart,
			}
			pageIdx++
			currentPage = page
			currentPoints = []string{}
		} else if strings.HasPrefix(line, "- ") || strings.HasPrefix(line, "* ") || strings.HasPrefix(line, "• ") {
			point := strings.TrimSpace(regexp.MustCompile(`^[-*•]\s+`).ReplaceAllString(line, ""))
			if currentPage != nil {
				currentPoints = append(currentPoints, point)
			}
		}
	}
	flushPage()
	return pages
}

func generateFallbackOutline(idea, outline, vibe string) (string, []map[string]any) {
	topic := idea
	if topic == "" && outline != "" {
		lines := strings.Split(outline, "\n")
		if len(lines) > 0 {
			topic = strings.TrimSpace(lines[0])
		}
	}
	if topic == "" {
		topic = "智能商业演示与方案"
	}
	topic = strings.Trim(topic, "#- \t\r\n")

	md := fmt.Sprintf(`## %s：战略洞察与执行方案
- 副标题：数据驱动的高效增长引擎
- 演讲人：贝壳云图方案组

# Part 1: 市场洞察与破局挑战
## 存量竞争加剧倒逼生产力工具全面智能化重构
- 传统人工协同排版成本高，改版周期达 3~5 个工作日
- 核心指标：内容产出效率亟需提升 300%% 以上

## 用户心智迁移：从被动阅读转向场景化交互
- 超过 72%% 的商业客户更信赖具象可视化案例而非纯文本描述
- 跨端跨屏自适应呈现成为行业基线标准

# Part 2: 核心方案与落地路径
## 端到端多模态排版实现视觉语义零损耗表达
- 结构化论断式大纲保证商业汇报重点 100%% 触达
- 视觉大模型生成超高清原生幻灯片，排版美学自动平衡

## 闭环落地：全格式导出与敏捷口语化音视频交付
- 支持高保真 PPTX、多图层可编辑文件与标准 PDF 秒级交付
- 一键合成多音色配音与双语字幕解说视频`, topic)

	pages := parseMarkdownOutline(md)
	return md, pages
}
