package system

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"beike.local/cloud/src/backend/internal/httpx"
)

type catalogModel struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	ShortName   string `json:"shortName"`
	Category    string `json:"category"`
	IsVision    bool   `json:"isVision"`
	IsMulti     bool   `json:"isMultimodal"`
	IsThinking  bool   `json:"isThinking"`
	IsImage     bool   `json:"isImage"`
	IsVideo     bool   `json:"isVideo"`
	Provider    string `json:"provider"`
	OwnedBy     string `json:"owned_by"`
	Capability  string `json:"-"`
	displayRank int
}

var catalogCache struct {
	sync.Mutex
	root   string
	models []catalogModel
	byID   map[string]catalogModel
	rules  []catalogSelectionRule
}

type catalogSelectionRule struct {
	pattern *regexp.Regexp
	profile catalogModel
}

func loadCatalogSelectionRules(root string, byID map[string]catalogModel) []catalogSelectionRule {
	raw, err := os.ReadFile(filepath.Join(root, "src/shared/domain/models/model-catalog/selectionRules.json"))
	if err != nil {
		return nil
	}
	var entries []struct {
		Profile string `json:"profile"`
		Pattern string `json:"pattern"`
	}
	if json.Unmarshal(raw, &entries) != nil {
		return nil
	}
	rules := make([]catalogSelectionRule, 0, len(entries))
	for _, entry := range entries {
		profile, ok := byID[strings.ToLower(entry.Profile)]
		if entry.Profile == "voice" {
			profile = catalogModel{Category: "audio", Capability: "voice"}
			ok = true
		}
		pattern, err := regexp.Compile("(?i)^(?:" + entry.Pattern + ")$")
		if ok && err == nil {
			rules = append(rules, catalogSelectionRule{pattern: pattern, profile: profile})
		}
	}
	return rules
}

func loadApprovedModels(root string) []catalogModel {
	catalogCache.Lock()
	defer catalogCache.Unlock()
	if catalogCache.root == root && catalogCache.models != nil {
		return catalogCache.models
	}
	models := []catalogModel{}
	byID := map[string]catalogModel{}
	for _, name := range []string{"approvedImage.ts", "approvedVideo.ts", "approvedChat.ts"} {
		raw, err := os.ReadFile(filepath.Join(root, "src/shared/domain/models/model-catalog", name))
		if err != nil {
			continue
		}
		for _, model := range parseApprovedModels(string(raw)) {
			models = append(models, model)
			byID[strings.ToLower(model.ID)] = model
		}
	}
	catalogCache.root = root
	catalogCache.models = models
	catalogCache.byID = byID
	catalogCache.rules = loadCatalogSelectionRules(root, byID)
	return models
}

func selectableCatalogModel(root, id string) (catalogModel, bool) {
	loadApprovedModels(root)
	catalogCache.Lock()
	defer catalogCache.Unlock()
	leaf := strings.TrimSpace(id)
	if slash := strings.LastIndex(leaf, "/"); slash >= 0 {
		leaf = leaf[slash+1:]
	}
	if len(leaf) > 4 && strings.EqualFold(leaf[:4], "net-") {
		leaf = leaf[4:]
	}
	for rank, rule := range catalogCache.rules {
		if !rule.pattern.MatchString(leaf) {
			continue
		}
		if model, ok := catalogCache.byID[strings.ToLower(leaf)]; ok {
			model.displayRank = rank
			return model, true
		}
		model := rule.profile
		model.ID, model.Name, model.ShortName = id, id, id
		model.displayRank = rank
		return model, true
	}
	return catalogModel{}, false
}

func selectableCatalogModels(root string) []catalogModel {
	models := []catalogModel{}
	for _, entry := range loadApprovedModels(root) {
		if model, ok := selectableCatalogModel(root, entry.ID); ok && !falOnlyCatalogModel(model.ID) {
			models = append(models, model)
		}
	}
	sortCatalogModels(models)
	return models
}

func sortCatalogModels(models []catalogModel) {
	sort.SliceStable(models, func(i, j int) bool { return models[i].displayRank < models[j].displayRank })
}

func falOnlyCatalogModel(id string) bool {
	return id == "gemini-omni-1.0-flash" || id == "gemini-omni-1.2-flash"
}

var approvedField = regexp.MustCompile(`(?m)^\s*(id|capability|vendor|name|shortName):\s*'([^']*)'`)
var thinkingField = regexp.MustCompile(`isThinking:\s*true`)

func parseApprovedModels(source string) []catalogModel {
	indexes := approvedField.FindAllStringSubmatchIndex(source, -1)
	models := []catalogModel{}
	current := map[string]string{}
	objectStart := 0
	flush := func(end int) {
		if current["id"] == "" {
			current = map[string]string{}
			return
		}
		capability := current["capability"]
		category := capability
		if capability == "multimodal" {
			category = "text"
		}
		chunk := ""
		if objectStart >= 0 && end > objectStart && end <= len(source) {
			chunk = source[objectStart:end]
		}
		model := catalogModel{
			ID: current["id"], Name: current["name"], ShortName: current["shortName"], Category: category,
			IsVision: capability == "multimodal", IsMulti: capability == "multimodal", IsThinking: thinkingField.MatchString(chunk),
			IsImage: capability == "image", IsVideo: capability == "video", Provider: vendorLabel(current["vendor"]),
			OwnedBy: current["vendor"], Capability: capability,
		}
		models = append(models, model)
		current = map[string]string{}
	}
	for _, index := range indexes {
		key := source[index[2]:index[3]]
		if key == "id" && current["id"] != "" {
			flush(index[0])
		}
		if key == "id" {
			objectStart = index[0]
		}
		current[key] = source[index[4]:index[5]]
	}
	flush(len(source))
	return models
}

func vendorLabel(vendor string) string {
	switch vendor {
	case "openai":
		return "OpenAI"
	case "google":
		return "Google"
	case "bytedance":
		return "Bytedance"
	case "alibaba":
		return "Alibaba"
	case "midjourney":
		return "Midjourney"
	case "bfl":
		return "Black Forest Labs"
	case "kuaishou":
		return "Kuaishou"
	case "xai":
		return "xAI"
	case "minimax":
		return "MiniMax"
	case "anthropic":
		return "Anthropic"
	case "deepseek":
		return "DeepSeek"
	case "moonshot":
		return "Moonshot"
	case "vidu":
		return "Shengshu"
	case "zhipu":
		return "Zhipu"
	case "xiaomi":
		return "Xiaomi"
	default:
		return vendor
	}
}

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
