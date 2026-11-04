package sales

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"

	"beike.local/cloud/src/backend/internal/gateway"
)

type summaryPoint struct {
	Feature    string   `json:"feature"`
	Benefit    string   `json:"benefit"`
	Expression string   `json:"expression"`
	Sources    []string `json:"sources"`
}
type summaryResult struct {
	Summary          string         `json:"summary"`
	Points           []summaryPoint `json:"points"`
	Copy             string         `json:"copy"`
	Conflicts        []string       `json:"conflicts"`
	Questions        []string       `json:"questions"`
	Cautions         []string       `json:"cautions"`
	CopyPointIndexes []int          `json:"copyPointIndexes"`
}

func boundedText(value string, max int, required bool) bool {
	return utf8.RuneCountInString(value) <= max && (!required || strings.TrimSpace(value) != "")
}

func validateSummaryInput(body summaryRequest) string {
	if !boundedText(body.Model, 200, true) {
		return "请选择卖点提炼模型"
	}
	if len(body.CustomBaseURL) > 8192 || len(body.CustomAPIKey) > 8192 || (body.APIFormat != "" && body.APIFormat != "openai-responses") {
		return "模型渠道配置无效"
	}
	sources := summaryOCRTextSources(body.summaryInput)
	if !boundedText(body.ProductFacts, 20000, false) {
		return "商品资料超过 20000 字"
	}
	if len(sources) == 0 && strings.TrimSpace(body.ProductFacts) == "" {
		return "请先识别图片文字，再提炼卖点"
	}
	total := 0
	seen := map[int]bool{}
	for _, source := range sources {
		if source.Index < 0 || source.Index > 99_999 || seen[source.Index] {
			return "OCR 文字来源编号无效或重复"
		}
		seen[source.Index] = true
		if !boundedText(source.Text, 40_000, true) {
			return "单份 OCR 文字需在 40000 字以内且不能为空"
		}
		total += utf8.RuneCountInString(source.Text)
	}
	if total > 60_000 {
		return "OCR 文字合计超过 60000 字，请精简文字后重试"
	}
	return ""
}

func parseSummaryCompletion(data map[string]any, input summaryInput) (summaryResult, error) {
	fail := errors.New("返回结构不完整、来源无效或文案缺失")
	choices, _ := data["choices"].([]any)
	if len(choices) == 0 {
		return summaryResult{}, fail
	}
	choice, _ := choices[0].(map[string]any)
	message, _ := choice["message"].(map[string]any)
	finish, _ := choice["finish_reason"].(string)
	text, _ := message["content"].(string)
	if finish == "length" {
		return summaryResult{}, errors.New("模型输出达到长度上限，未接收被截断的文案")
	}
	if finish == "content_filter" {
		return summaryResult{}, errors.New("模型返回内容被渠道安全策略拦截")
	}
	if finish != "stop" || message["refusal"] != nil && message["refusal"] != "" {
		return summaryResult{}, fail
	}
	object := gateway.DecodeObject(text)
	if object == nil {
		return summaryResult{}, errors.New("模型返回的正文不是合法 JSON")
	}
	raw, _ := json.Marshal(object)
	var result summaryResult
	if object == nil || json.Unmarshal(raw, &result) != nil {
		return result, fail
	}
	if !boundedText(result.Summary, 1000, true) || !boundedText(result.Copy, 4000, len(result.Points) > 0) || len(result.Points) > 6 || len(result.Conflicts) > 6 || len(result.Questions) > 3 || len(result.Cautions) > 6 {
		return result, fail
	}
	if len(result.Points) == 0 && len(result.Questions) == 0 {
		return result, fail
	}
	if err := validateSummaryCopyPoints(result); err != nil {
		return result, err
	}
	sources := map[string]bool{"product-meta": strings.TrimSpace(input.ProductFacts) != ""}
	for _, source := range summaryOCRTextSources(input) {
		sources[fmt.Sprintf("ocr-%d", source.Index+1)] = true
	}
	for _, point := range result.Points {
		if !boundedText(point.Feature, 1000, true) || !boundedText(point.Benefit, 1000, true) || !boundedText(point.Expression, 1000, true) || len(point.Sources) == 0 || len(point.Sources) > 16 {
			return result, fail
		}
		for _, source := range point.Sources {
			if !sources[source] {
				return result, fail
			}
		}
	}
	for _, items := range [][]string{result.Conflicts, result.Questions, result.Cautions} {
		for _, item := range items {
			if !boundedText(item, 1000, true) {
				return result, fail
			}
		}
	}
	if result.Points == nil {
		result.Points = []summaryPoint{}
	}
	if result.Conflicts == nil {
		result.Conflicts = []string{}
	}
	if result.Questions == nil {
		result.Questions = []string{}
	}
	if result.Cautions == nil {
		result.Cautions = []string{}
	}
	if result.CopyPointIndexes == nil {
		result.CopyPointIndexes = []int{}
	}
	if err := reviewSummaryResult(&result, input); err != nil {
		return result, err
	}
	return result, nil
}
