package videosales

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/httpx"
)

// ProductAnalysisResult represents structured commodity intelligence.
type ProductAnalysisResult struct {
	ProductName       string            `json:"productName"`
	Category          string            `json:"category"`
	Brand             string            `json:"brand,omitempty"`
	VisualFeatures    map[string]string `json:"visualFeatures"`
	SellingPoints     []string          `json:"sellingPoints"`
	TargetAudience    string            `json:"targetAudience"`
	UsageScenarios    []string          `json:"usageScenarios"`
	PainPoints        []string          `json:"painPoints"`
	VideoSuggestions  map[string]any    `json:"videoSuggestions"`
	KnownFacts        []string          `json:"knownFacts,omitempty"`
	CreativeNotes     []string          `json:"creativeNotes,omitempty"`
	CoveredImageCount int               `json:"coveredImageCount,omitempty"`
	ImageCount        int               `json:"imageCount,omitempty"`
	Degraded          bool              `json:"degraded,omitempty"`
}

// Analyze handles multimodal visual inspection of product pictures.
func Analyze(cfg config.Config) http.Handler {
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
		images := parseCatalog(payload)
		if workflowV3(payload) {
			images, err = workflowCatalog(payload)
			if err != nil {
				httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": err.Error()})
				return
			}
		}
		model := strings.TrimSpace(generate.StringField(payload, "model"))
		if model == "" {
			model = "gemini-2.5-flash"
		}
		base, key := resolveCredentials(cfg, r, payload)
		allowed, _ := payload["allowFallback"].(bool)
		if workflowV3(payload) || !generate.TextFallbackAllowed(r.Context(), model) {
			allowed = false
		}
		if len(images) == 0 || key == "" || base == "" {
			if !allowed {
				message := "请配置多模态模型地址和密钥"
				if len(images) == 0 {
					message = "请先确认至少一张商品图片"
				}
				httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": message})
				return
			}
		} else {
			parsed, raw, analyzeErr := runProductAnalysis(r.Context(), base, key, model, analysisFactsFrom(payload), images)
			if analyzeErr == nil && analysisReady(parsed) {
				parsed.CoveredImageCount = len(images)
				parsed.ImageCount = len(images)
				parsed.Degraded = false
				response := map[string]any{"success": true, "analysis": parsed, "model": model}
				if usage := generate.NormalizeUsage(raw); usage != nil {
					response["usage"] = usage
				}
				httpx.WriteJSON(w, http.StatusOK, response)
				return
			}
			if !allowed {
				message := "商品图片分析失败：请检查模型、协议与商品图片后重试"
				if analyzeErr != nil {
					message = analyzeErr.Error()
				}
				httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"success": false, "error": message})
				return
			}
		}
		fallback := fallbackAnalysis(generate.StringField(payload, "productName"), generate.StringField(payload, "category"))
		fallback.Degraded = true
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "analysis": fallback, "degraded": true})
	})
}

func fallbackAnalysis(productName, category string) ProductAnalysisResult {
	if strings.TrimSpace(category) == "" {
		category = "beauty"
	}
	name := strings.TrimSpace(productName)
	if name == "" {
		name = "品质优选好物"
	}
	return ProductAnalysisResult{
		ProductName: name,
		Category:    category,
		Brand:       "自主优选",
		VisualFeatures: map[string]string{
			"mainColor":   "自然原色与高纯度主色",
			"designStyle": "极简现代高级质感包装",
			"productForm": "便携规整易取用",
			"texture":     "细腻亲肤无毛刺",
		},
		SellingPoints:  []string{"精选核心原料，品质严苛把控", "高性价比工厂直发，无中间溢价", "即开即用，完美适配日常生活场景"},
		TargetAudience: "注重生活品质与性价比的新锐白领与年轻宝妈",
		UsageScenarios: []string{"日常居家生活", "通勤办公工位", "差旅随身便携"},
		PainPoints:     []string{"传统同类产品易损坏掉屑，体验感欠佳", "单价过高，长期使用消耗成本大"},
		VideoSuggestions: map[string]any{
			"recommendedAngles": []string{"正面微距推近", "45度俯拍生活摆放", "手部操作局部特写"},
			"keyVisuals":        []string{"材质纹理细节", "实际使用瞬间效果", "精致包装展示"},
			"suggestedStyle":    "痛点种草型",
		},
		CreativeNotes: []string{"以下内容是占位建议，不是商品事实"},
	}
}

func cleanJSONFence(text string) string {
	text = strings.TrimSpace(text)
	if strings.HasPrefix(text, "```json") {
		text = strings.TrimPrefix(text, "```json")
		text = strings.TrimSuffix(text, "```")
	} else if strings.HasPrefix(text, "```") {
		text = strings.TrimPrefix(text, "```")
		text = strings.TrimSuffix(text, "```")
	}
	return strings.TrimSpace(text)
}
