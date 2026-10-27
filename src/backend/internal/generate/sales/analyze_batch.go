package sales

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/generate"
)

const visionBatchSize = 4

var productAnalysisTimeout = chatWait

type analysisError struct {
	Stage  string
	Batch  int
	Total  int
	Status int
	Err    error
}

func (e *analysisError) Unwrap() error { return e.Err }

func (e *analysisError) Error() string {
	reason := analysisFailureReason(e.Status, e.Err)
	switch {
	case e.Stage == "summarize":
		return "商品分析汇总失败：" + reason
	case e.Total > 1:
		return fmt.Sprintf("第 %d/%d 批商品图片分析失败：%s", e.Batch, e.Total, reason)
	default:
		return "商品图片分析失败：" + reason
	}
}

func analysisCallError(stage string, batch, total, status int, err error) error {
	if err == nil {
		err = errors.New("模型调用失败")
	}
	return &analysisError{Stage: stage, Batch: batch, Total: total, Status: status, Err: err}
}

func analysisFailureReason(status int, err error) string {
	var image *gateway.TextImageError
	if errors.As(err, &image) {
		reason := imageFailureReason(image)
		var indexed *gateway.IndexedImageError
		if errors.As(err, &indexed) {
			return fmt.Sprintf("图片编号 %d %s", indexed.Index, reason)
		}
		return reason
	}
	if errors.Is(err, errTruncatedOutput) {
		return errTruncatedOutput.Error()
	}
	if errors.Is(err, errInvalidSalesJSON) {
		return "没有返回有效 JSON（JSON 不完整或语法错误）"
	}
	if errors.Is(err, context.Canceled) && !errors.Is(err, context.DeadlineExceeded) {
		return "已取消"
	}
	if errors.Is(err, context.DeadlineExceeded) || status == 408 || status == 504 {
		return "本次等待已结束，上游可能仍在生成并已计费，不要立刻再次提交"
	}
	switch status {
	case 401, 403:
		return "鉴权失败，请检查模型密钥和协议配置"
	case 429:
		return "触发限流，请稍后重试"
	}
	if status >= 500 {
		return fmt.Sprintf("服务暂不可用（HTTP %d）", status)
	}
	if status >= 400 {
		return fmt.Sprintf("拒绝了本次请求（HTTP %d）", status)
	}
	text := ""
	if err != nil {
		text = err.Error()
	}
	switch {
	case strings.Contains(text, "有效 JSON") || strings.Contains(text, "valid JSON") || strings.Contains(text, "JSON object"):
		return "没有返回有效 JSON"
	case strings.Contains(text, "可用卖点"):
		return "没有返回可用卖点"
	case strings.Contains(text, "没有返回内容"):
		return "没有返回内容"
	default:
		return "请检查模型、协议与商品图片后重试"
	}
}

func imageFailureReason(err *gateway.TextImageError) string {
	switch err.Kind {
	case "download":
		return "无法下载"
	case "status":
		return fmt.Sprintf("下载失败（HTTP %d）", err.Status)
	case "mime", "mismatch":
		return "格式不受支持"
	case "size":
		return "大小超出限制"
	default:
		return "内容无效"
	}
}

type analysisFacts struct {
	Name        string
	Brand       string
	Category    string
	Color       string
	Description string
}

func analysisFactsFrom(payload map[string]any) analysisFacts {
	category := strings.TrimSpace(generate.StringField(payload, "category"))
	return analysisFacts{
		Name:        strings.TrimSpace(generate.StringField(payload, "productName")),
		Brand:       strings.TrimSpace(generate.StringField(payload, "brand")),
		Category:    category,
		Color:       strings.TrimSpace(generate.StringField(payload, "selectedColor")),
		Description: strings.TrimSpace(generate.StringField(payload, "productDescription")),
	}
}

func analysisReady(parsed ProductAnalysisResult) bool {
	if strings.TrimSpace(parsed.ProductName) == "" {
		return false
	}
	for _, point := range parsed.SellingPoints {
		if strings.TrimSpace(point) != "" {
			return true
		}
	}
	return false
}

func chunkImages(images []CatalogImage, size int) [][]CatalogImage {
	if size <= 0 {
		size = visionBatchSize
	}
	batches := make([][]CatalogImage, 0, (len(images)+size-1)/size)
	for start := 0; start < len(images); start += size {
		end := start + size
		if end > len(images) {
			end = len(images)
		}
		batches = append(batches, images[start:end])
	}
	return batches
}

