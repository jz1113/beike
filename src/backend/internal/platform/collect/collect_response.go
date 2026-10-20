package collect

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"

	"beike.local/cloud/src/backend/internal/platform/database"
	"beike.local/cloud/src/backend/internal/platform/database/catalog"
	"beike.local/cloud/src/backend/internal/platform/media"
)

type missingCredential struct {
	Success       bool   `json:"success"`
	Error         string `json:"error"`
	MissingConfig string `json:"missingConfig"`
}

type imagePayload struct {
	Main            []string                        `json:"main"`
	Details         []string                        `json:"details"`
	Skus            []string                        `json:"skus"`
	Props           map[string]string               `json:"props"`
	Price           float64                         `json:"price"`
	Brand           string                          `json:"brand"`
	Category        string                          `json:"category"`
	VariantMetadata *catalog.ProductVariantMetadata `json:"variantMetadata,omitempty"`
}

type failurePayload struct {
	Success      bool   `json:"success"`
	Error        string `json:"error"`
	Status       int    `json:"status,omitempty"`
	UpstreamCode any    `json:"upstreamCode,omitempty"`
	Retryable    *bool  `json:"retryable,omitempty"`
}

func failureResult(status int, message string) Result {
	return Result{Status: status, Body: struct {
		Success bool   `json:"success"`
		Error   string `json:"error"`
	}{false, message}}
}

func failureBody(failure collectionFailure) failurePayload {
	body := failurePayload{Success: false, Error: failure.error, Status: failure.status, UpstreamCode: failure.upstream}
	if failure.includeRetryable {
		body.Retryable = failure.retryable
	}
	return body
}

func cachedProduct(ctx context.Context, db *sql.DB, workspace string, input productInput) (Result, bool) {
	id, title, picURL, detail, createdAt, ok, err := database.LoadCollectedProduct(ctx, db, workspace, input.platform, input.itemID)
	if err != nil || !ok {
		return Result{}, false
	}
	if _, blocked := productTitleFailure(title); blocked {
		return Result{}, false
	}
	var stored map[string]any
	if json.Unmarshal([]byte(detail), &stored) != nil {
		return Result{}, false
	}
	mainSource := extractURLs(stored["main"], true)
	skuSource := extractURLs(stored["skus"], true)
	detailSource := extractURLs(stored["details"], true)
	// picUrl is a cover alias, not evidence that a sku/detail image is a main
	// image. Keep an existing group's ownership, including old cache payloads.
	if cover, ok := media.ParseProductImage(picURL); ok {
		group := 0
		found := false
		for index, values := range [][]string{mainSource, skuSource, detailSource} {
			for _, value := range values {
				if image, valid := media.ParseProductImage(value); valid && image.Key == cover.Key {
					group, found = index, true
					break
				}
			}
			if found {
				break
			}
		}
		switch group {
		case 1:
			skuSource = append(skuSource, picURL)
		case 2:
			detailSource = append(detailSource, picURL)
		default:
			mainSource = append(mainSource, picURL)
		}
	}
	main, skus, details := productImageGroups(mainSource, skuSource, detailSource)
	combined := uniqueStrings(append(append(append([]string{}, main...), skus...), details...))
	if len(combined) == 0 {
		return Result{}, false
	}
	cover := combined[0]
	if len(main) > 0 {
		cover = main[0]
	}
	price := numberValue(stored["price"])
	brand := textOr(stored["brand"], "")
	category := textOr(stored["category"], "全品类")
	props := stringMap(stored["props"])
	variants := catalog.AlignProductVariantImages(catalog.ReadProductVariantMetadata(stored["variantMetadata"]), combined)
	variants = selectRequestedVariant(variants, input)
	return Result{Status: http.StatusOK, Body: struct {
		Success   bool   `json:"success"`
		Product   any    `json:"product"`
		Images    any    `json:"images"`
		APIUsed   string `json:"apiUsed"`
		FromCache bool   `json:"fromCache"`
	}{
		true,
		cachedItem{id, input.platform, input.itemID, input.itemID, input.itemID, title, price, brand, category, cover, cover, combined, main, details, details, skus, props, createdAt, variants},
		imagePayload{main, details, skus, props, price, brand, category, variants},
		"💾 本地数据库已存 (0次扣费/瞬时加载)",
		true,
	}}, true
}

