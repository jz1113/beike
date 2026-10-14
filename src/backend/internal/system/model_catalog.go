package system

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
)

type catalogModel struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	ShortName  string `json:"shortName"`
	Category   string `json:"category"`
	IsVision   bool   `json:"isVision"`
	IsMulti    bool   `json:"isMultimodal"`
	IsThinking bool   `json:"isThinking"`
	IsImage    bool   `json:"isImage"`
	IsVideo    bool   `json:"isVideo"`
	Provider   string `json:"provider"`
	OwnedBy    string `json:"owned_by"`
	Capability string `json:"-"`
}

var catalogCache struct {
	sync.Mutex
	root   string
	models []catalogModel
	byID   map[string]catalogModel
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
	return models
}

func approvedModel(root, id string) (catalogModel, bool) {
	loadApprovedModels(root)
	catalogCache.Lock()
	defer catalogCache.Unlock()
	model, ok := catalogCache.byID[strings.ToLower(strings.TrimSpace(id))]
	if ok {
		return model, true
	}
	if slash := strings.LastIndex(id, "/"); slash >= 0 {
		model, ok = catalogCache.byID[strings.ToLower(id[slash+1:])]
	}
	return model, ok
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
	default:
		return vendor
	}
}
