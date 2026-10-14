package generate

import (
	"net/http"
	"os"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
)

func layerAccessError(cfg config.Config, r *http.Request, payload map[string]any) string {
	if strings.TrimSpace(os.Getenv("ARK_LAYER_API_KEY")) != "" {
		return ""
	}
	return HeadlineAccessError(cfg, r, payload, "请先配置聚合平台 API 密钥")
}