func runProductAnalysis(ctx context.Context, base, key, model string, facts analysisFacts, images []CatalogImage) (ProductAnalysisResult, map[string]any, error) {
	batches := chunkImages(images, visionBatchSize)
	parts := make([]ProductAnalysisResult, 0, len(batches))
	var raw map[string]any
	usage := map[string]any{}
	for index, batch := range batches {
		content, nextRaw, status, err := postChatJSON(ctx, base, key, analyzeChatBody(model, facts, batch, index+1, len(batches)), productAnalysisTimeout)
		if err != nil || status < 200 || status >= 300 {
			return ProductAnalysisResult{}, nil, analysisCallError("analyze", index+1, len(batches), status, err)
		}
		parsed, decodeErr := decodeAnalysis(content)
		if decodeErr != nil {
			return ProductAnalysisResult{}, nil, analysisCallError("analyze", index+1, len(batches), 0, decodeErr)
		}
		parts = append(parts, parsed)
		raw = nextRaw
		addSalesUsage(usage, nextRaw)
	}
	if len(parts) == 1 {
		return parts[0], salesUsageResult(raw, usage), nil
	}
	encoded, err := json.Marshal(parts)
	if err != nil {
		return ProductAnalysisResult{}, nil, analysisCallError("summarize", 0, len(batches), 0, errors.New("商品分析没有返回有效 JSON"))
	}
	content, nextRaw, status, err := postChatJSON(ctx, base, key, summarizeAnalysisBody(model, facts, string(encoded)), productAnalysisTimeout)
	if err != nil || status < 200 || status >= 300 {
		return ProductAnalysisResult{}, nil, analysisCallError("summarize", 0, len(batches), status, err)
	}
	parsed, decodeErr := decodeAnalysis(content)
	if decodeErr != nil {
		return ProductAnalysisResult{}, nil, analysisCallError("summarize", 0, len(batches), 0, decodeErr)
	}
	addSalesUsage(usage, nextRaw)
	return parsed, salesUsageResult(nextRaw, usage), nil
}

func decodeAnalysis(content string) (ProductAnalysisResult, error) {
	var parsed ProductAnalysisResult
	if json.Unmarshal([]byte(content), &parsed) != nil {
		return ProductAnalysisResult{}, errors.New("商品分析没有返回有效 JSON")
	}
	if !analysisReady(parsed) {
		return ProductAnalysisResult{}, errors.New("商品分析没有返回可用卖点")
	}
	return parsed, nil
}

func analysisFactText(facts analysisFacts) string {
	color := "未确认"
	if facts.Color != "" {
		color = facts.Color
	}
	return fmt.Sprintf("商品名称：%s\n品牌：%s\n品类：%s\n本次确认颜色：%s\n已有资料：%s",
		facts.Name, facts.Brand, facts.Category, color, facts.Description)
}

func analyzeChatBody(model string, facts analysisFacts, images []CatalogImage, batch, total int) map[string]any {
	text := fmt.Sprintf("%s\n这是第 %d 批图片，共 %d 批。只根据这些图片、本次确认颜色和已有资料总结。已知事实写入 knownFacts，拍摄建议写入 creativeNotes。不要把其他颜色写成当前商品外观，不要提取或写入价格、金额或优惠，不要编造功效、评价、销量、实测结果或促销。%s",
		analysisFactText(facts), batch, total, analysisJSONShape(facts.Category))
	return withLongOutput(chatBody(model, analysisSystemPrompt(facts.Category), visionParts(text, images), 0.2))
}

func summarizeAnalysisBody(model string, facts analysisFacts, partials string) map[string]any {
	text := fmt.Sprintf("%s\n下面是分批图片分析，请合并成一份。重复卖点只留一次，互相矛盾时保留更具体、能对应图片和本次确认颜色的说法。不要新增任何一批里都没有的功效、评价或优惠。%s\n分批结果：%s",
		analysisFactText(facts), analysisJSONShape(facts.Category), partials)
	return withLongOutput(chatBody(model, analysisSummaryPrompt(facts.Category), text, 0.2))
}

func analysisSystemPrompt(category string) string {
	return salesSkillInstructions("analyze") + "\n当前执行商品图片分析，只输出约定结构的 JSON 对象。"
}

func analysisSummaryPrompt(category string) string {
	return salesSkillInstructions("analyze") + "\n当前合并已完成的分批图片分析，只输出约定结构的 JSON 对象。"
}

func analysisJSONShape(category string) string {
	points := "能说出口的穿着场合或搭配"
	return `输出格式：{"productName":"","category":"","brand":"","visualFeatures":{"mainColor":"","designStyle":"","productForm":"","texture":""},"sellingPoints":["` + points + `"],"targetAudience":"","usageScenarios":["场景"],"painPoints":["痛点"],"knownFacts":["资料或图片中可见的事实"],"creativeNotes":["拍摄建议，不是商品事实"],"videoSuggestions":{"recommendedAngles":["角度"],"keyVisuals":["焦点"],"suggestedStyle":""}}`
}

func chatBody(model, system string, user any, temperature float64) map[string]any {
	return map[string]any{
		"model": model,
		"messages": []map[string]any{
			{"role": "system", "content": system + "\n" + compactJSONRules},
			{"role": "user", "content": user},
		},
		"temperature":     temperature,
		"response_format": map[string]string{"type": "json_object"},
	}
}
