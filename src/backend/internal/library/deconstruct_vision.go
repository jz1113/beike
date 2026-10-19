package library

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/system"
)

type visionOutcome struct {
	Text  string
	Model string
	Fail  map[string]any
	Code  int
}

func callDeconstructVision(ctx context.Context, baseURL, apiKey, model string, images []string, prompt string) visionOutcome {
	body := map[string]any{
		"model":           model,
		"messages":        []any{map[string]any{"role": "user", "content": visionContent(prompt, images)}},
		"temperature":     0.2,
		"max_tokens":      8192,
		"response_format": map[string]any{"type": "json_object"},
	}
	raw, _ := json.Marshal(body)
	endpoint := system.ChatCompletionsURL(baseURL)
	reqCtx, cancel := context.WithTimeout(ctx, 240*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(reqCtx, http.MethodPost, endpoint, bytes.NewReader(raw))
	if err != nil {
		return visionFailure("视觉网关地址无效", false, false)
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+apiKey)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return visionFailure(err.Error(), true, false)
	}
	defer response.Body.Close()
	payload, _ := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	if response.StatusCode == http.StatusTooManyRequests {
		if strings.Contains(strings.ToLower(string(payload)), "quota") || strings.Contains(string(payload), "余额") {
			return visionFailure("上游账户余额或配额不足，等待或切换模型都不能解决；请检查当前 API Key 对应账户。", false, true)
		}
		return visionFailure("上游分组当前繁忙，原任务没有自动重试。请等待当前调用完成后再手动重试，避免重复计费。", false, false)
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return visionFailure("HTTP "+strconv.Itoa(response.StatusCode)+": "+truncate(string(payload), 200), response.StatusCode >= 500, false)
	}
	var parsed struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if json.Unmarshal(payload, &parsed) != nil || len(parsed.Choices) == 0 || strings.TrimSpace(parsed.Choices[0].Message.Content) == "" {
		return visionFailure("模型 "+model+" 返回空内容", false, false)
	}
	return visionOutcome{Text: parsed.Choices[0].Message.Content, Model: model}
}

func visionContent(prompt string, images []string) []any {
	content := []any{map[string]any{"type": "text", "text": prompt}}
	for _, image := range images {
		content = append(content, map[string]any{"type": "image_url", "image_url": map[string]any{"url": image}})
	}
	return content
}

func visionFailure(message string, unreachable, quota bool) visionOutcome {
	status := http.StatusBadGateway
	errorText := "视觉模型解构失败，请检查模型配置或稍后重试"
	if quota {
		status = http.StatusTooManyRequests
		errorText = message
	} else if strings.Contains(message, "繁忙") {
		status = http.StatusTooManyRequests
		errorText = message
	}
	return visionOutcome{Code: status, Fail: map[string]any{
		"error": errorText,
		"detail": map[string]any{
			"modelsTried": []string{}, "pipelineStage": "unified",
			"gatewayUnreachable": unreachable, "rateLimited": status == http.StatusTooManyRequests && !quota,
			"quotaExhausted": quota,
		},
	}}
}

func deconstructPrompt(count int, hint, category string) string {
	return "请一次完成这 " + strconv.Itoa(count) + " 张参考图的反推，只输出 JSON。" +
		"必须包含 per_image（每张含 image_index、title、reverse_prompt_zh、has_human）、content_groups、scenes、outfits、actions、content_summary、theme_category、product_major_category。" +
		"\n用户提示：" + hint + "\n目标大类：" + category
}

func parseVisionJSON(raw string) (map[string]any, []any, error) {
	text := strings.TrimSpace(raw)
	text = strings.TrimPrefix(text, "```json")
	text = strings.TrimPrefix(text, "```")
	text = strings.TrimSuffix(text, "```")
	var parsed map[string]any
	if json.Unmarshal([]byte(strings.TrimSpace(text)), &parsed) != nil {
		return nil, nil, errors.New("反推结果不是 JSON")
	}
	images, _ := parsed["per_image"].([]any)
	if images == nil {
		images, _ = parsed["perImageResults"].([]any)
	}
	if len(images) == 0 {
		return nil, nil, errors.New("反推结果缺少逐图内容")
	}
	return parsed, images, nil
}

func truncate(value string, limit int) string {
	if len(value) <= limit {
		return value
	}
	return value[:limit]
}
