package videosales

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/httpx"
)

// ScriptShot matches frontend shot contract
type ScriptShot struct {
	ShotId          int               `json:"shotId"`
	Type            string            `json:"type"`
	Duration        int               `json:"duration"`
	Description     string            `json:"description"`
	Camera          string            `json:"camera"`
	VisualSource    string            `json:"visualSource"`
	Transition      string            `json:"transition"`
	Voiceover       string            `json:"voiceover"`
	Prompt          string            `json:"prompt,omitempty"`
	ImageIndex      int               `json:"imageIndex"`
	SelectionReason string            `json:"selectionReason,omitempty"`
	Motion          string            `json:"motion,omitempty"`
	TextOverlay     map[string]string `json:"textOverlay,omitempty"`
}

// ScriptSEO matches frontend seo contract
type ScriptSEO struct {
	Title            string   `json:"title"`
	Hashtags         []string `json:"hashtags"`
	CoverText        string   `json:"coverText"`
	InteractionGuide string   `json:"interactionGuide"`
	Description      string   `json:"description"`
}

// SalesScript represents a full script with shots
type SalesScript struct {
	ID            string         `json:"id"`
	Title         string         `json:"title"`
	Beat          string         `json:"beat,omitempty"`
	FullPrompt    string         `json:"fullPrompt,omitempty"`
	TotalDuration int            `json:"totalDuration"`
	Shots         []ScriptShot   `json:"shots"`
	SEO           ScriptSEO      `json:"seo"`
	DeliveryMode  string         `json:"deliveryMode,omitempty"`
	Assets        []PlannedAsset `json:"assets,omitempty"`
}

// Script handles e-commerce short video script generation
func Script(cfg config.Config) http.Handler {
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

		var protocolOK bool
		r, protocolOK = generate.BindTextProtocol(w, r, payload)
		if !protocolOK {
			return
		}
		if err := checkWorkflowVersion(payload); err != nil {
			workflowError(w, 400, err)
			return
		}
		if workflowV3(payload) {
			handleWorkflowScript(w, r, cfg, payload)
			return
		}
		productName := strings.TrimSpace(generate.StringField(payload, "productName"))
		if productName == "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "商品名称不能为空"})
			return
		}
		category := strings.TrimSpace(generate.StringField(payload, "category"))
		if category == "" {
			category = "beauty"
		}
		videoMode := strings.TrimSpace(generate.StringField(payload, "videoMode"))
		if videoMode == "" {
			videoMode = "product_closeup"
		}
		productDesc := strings.TrimSpace(generate.StringField(payload, "productDescription"))
		analysisText := strings.TrimSpace(generate.StringField(payload, "productAnalysis"))

		model := strings.TrimSpace(generate.StringField(payload, "model"))
		if model == "" {
			model = "gemini-2.5-flash"
		}
		base, key := resolveCredentials(cfg, r, payload)

		if key != "" && base != "" {
			content, raw, status, err := postChatJSON(r.Context(), base, key, scriptChatBody(model, payload, productName, category, videoMode, productDesc, analysisText), chatWait)
			if errors.Is(err, errTruncatedOutput) {
				httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"success": false, "error": errTruncatedOutput.Error()})
				return
			}
			if err == nil && status >= 200 && status < 300 {
				var parsed struct {
					Scripts []SalesScript `json:"scripts"`
				}
				if json.Unmarshal([]byte(content), &parsed) == nil && len(parsed.Scripts) > 0 {
					script := normalizeScript(parsed.Scripts[0])
					if category == "fashion" {
						script.Beat = normalizeFashionBeat(script.Beat, productName)
					}
					if !scriptReady(script) {
						httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"success": false, "error": "脚本缺少可用分镜或提示词"})
						return
					}
					body := map[string]any{"success": true, "scripts": []SalesScript{script}, "model": model}
					if usage := generate.NormalizeUsage(raw); usage != nil {
						body["usage"] = usage
					}
					httpx.WriteJSON(w, http.StatusOK, body)
					return
				}
			}
		}

		if allowed, _ := payload["allowFallback"].(bool); !allowed || !generate.TextFallbackAllowed(r.Context(), model) {
			httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"success": false, "error": "脚本模型调用失败，请检查模型与密钥后重试"})
			return
		}
		scripts := generateFallbackScripts(productName)
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"success": true,
			"scripts": scripts,
		})
	})
}

