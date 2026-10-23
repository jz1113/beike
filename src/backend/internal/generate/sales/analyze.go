package sales

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
		images, err := workflowCatalog(payload)
		if err != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": err.Error()})
			return
		}
		model := strings.TrimSpace(generate.StringField(payload, "model"))
		if model == "" {
			model = "gemini-2.5-flash"
		}
		base, key := resolveCredentials(cfg, r, payload)
		if key == "" || base == "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请配置多模态模型地址和密钥"})
			return
		}
		parsed, raw, analyzeErr := runProductAnalysis(r.Context(), base, key, model, analysisFactsFrom(payload), images)
		if analyzeErr != nil || !analysisReady(parsed) {
			message := "商品图片分析失败：请检查模型、协议与商品图片后重试"
			if analyzeErr != nil {
				message = analyzeErr.Error()
			}
			httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"success": false, "error": message})
			return
		}
		parsed.CoveredImageCount = len(images)
		parsed.ImageCount = len(images)
		parsed.Degraded = false
		response := map[string]any{"success": true, "analysis": parsed, "model": model}
		if usage := generate.NormalizeUsage(raw); usage != nil {
			response["usage"] = usage
		}
		httpx.WriteJSON(w, http.StatusOK, response)
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
