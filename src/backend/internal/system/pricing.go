package system

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"beike.local/cloud/src/backend/internal/httpx"
)

const comflyPricingURL = "https://ai.comfly.org/api/pricing"

type modelPrice struct {
	PromptPer1k     float64 `json:"promptPer1k"`
	CompletionPer1k float64 `json:"completionPer1k"`
}

var pricingCache struct {
	sync.Mutex
	expires time.Time
	prices  map[string]modelPrice
}

func parseDefaultGroupPrices(raw map[string]any) map[string]modelPrice {
	prices := map[string]modelPrice{}
	groupRatio, _ := raw["group_ratio"].(map[string]any)
	ratio, ok := groupRatio["default"].(float64)
	rows, rowsOK := raw["data"].([]any)
	if !ok || !rowsOK || ratio <= 0 {
		return prices
	}
	for _, value := range rows {
		row, ok := value.(map[string]any)
		if !ok {
			continue
		}
		id, _ := row["model_name"].(string)
		modelRatio, ratioOK := row["model_ratio"].(float64)
		completion, completionOK := row["completion_ratio"].(float64)
		groups, _ := row["enable_groups"].([]any)
		if id == "" || row["quota_type"] != float64(0) || !ratioOK || modelRatio < 0 || !completionOK || completion < 0 || !containsString(groups, "default") {
			continue
		}
		prices[strings.ToLower(id)] = modelPrice{
			PromptPer1k:     modelRatio * ratio * 0.002,
			CompletionPer1k: modelRatio * completion * ratio * 0.002,
		}
	}
	return prices
}

func containsString(values []any, want string) bool {
	for _, value := range values {
		if text, ok := value.(string); ok && text == want {
			return true
		}
	}
	return false
}

func pricingHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		pricingCache.Lock()
		if pricingCache.prices != nil && time.Now().Before(pricingCache.expires) {
			prices := pricingCache.prices
			pricingCache.Unlock()
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "group": "default", "prices": prices})
			return
		}
		pricingCache.Unlock()

		client := &http.Client{Timeout: 10 * time.Second}
		response, err := client.Get(comflyPricingURL)
		if err != nil {
			httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"success": false, "error": err.Error()})
			return
		}
		defer response.Body.Close()
		if response.StatusCode < 200 || response.StatusCode >= 300 {
			httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"success": false, "error": fmt.Sprintf("Comfly HTTP %d", response.StatusCode)})
			return
		}
		var raw map[string]any
		if err := json.NewDecoder(response.Body).Decode(&raw); err != nil {
			httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"success": false, "error": err.Error()})
			return
		}
		prices := parseDefaultGroupPrices(raw)
		if len(prices) == 0 {
			httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"success": false, "error": "Comfly 未返回默认分组报价"})
			return
		}
		pricingCache.Lock()
		pricingCache.prices = prices
		pricingCache.expires = time.Now().Add(5 * time.Minute)
		pricingCache.Unlock()
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "group": "default", "prices": prices})
	})
}
