package sales

import (
	"context"
	"fmt"
	"maps"
	"regexp"
	"strconv"
	"time"

	"beike.local/cloud/src/backend/internal/generate"
)

const maxRecoveryTokens = 32768

const compactJSONRules = "仅输出一份紧凑的完整 JSON，不输出解释、Markdown、缩进或重复商品资料。精简重复修饰和重复约束，但不得省略必需字段、分镜、素材、商品事实、准确时长或完整口播。"

// One completed but truncated answer can be regenerated. Transport failures,
// timeouts and other ambiguous outcomes must never replay a paid request.
func completeSalesJSON(ctx context.Context, base, key string, body map[string]any, timeout time.Duration) (string, map[string]any, int, error) {
	if timeout <= 0 {
		timeout = chatWait
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	request := maps.Clone(body)
	budget := generate.IntField(request, "max_tokens")
	if budget <= 0 {
		budget = longOutputTokens
		request["max_tokens"] = budget
	}
	recovered, clamped := false, false
	usage := map[string]any{}
	for {
		if err := ctx.Err(); err != nil {
			return "", nil, 0, err
		}
		text, raw, status, err := generate.ChatCompletionPayload(ctx, base, key, request, timeout)
		addSalesUsage(usage, raw)
		if err != nil {
			// Only an explicit output-parameter rejection proves no generation ran.
			if !clamped && (status == 400 || status == 422) {
				if limit := salesOutputLimit(raw); limit > 0 && limit < budget {
					budget, clamped = limit, true
					request["max_tokens"] = budget
					continue
				}
			}
			return "", salesUsageResult(raw, usage), status, err
		}
		cleaned := cleanJSONFence(text)
		if chatFinishReason(raw) == "length" {
			// A closed object still goes through the caller's complete domain validation.
			if object, ok := scriptJSONObject(cleaned); ok {
				return string(object), salesUsageResult(raw, usage), status, nil
			}
			if recovered {
				return "", salesUsageResult(raw, usage), status, errTruncatedOutput
			}
			recovered = true
			if !clamped {
				budget = min(max(budget*2, longOutputTokens), maxRecoveryTokens)
				request["max_tokens"] = budget
			}
			// Restart from the original facts instead of splicing broken JSON or
			// sending incomplete assistant messages to native thinking protocols.
			request = salesRecoveryBody(request)
			continue
		}
		if cleaned == "" {
			return "", salesUsageResult(raw, usage), status, fmt.Errorf("模型没有返回内容")
		}
		return cleaned, salesUsageResult(raw, usage), status, nil
	}
}

func salesRecoveryBody(body map[string]any) map[string]any {
	out := maps.Clone(body)
	var messages []any
	switch original := body["messages"].(type) {
	case []map[string]any:
		for _, message := range original {
			messages = append(messages, message)
		}
	case []any:
		messages = append(messages, original...)
	}
	messages = append(messages, map[string]any{"role": "user", "content": "上次响应因输出额度耗尽而未完成。请根据原始请求重新输出整个 JSON，不要续写残片。" + compactJSONRules})
	out["messages"] = messages
	return out
}

// Match output limits only, never a generic context/window or input-token error.
var salesOutputLimitPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)(?:max_tokens|max_completion_tokens|max_output_tokens|maxOutputTokens)[\s\S]{0,160}?(?:at most|maximum(?:\s+(?:allowed|value))?(?:\s+is)?|less than or equal to|<=)\s*[:=]?\s*(\d+)`),
	regexp.MustCompile(`(?i)(?:supports?\s+at most|maximum(?:\s+number\s+of)?)\s+(\d+)\s+(?:completion|output)\s+tokens`),
	regexp.MustCompile(`(?i)(?:max_tokens|max_completion_tokens|max_output_tokens|maxOutputTokens)[\s\S]{0,100}?range\s*[:=]?\s*\[\s*\d+\s*,\s*(\d+)\s*\]`),
}

func salesOutputLimit(raw map[string]any) int {
	upstream, _ := raw["error"].(map[string]any)
	message, _ := upstream["message"].(string)
	for _, pattern := range salesOutputLimitPatterns {
		if match := pattern.FindStringSubmatch(message); len(match) == 2 {
			limit, err := strconv.Atoi(match[1])
			if err == nil && limit > 0 && limit <= maxRecoveryTokens {
				return limit
			}
		}
	}
	return 0
}

func addSalesUsage(total, raw map[string]any) {
	for key, value := range generate.NormalizeUsage(raw) {
		number, _ := value.(float64)
		previous, _ := total[key].(float64)
		total[key] = previous + number
	}
}

func salesUsageResult(raw, usage map[string]any) map[string]any {
	if len(usage) == 0 {
		return raw
	}
	out := maps.Clone(raw)
	if out == nil {
		out = map[string]any{}
	}
	out["usage"] = maps.Clone(usage)
	return out
}
