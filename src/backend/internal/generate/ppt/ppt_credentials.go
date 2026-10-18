package ppt

import (
	"net/http"
	"os"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/system"
)

func resolvePptCredentials(cfg config.Config, r *http.Request, payload map[string]any, model string) (string, string) {
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
