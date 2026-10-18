package ppt

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/httpx"
)

// PptSlide handles generation and inpainting of single slide images
func PptSlide(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 16<<20))
		if err != nil || !json.Valid(body) {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "无效的 JSON 请求"})
			return
		}
		var payload map[string]any
		if json.Unmarshal(body, &payload) != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "JSON 解析失败"})
			return
		}

		pageIndex := int(generate.IntField(payload, "pageIndex"))
		if pageIndex <= 0 {
			pageIndex = 1
		}
		pageDesc := strings.TrimSpace(generate.StringField(payload, "pageDesc"))
		outlineTitle := strings.TrimSpace(generate.StringField(payload, "outlineTitle"))
		aspectRatio := strings.TrimSpace(generate.StringField(payload, "aspectRatio"))
		if aspectRatio == "" {
			aspectRatio = "16:9"
		}
		editInstruction := strings.TrimSpace(generate.StringField(payload, "editInstruction"))
		originalImageUrl := strings.TrimSpace(generate.StringField(payload, "originalImageUrl"))

		versionID := generateVersionID()

		// 编译生成 Prompt
		var visualPrompt string
		if strings.TrimSpace(generate.StringField(payload, "renderMode")) == "layout" {
			visualPrompt = fmt.Sprintf("生成一张不含标题和正文的演示配图，比例 %s。画面要求：%s", aspectRatio, pageDesc)
		} else if editInstruction != "" && originalImageUrl != "" {
			// 局部框选/修改模式
			visualPrompt = fmt.Sprintf("根据以下指令修改这张PPT页面：%s。保持原有的内容结构、字体质感和设计风格，只按照指令对指定目标进行精确重绘修改。", editInstruction)
		} else {
			// 全量生成模式
			templateStyle := strings.TrimSpace(generate.StringField(payload, "pageStyleText"))
			styleGuideline := "- 配色方案和设计质感保持高雅克制，遵循专业商业演示标准。"
			if templateStyle != "" {
				styleGuideline = fmt.Sprintf("- 必须严格遵循以下视觉风格：%s", templateStyle)
			}
			coverNote := ""
			if pageIndex == 1 {
				coverNote = "- 当前为 PPT 封面页，主标题必须极其醒目突出，采用震撼且大气的封面构图。"
			}

			visualPrompt = fmt.Sprintf(`你是一位顶级 UI/UX 演示设计师，正在生成一张 4K 极清、排版极佳的 PPT 幻灯片原图。
当前页面主题：%s
页面描述与排版要求：
%s

设计准则：
- 画面比例为 %s，生成 4K 极清分辨率，保证文字锐利清晰。
%s
- 根据内容自动设计构图，不重不漏地渲染核心文本内容，信息主次分明。
%s`, outlineTitle, pageDesc, aspectRatio, styleGuideline, coverNote)
		}

		// 尝试调用已配置的模型网关生图
		model := strings.TrimSpace(generate.StringField(payload, "modelId"))
		if model == "" {
			model = "nano-banana-pro"
		}
		base, key := resolvePptCredentials(cfg, r, payload, model)

		if key != "" && base != "" {
			resultURL, err := generate.GenerateImageURL(r.Context(), base, key, model, visualPrompt, aspectRatioToSize(aspectRatio))
			if err == nil && resultURL != "" {
				httpx.WriteJSON(w, http.StatusOK, map[string]any{
					"success":   true,
					"versionId": versionID,
					"url":       resultURL,
					"prompt":    visualPrompt,
					"isMock":    false,
				})
				return
			}
			if !wantsFallback(payload) {
				message := "幻灯片生图失败"
				if err != nil {
					message = err.Error()
				}
				httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"success": false, "error": message})
				return
			}
		} else if !wantsFallback(payload) {
			httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"success": false, "error": "未配置生图模型或密钥，请到设置中同步后再试"})
			return
		}

		mockURL := generateMockSlideSVG(pageIndex, outlineTitle, pageDesc, aspectRatio)
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"success":   true,
			"versionId": versionID,
			"url":       mockURL,
			"prompt":    visualPrompt,
			"isMock":    true,
		})
	})
}

func aspectRatioToSize(ratio string) string {
	switch ratio {
	case "4:3":
		return "1024x768"
	case "3:4":
		return "768x1024"
	case "9:16":
		return "768x1366"
	case "16:9":
		fallthrough
	default:
		return "1920x1080"
	}
}

func generateVersionID() string {
	var buf [8]byte
	_, _ = rand.Read(buf[:])
	return "ver_" + hex.EncodeToString(buf[:])
}

func generateMockSlideSVG(pageIndex int, title, desc, ratio string) string {
	if title == "" {
		title = fmt.Sprintf("演示文稿第 %d 页", pageIndex)
	}
	bgColor := "#0F172A"
	accentColor := "#6366F1"
	if pageIndex == 1 {
		bgColor = "#090D16"
		accentColor = "#F59E0B"
	}
	title = xmlText(title)
	desc = xmlText(desc)

	svg := fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs>
    <radialGradient id="grad" cx="50%%" cy="50%%" r="60%%">
      <stop offset="0%%" stop-color="%s" stop-opacity="0.35"/>
      <stop offset="100%%" stop-color="%s" stop-opacity="1"/>
    </radialGradient>
  </defs>
  <rect width="1920" height="1080" fill="%s"/>
  <rect width="1920" height="1080" fill="url(#grad)"/>
  
  <circle cx="960" cy="540" r="420" fill="none" stroke="%s" stroke-width="1.5" stroke-opacity="0.2" stroke-dasharray="8 8"/>
  <circle cx="960" cy="540" r="280" fill="none" stroke="%s" stroke-width="1.5" stroke-opacity="0.3"/>

  <text x="160" y="240" fill="#94A3B8" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="28" font-weight="600" letter-spacing="4">SLIDE 0%d / 16:9 4K PRESENTATION</text>
  <text x="160" y="340" fill="#FFFFFF" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="64" font-weight="800">%s</text>
  
  <rect x="160" y="420" width="1600" height="2" fill="%s" fill-opacity="0.4"/>
  <foreignObject x="160" y="460" width="1600" height="480">
    <div xmlns="http://www.w3.org/1999/xhtml" style="color: #CBD5E1; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 32px; line-height: 1.6; white-space: pre-wrap;">
      %s
    </div>
  </foreignObject>
  
  <text x="1760" y="1000" fill="#64748B" font-family="sans-serif" font-size="22" text-anchor="end">BEIKE CLOUD GRAPH • VIBE PPT</text>
</svg>`, accentColor, bgColor, bgColor, accentColor, accentColor, pageIndex, title, accentColor, desc)

	return "data:image/svg+xml;utf8," + strings.ReplaceAll(strings.ReplaceAll(svg, "#", "%23"), "\n", " ")
}

func xmlText(value string) string {
	return strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;", "'", "&apos;").Replace(value)
}
