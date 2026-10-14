package system

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func normalizeGatewayBaseURL(raw string) string {
	trimmed := strings.TrimSpace(raw)
	trimmed = strings.TrimRight(trimmed, "/")
	if len(trimmed) >= 3 && strings.EqualFold(trimmed[len(trimmed)-3:], "/v1") {
		trimmed = trimmed[:len(trimmed)-3]
	}
	return trimmed
}

func envOr(key, fallback string) string {
	value, ok := os.LookupEnv(key)
	if !ok || value == "" {
		return fallback
	}
	return value
}

type systemModelLists struct {
	VisionModels []json.RawMessage `json:"visionModels"`
	ImageModels  []json.RawMessage `json:"imageModels"`
}

var systemModelCache struct {
	sync.Mutex
	root  string
	lists systemModelLists
}

func loadSystemModels(root string) (systemModelLists, error) {
	systemModelCache.Lock()
	defer systemModelCache.Unlock()
	if systemModelCache.root == root && systemModelCache.lists.VisionModels != nil {
		return systemModelCache.lists, nil
	}
	raw, err := os.ReadFile(filepath.Join(root, "src/shared/data/systemConfigModels.json"))
	if err != nil {
		return systemModelLists{}, err
	}
	var lists systemModelLists
	if err := json.Unmarshal(raw, &lists); err != nil {
		return systemModelLists{}, err
	}
	systemModelCache.root = root
	systemModelCache.lists = lists
	return lists, nil
}

func systemConfigHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		lists, err := loadSystemModels(cfg.Root)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "操作失败，请稍后重试"})
			return
		}
		expose := !cfg.Production()
		baseURL := envOr("AI_DRAWING_BASE_URL", "https://ai.comfly.org")
		normalized := normalizeGatewayBaseURL(baseURL)
		if normalized == "" {
			normalized = baseURL
		}
		apiKey, wanbangKey, wanbangSecret := "", "", ""
		scraperID, scraperSecret, qiyunID, qiyunKey := "", "", "", ""
		if expose {
			apiKey = envOr("AI_DRAWING_API_KEY", "")
			wanbangKey = envOr("WANBANG_API_KEY", "")
			wanbangSecret = envOr("WANBANG_API_SECRET", "")
			scraperID = envOr("EXTERNAL_SCRAPER_ID", "")
			scraperSecret = envOr("EXTERNAL_SCRAPER_SECRET", "")
			qiyunID = envOr("QIYUN_APP_ID", "")
			qiyunKey = envOr("QIYUN_APP_KEY", "")
		}
		masked := "未配置"
		if apiKey != "" {
			masked = "已配置"
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"success": true,
			"config": map[string]any{
				"baseUrl": baseURL, "normalizedBaseUrl": normalized,
				"hasApiKey": apiKey != "", "maskedKey": masked,
				"hasWanbangKey": wanbangKey != "", "wanbangSecretConfigured": wanbangSecret != "",
				"wanbangHost":                     "https://api-gw.onebound.cn",
				"hasExternalScraper":              scraperID != "" && scraperSecret != "",
				"externalScraperSecretConfigured": scraperSecret != "",
				"externalScraperHost":             "https://apia.vip/api/dsp/",
				"hasQiyun":                        qiyunID != "" && qiyunKey != "",
				"qiyunAppKeyConfigured":           qiyunKey != "",
				"qiyunHost":                       "https://qyapi.ipaybuy.cn/api/video",
				"defaultVisionModel":              "gpt-5.6-luna",
				"defaultImageModel":               "gpt-image-2",
				"visionModels":                    lists.VisionModels,
				"imageModels":                     lists.ImageModels,
				"fallbackChain":                   []any{},
			},
		})
	}
}