type cachedItem struct {
	ID              string                          `json:"id"`
	Platform        string                          `json:"platform"`
	ItemID          string                          `json:"itemId"`
	NumIID          string                          `json:"num_iid"`
	SKUID           string                          `json:"skuId"`
	Title           string                          `json:"title"`
	Price           float64                         `json:"price"`
	Brand           string                          `json:"brand"`
	Category        string                          `json:"category"`
	PicURL          string                          `json:"picUrl"`
	CoverImage      string                          `json:"coverImage"`
	Images          []string                        `json:"images"`
	MainImages      []string                        `json:"mainImages"`
	DetailImages    []string                        `json:"detailImages"`
	DescImages      []string                        `json:"descImages"`
	SKUImages       []string                        `json:"skuImages"`
	Props           map[string]string               `json:"props"`
	CreatedAt       string                          `json:"createdAt"`
	VariantMetadata *catalog.ProductVariantMetadata `json:"variantMetadata,omitempty"`
}

func freshProduct(id string, input productInput, title string, price float64, category, brand, picURL string, combined, main, details, skus []string, props map[string]string, createdAt, apiUsed string, variants *catalog.ProductVariantMetadata) any {
	return struct {
		Success bool   `json:"success"`
		Product any    `json:"product"`
		Images  any    `json:"images"`
		APIUsed string `json:"apiUsed"`
	}{
		true,
		struct {
			ID              string                          `json:"id"`
			Platform        string                          `json:"platform"`
			ItemID          string                          `json:"itemId"`
			NumIID          string                          `json:"num_iid"`
			SKUID           string                          `json:"skuId"`
			Title           string                          `json:"title"`
			Price           float64                         `json:"price"`
			Category        string                          `json:"category"`
			Brand           string                          `json:"brand"`
			PicURL          string                          `json:"picUrl"`
			CoverImage      string                          `json:"coverImage"`
			Images          []string                        `json:"images"`
			MainImages      []string                        `json:"mainImages"`
			DetailImages    []string                        `json:"detailImages"`
			DescImages      []string                        `json:"descImages"`
			SKUImages       []string                        `json:"skuImages"`
			Props           map[string]string               `json:"props"`
			CreatedAt       string                          `json:"createdAt"`
			VariantMetadata *catalog.ProductVariantMetadata `json:"variantMetadata,omitempty"`
		}{id, input.platform, input.itemID, input.itemID, input.itemID, title, price, category, brand, picURL, picURL, combined, main, details, details, skus, props, createdAt, variants},
		imagePayload{main, details, skus, props, price, brand, category, variants},
		apiUsed,
	}
}

func numberValue(value any) float64 {
	switch typed := value.(type) {
	case float64:
		return typed
	case json.Number:
		parsed, _ := typed.Float64()
		return parsed
	default:
		return 0
	}
}

func textOr(value any, fallback string) string {
	text, _ := value.(string)
	if strings.TrimSpace(text) == "" {
		return fallback
	}
	return text
}

func stringMap(value any) map[string]string {
	result := map[string]string{}
	object, ok := value.(map[string]any)
	if !ok {
		return result
	}
	for key, item := range object {
		if text, ok := item.(string); ok {
			result[key] = text
		}
	}
	return result
}

func productProps(title, brand, category string, item map[string]any) map[string]string {
	result := map[string]string{}
	if strings.TrimSpace(brand) != "" {
		result["品牌"] = strings.TrimSpace(brand)
	}
	if strings.TrimSpace(category) != "" && category != "全品类" {
		result["商品分类"] = strings.TrimSpace(category)
	}
	if weight, ok := item["item_weight"].(string); ok && strings.TrimSpace(weight) != "" {
		result["商品毛重"] = strings.TrimSpace(weight)
	}
	switch props := item["props"].(type) {
	case []any:
		for _, value := range props {
			object, _ := value.(map[string]any)
			key := strings.TrimSpace(firstText(object, "name", "key", "prop_name"))
			text := strings.TrimSpace(firstText(object, "value", "val", "prop_value"))
			if key != "" && text != "" {
				result[key] = text
			}
		}
	case map[string]any:
		for key, value := range props {
			if text, ok := value.(string); ok && strings.TrimSpace(text) != "" {
				result[strings.TrimSpace(key)] = strings.TrimSpace(text)
			}
		}
	}
	return result
}