func generateFallbackScripts(productName string) []SalesScript {
	return []SalesScript{
		{
			ID:            "script_1",
			Title:         "直击痛点·强力种草方案",
			TotalDuration: 21,
			Shots: []ScriptShot{
				{
					ShotId:       1,
					Type:         "hook",
					Duration:     3,
					Description:  "痛点瞬间特写镜头微晃，直接击中日常痛点场景",
					Camera:       "微距推近",
					VisualSource: "ai_generate",
					Transition:   "direct_concat",
					Voiceover:    fmt.Sprintf("天天遇到这种麻烦事，你是不是也在忍？直到我发现了%s！", productName),
					Prompt:       "Handheld natural POV camera entering scene with messy problem, dramatic lighting, high tension",
				},
				{
					ShotId:       2,
					Type:         "pain_point",
					Duration:     4,
					Description:  "展示使用普通低劣竞品的尴尬与劣质体验对比",
					Camera:       "俯拍特写",
					VisualSource: "ai_generate",
					Transition:   "ffmpeg_fade",
					Voiceover:    "普通的动不动就出问题，费时又费力，白白浪费好多钱！",
					Prompt:       "Close up of cheap generic product breaking and failing during everyday usage, disappointed mood",
				},
				{
					ShotId:       3,
					Type:         "product_reveal",
					Duration:     4,
					Description:  "商品纯白底保真亮相，高光勾勒轮廓与高级质感",
					Camera:       "缓慢推近",
					VisualSource: "product_image",
					Motion:       "zoom_in_slow",
					Transition:   "ai_start_end",
					Voiceover:    fmt.Sprintf("这才是真正的实力派！%s，品质完全不在一个档次！", productName),
					TextOverlay:  map[string]string{"text": "实力升级·品质之选", "style": "title"},
				},
				{
					ShotId:       4,
					Type:         "demo",
					Duration:     6,
					Description:  "真实场景上手使用实测，动作流畅自然，效果立竿见影",
					Camera:       "平移跟拍",
					VisualSource: "ai_generate",
					Transition:   "ai_start_end",
					Voiceover:    "看看这个实测表现，操作顺手效果惊艳，用一次就彻底离不开了！",
					Prompt:       "Hands holding and naturally using the item in bright modern domestic setup, flawless outcome",
				},
				{
					ShotId:       5,
					Type:         "cta",
					Duration:     4,
					Description:  "整套包装展示叠加限时优惠价格标签，引导立即下单",
					Camera:       "固定特写",
					VisualSource: "product_image",
					Motion:       "static",
					Transition:   "direct_concat",
					Voiceover:    "今天店铺限时特惠，手慢无货，赶快点击下方小黄车带回家！",
					TextOverlay:  map[string]string{"text": "限时特惠·马上抢", "style": "price"},
				},
			},
			SEO: ScriptSEO{
				Title:            fmt.Sprintf("别再踩坑了！这才是%s的正确打开方式", productName),
				Hashtags:         []string{"#好物推荐", fmt.Sprintf("#%s", productName), "#测评种草", "#提升幸福感好物"},
				CoverText:        "别再买错了！",
				InteractionGuide: "你平时最头疼的是哪一点？评论区留言告诉我！",
				Description:      fmt.Sprintf("后悔没有早点入手的神仙单品，实测效果惊艳，看完这期直接闭眼入！#%s", productName),
			},
		},
	}
}
