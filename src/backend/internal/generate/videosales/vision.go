package videosales

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/system"
)

// chatWait matches the model gateway default and covers observed completions of about four minutes.
const chatWait = 5 * time.Minute

const longOutputTokens = 16384

var errTruncatedOutput = errors.New("模型输出被截断，自动恢复后仍未获得完整结果；请缩短目标时长或切换支持更长输出的模型后重试")

func roleLabel(role string) string {
	switch role {
	case "main":
		return "主图"
	case "sku":
		return "规格图"
	default:
		return "详情图"
	}
}

func visionParts(intro string, images []CatalogImage) []map[string]any {
	parts := []map[string]any{{"type": "text", "text": intro}}
	for _, image := range images {
		parts = append(parts,
			map[string]any{"type": "text", "text": fmt.Sprintf("图片编号 %d，%s", image.Index, roleLabel(image.Role))},
			map[string]any{"type": "image_url", "image_url": map[string]any{"url": image.URL, "index": image.Index}},
		)
	}
	return parts
}

func postChatJSON(ctx context.Context, base, key string, body map[string]any, timeout time.Duration) (string, map[string]any, int, error) {
	return completeSalesJSON(ctx, base, key, body, timeout)
}

func chatFinishReason(raw map[string]any) string {
	choices, _ := raw["choices"].([]any)
	if len(choices) == 0 {
		return ""
	}
	choice, _ := choices[0].(map[string]any)
	reason, _ := choice["finish_reason"].(string)
	return reason
}

func withLongOutput(body map[string]any) map[string]any {
	body["max_tokens"] = longOutputTokens
	return body
}

func resolveCredentials(cfg config.Config, r *http.Request, payload map[string]any) (string, string) {
	clientBase := strings.TrimSpace(generate.StringField(payload, "customBaseUrl"))
	if clientBase == "" {
		clientBase = strings.TrimSpace(r.Header.Get("x-custom-base-url"))
	}
	clientKey := strings.TrimSpace(generate.StringField(payload, "customApiKey"))
	if clientKey == "" {
		clientKey = strings.TrimSpace(r.Header.Get("x-custom-api-key"))
	}

	base := system.NormalizeGatewayBaseURL(clientBase)
	key := clientKey

	if key == "" && !cfg.Production() {
		key = strings.TrimSpace(os.Getenv("AI_API_KEY"))
		if key == "" {
			key = strings.TrimSpace(os.Getenv("OPENAI_API_KEY"))
		}
		if key == "" {
			key = strings.TrimSpace(os.Getenv("GOOGLE_API_KEY"))
		}
	}

	if base == "" {
		base = strings.TrimSpace(os.Getenv("AI_API_BASE"))
		if base == "" {
			base = strings.TrimSpace(os.Getenv("OPENAI_API_BASE"))
		}
		if base == "" {
			base = "https://api.openai.com"
		}
	}

	return system.NormalizeGatewayBaseURL(base), key
}
