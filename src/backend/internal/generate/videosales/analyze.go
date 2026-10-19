package videosales

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
	"beike.local/cloud/src/backend/internal/system"
)

// ProductAnalysisResult represents structured commodity intelligence
type ProductAnalysisResult struct {
	ProductName      string            `json:"productName"`
	Category         string            `json:"category"`
	Brand            string            `json:"brand,omitempty"`
	VisualFeatures   map[string]string `json:"visualFeatures"`
	SellingPoints    []string          `json:"sellingPoints"`
	TargetAudience   string            `json:"targetAudience"`
	UsageScenarios   []string          `json:"usageScenarios"`
	PainPoints       []string          `json:"painPoints"`
	VideoSuggestions map[string]any    `json:"videoSuggestions"`
}

// Analyze handles multimodal visual inspection of product pictures
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

		productName := strings.TrimSpace(generate.StringField(payload, "productName"))
		category := strings.TrimSpace(generate.StringField(payload, "category"))
		if category == "" {
			category = "beauty"
		}
		var imageUrls []string
		if rawImgs, ok := payload["imageUrls"].([]any); ok {
			for _, item := range rawImgs {
				if s, ok := item.(string); ok && strings.TrimSpace(s) != "" {
					imageUrls = append(imageUrls, strings.TrimSpace(s))
				}
			}
		}

		model := strings.TrimSpace(generate.StringField(payload, "model"))
		if model == "" {
			model = "gemini-2.5-flash"
		}
		base, key := resolveCredentials(cfg, r, payload)

		if key != "" && base != "" && len(imageUrls) > 0 {
			systemPrompt := `你是一位资深电商选品总监与短视频编导。请仔细分析提供的商品图片与信息，提取商品视觉特征、核心卖点、目标受众、使用痛点与短视频拍摄切入点。
必须严格输出纯 JSON 对象，格式如下：
{
  "productName": "商品名称",
  "category": "品类代码",
  "brand": "品牌名",
  "visualFeatures": {
    "mainColor": "主色调",
    "designStyle": "包装风格",
    "productForm": "形态质地",
    "texture": "材质触感"
  },
  "sellingPoints": ["卖点1", "卖点2", "卖点3"],
  "targetAudience": "核心目标客群描述",
  "usageScenarios": ["场景1", "场景2"],
  "painPoints": ["痛点1", "痛点2"],
  "videoSuggestions": {
    "recommendedAngles": ["镜头角度1", "镜头角度2"],
    "keyVisuals": ["视觉焦点1", "视觉焦点2"],
    "suggestedStyle": "推荐视频风格"
  }
}`
			userPrompt := fmt.Sprintf("分析商品：%s，品类：%s。请结合图片细节深入解构。", productName, category)

			type contentPart struct {
				Type     string `json:"type"`
				Text     string `json:"text,omitempty"`
				ImageURL *struct {
					URL string `json:"url"`
				} `json:"image_url,omitempty"`
			}
			parts := []contentPart{{Type: "text", Text: userPrompt}}
			for _, u := range imageUrls {
				parts = append(parts, contentPart{
					Type: "image_url",
					ImageURL: &struct {
						URL string `json:"url"`
					}{URL: u},
				})
			}

			reqBody := map[string]any{
				"model": model,
				"messages": []map[string]any{
					{"role": "system", "content": systemPrompt},
					{"role": "user", "content": parts},
				},
				"temperature":     0.3,
				"response_format": map[string]string{"type": "json_object"},
			}
			status, respBytes, err := generate.PostModel(r.Context(), http.MethodPost, system.ChatCompletionsURL(base), key, reqBody, 45*time.Second)
			if err == nil && status >= 200 && status < 300 {
				var chatResp struct {
					Choices []struct {
						Message struct {
							Content string `json:"content"`
						} `json:"message"`
					} `json:"choices"`
				}
				var raw map[string]any
				if json.Unmarshal(respBytes, &chatResp) == nil && json.Unmarshal(respBytes, &raw) == nil && len(chatResp.Choices) > 0 {
					var parsed ProductAnalysisResult
					content := cleanJSONFence(chatResp.Choices[0].Message.Content)
					if json.Unmarshal([]byte(content), &parsed) == nil {
						body := map[string]any{"success": true, "analysis": parsed, "model": model}
						if usage := generate.NormalizeUsage(raw); usage != nil {
							body["usage"] = usage
						}
						httpx.WriteJSON(w, http.StatusOK, body)
						return
					}
				}
			}
		}

		if allowed, _ := payload["allowFallback"].(bool); !allowed {
			httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"success": false, "error": "商品分析模型调用失败，请检查模型与密钥后重试"})
			return
		}
		fallbackName := productName
		if fallbackName == "" {
			fallbackName = "品质优选好物"
		}
		fallback := ProductAnalysisResult{
			ProductName: fallbackName,
			Category:    category,
			Brand:       "自主优选",
			VisualFeatures: map[string]string{
				"mainColor":   "自然原色与高纯度主色",
				"designStyle": "极简现代高级质感包装",
				"productForm": "便携规整易取用",
				"texture":     "细腻亲肤无毛刺",
			},
			SellingPoints: []string{
				"精选核心原料，品质严苛把控",
				"高性价比工厂直发，无中间溢价",
				"即开即用，完美适配日常生活场景",
			},
			TargetAudience: "注重生活品质与性价比的新锐白领与年轻宝妈",
			UsageScenarios: []string{"日常居家生活", "通勤办公工位", "差旅随身便携"},
			PainPoints: []string{
				"传统同类产品易损坏掉屑，体验感欠佳",
				"单价过高，长期使用消耗成本大",
			},
			VideoSuggestions: map[string]any{
				"recommendedAngles": []string{"正面微距推近", "45度俯拍生活摆放", "手部操作局部特写"},
				"keyVisuals":        []string{"材质纹理细节", "实际使用瞬间效果", "精致包装展示"},
				"suggestedStyle":    "痛点种草型",
			},
		}

		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"success":  true,
			"analysis": fallback,
		})
	})
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
