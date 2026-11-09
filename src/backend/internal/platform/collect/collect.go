package collect

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"beike.local/cloud/src/backend/internal/platform/database"
	"beike.local/cloud/src/backend/internal/platform/database/catalog"
	"beike.local/cloud/src/backend/internal/platform/media"
	"beike.local/cloud/src/backend/internal/platform/network"
)

type Result struct {
	Status int
	Body   any
}

type productInput struct {
	platform, itemID string
	requestedSKUID   string
	forceRefresh     bool
}

type sharedProduct struct {
	Title, Cover, Detail string
}

var productIDPattern = regexp.MustCompile(`^\d{7,20}$`)
var productLinkPattern = regexp.MustCompile(`(?i)https?://[^\s"'<>，。；）)\]]+`)

func Product(ctx context.Context, db *sql.DB, workspace string, body map[string]any, apiKey, apiSecret string, client *http.Client) Result {
	input, message := resolveProductInput(body)
	if message != "" {
		return failureResult(http.StatusBadRequest, message)
	}
	if err := ctx.Err(); err != nil {
		return collectionContextResult(ctx)
	}
	key, unlock, err := database.LockCollection(ctx, "product:"+input.platform+":"+input.itemID)
	defer unlock()
	if err != nil {
		return collectionContextResult(ctx)
	}
	if !input.forceRefresh {
		if result, ok := cachedProduct(ctx, db, workspace, input); ok {
			return result
		}
		var shared sharedProduct
		hit, err := database.LoadCollection(ctx, db, key, &shared)
		if err != nil {
			return failureResult(http.StatusInternalServerError, "暂时无法读取商品采集缓存，请稍后重试")
		}
		if hit {
			if _, _, err := database.SaveCollectDetail(ctx, db, workspace, input.platform, input.itemID, shared.Title, shared.Cover, shared.Detail); err != nil {
				return failureResult(http.StatusInternalServerError, "暂时无法保存商品采集结果，请稍后重试")
			}
			if result, ok := cachedProduct(ctx, db, workspace, input); ok {
				return result
			}
			return failureResult(http.StatusInternalServerError, "商品采集缓存无法读取，请刷新采集")
		}
	}
	if err := ctx.Err(); err != nil {
		return collectionContextResult(ctx)
	}
	if strings.TrimSpace(apiKey) == "" || strings.TrimSpace(apiSecret) == "" {
		return Result{Status: http.StatusBadRequest, Body: missingCredential{false, "未配置万邦 (OneBound) 电商数据采集接口凭证。请在「设置 -> 服务接口配置」中填入您的万邦 API Key 和 Secret 后再使用。", "wanbang"}}
	}
	if client == nil {
		client = network.SafeClient()
	}
	apis := []string{"item_get_pro", "item_get"}
	if input.platform == "jd" {
		apis = []string{"item_get_pro"}
	}
	var item map[string]any
	var main, details, skus []string
	apiUsed := ""
	last := collectionFailure{error: "万邦接口未返回有效商品数据", status: http.StatusBadGateway}
	for _, apiName := range apis {
		if err := ctx.Err(); err != nil {
			return collectionContextResult(ctx)
		}
		apiUsed = "万邦 OneBound 官方专线 (" + input.platform + "." + apiName + ")"
		data, err := fetchWanbang(ctx, client, buildWanbangURL(input, apiName, apiKey, apiSecret))
		if err != nil {
			if ctx.Err() != nil {
				return collectionContextResult(ctx)
			}
			var bodyErr wanbangBodyError
			if errors.As(err, &bodyErr) {
				last = wanbangBodyFailure(bodyErr)
				break
			}
			var statusErr wanbangStatusError
			if errors.As(err, &statusErr) {
				last = httpFailure(statusErr.status)
				if last.stop {
					break
				}
				continue
			}
			if errors.Is(err, context.DeadlineExceeded) || strings.Contains(strings.ToLower(err.Error()), "timeout") {
				last = collectionFailure{error: "万邦采集接口超时，请稍后重试", status: http.StatusGatewayTimeout}
				continue
			}
			last = collectionFailure{error: "连接万邦采集接口失败，请稍后重试", status: http.StatusBadGateway}
			continue
		}
		candidate, _ := data["item"].(map[string]any)
		code := stringify(data["error_code"])
		if candidate == nil || (code != "" && code != "0000" && code != "0") || wanbangReportedError(data["error"]) || wanbangReportedError(candidate["error"]) {
			last = wanbangFailure(data)
			if last.stop {
				break
			}
			continue
		}
		if titleFailure, failed := productTitleFailure(stringify(candidate["title"])); failed {
			last = titleFailure
			break
		}
		candidateMain, candidateSkus, candidateDetails := extractProductImages(candidate)
		if len(candidateMain) == 0 && len(candidateDetails) == 0 && len(candidateSkus) == 0 {
			last = wanbangFailure(data)
			continue
		}
		item = candidate
		main, details, skus = candidateMain, candidateDetails, candidateSkus
		break
	}
	if item == nil {
		return Result{Status: last.status, Body: failureBody(last)}
	}
	title := stringify(item["title"])
	if title == "" {
		title = "精选商品 (SKU: " + input.itemID + ")"
	}
	price := productPrice(item)
	category := firstText(item, "cat_name", "category_name", "rootCatId")
	if category == "" {
		category = "全品类"
	}
	brand := firstText(item, "brand", "nick")
	shopName := firstText(item, "shop_name", "shop_title", "shopName")
	for _, field := range []string{"shop", "shop_info", "seller_info"} {
		if shopName != "" {
			break
		}
		if shop, ok := item[field].(map[string]any); ok {
			shopName = firstText(shop, "shop_name", "shop_title", "shopName", "title", "nick")
		}
	}
	if shopName == "" {
		shopName = firstText(item, "nick")
	}
	props := productProps(title, brand, category, item)
	combined := uniqueStrings(append(append(append([]string{}, main...), skus...), details...))
	picURL := ""
	if len(main) > 0 {
		picURL = main[0]
	} else if len(combined) > 0 {
		picURL = combined[0]
	}
	variants := extractProductVariants(item, input, combined)
	specsBySKU := skuSpecs(item)
	detail, err := json.Marshal(imagePayload{main, details, skus, props, price, brand, category, variants, shopName, specsBySKU})
	if err != nil {
		return failureResult(http.StatusInternalServerError, "采集遇到未知异常")
	}
	if err := database.SaveCollection(ctx, db, key, sharedProduct{title, picURL, string(detail)}, 0); err != nil {
		return failureResult(http.StatusInternalServerError, "暂时无法保存商品采集缓存，请稍后重试")
	}
	id, createdAt, err := database.SaveCollectDetail(ctx, db, workspace, input.platform, input.itemID, title, picURL, string(detail))
	if err != nil {
		if ctx.Err() != nil {
			return collectionContextResult(ctx)
		}
		return failureResult(http.StatusInternalServerError, "采集遇到未知异常")
	}
	return Result{Status: http.StatusOK, Body: freshProduct(id, input, title, price, category, brand, picURL, combined, main, details, skus, props, createdAt, apiUsed, variants, shopName, specsBySKU)}
}

var buildWanbangURL = func(input productInput, apiName, apiKey, apiSecret string) string {
	values := url.Values{}
	values.Set("key", apiKey)
	values.Set("secret", apiSecret)
	values.Set("num_iid", input.itemID)
	values.Set("cache", "yes")
	if input.forceRefresh {
		values.Set("cache", "no")
	}
	if input.platform == "jd" && apiName == "item_get" {
		values.Set("domain_type", "jd")
	} else if input.platform == "taobao" || input.platform == "1688" {
		values.Set("is_promotion", "1")
	}
	return "https://api-gw.onebound.cn/" + input.platform + "/" + apiName + "/?" + values.Encode()
}

func httpFailure(status int) collectionFailure {
	switch status {
	case http.StatusRequestTimeout, http.StatusGatewayTimeout:
		return collectionFailure{error: "万邦采集接口 HTTP 请求超时，请稍后重试", status: http.StatusGatewayTimeout, upstream: status}
	case http.StatusTooManyRequests:
		return collectionFailure{error: "万邦采集接口请求受限，请稍后重试", status: status, stop: true}
	case http.StatusUnauthorized, http.StatusForbidden:
		return collectionFailure{error: "万邦接口凭证或权限异常，请检查服务接口配置", status: http.StatusBadRequest, upstream: status, stop: true}
	}
	if status < 500 && status != http.StatusRequestTimeout {
		return collectionFailure{error: "万邦接口地址或请求参数异常，请检查服务接口配置", status: http.StatusBadRequest, upstream: status, stop: true}
	}
	return collectionFailure{error: "连接万邦采集接口失败，请稍后重试", status: http.StatusBadGateway}
}

func productPrice(item map[string]any) float64 {
	for _, key := range []string{"price", "orginal_price", "promotion_price"} {
		text := stringify(item[key])
		if text == "" {
			continue
		}
		parsed, err := strconv.ParseFloat(text, 64)
		if err == nil {
			return parsed
		}
	}
	return 0
}

func firstText(item map[string]any, keys ...string) string {
	for _, key := range keys {
		if text := strings.TrimSpace(stringify(item[key])); text != "" && text != "null" {
			return text
		}
	}
	return ""
}

func uniqueStrings(values []string) []string {
	seen := map[string]struct{}{}
	result := []string{}
	for _, value := range values {
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

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
	ShopName        string                          `json:"shopName,omitempty"`
	SKUSpecs        map[string]map[string]string    `json:"skuSpecs,omitempty"`
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
	if json.Unmarshal([]byte(detail), &stored) != nil || stored["collectionCacheInvalidated"] == true {
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
	shopName := textOr(stored["shopName"], "")
	category := textOr(stored["category"], "全品类")
	props := stringMap(stored["props"])
	variants := catalog.AlignProductVariantImages(catalog.ReadProductVariantMetadata(stored["variantMetadata"]), combined)
	variants = selectRequestedVariant(variants, input)
	storedSpecs, _ := stored["skuSpecs"].(map[string]any)
	currentSpecs := stringMap(storedSpecs[requestedSpecSKU(input)])
	return Result{Status: http.StatusOK, Body: struct {
		Success   bool   `json:"success"`
		Product   any    `json:"product"`
		Images    any    `json:"images"`
		APIUsed   string `json:"apiUsed"`
		FromCache bool   `json:"fromCache"`
	}{
		true,
		cachedItem{id, input.platform, input.itemID, input.itemID, input.itemID, title, price, brand, category, cover, cover, combined, main, details, details, skus, props, createdAt, variants, shopName, currentSpecs},
		imagePayload{main, details, skus, props, price, brand, category, variants, shopName, nil},
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
	ShopName        string                          `json:"shopName,omitempty"`
	CurrentSpecs    map[string]string               `json:"currentSpecs,omitempty"`
}

func requestedSpecSKU(input productInput) string {
	if input.requestedSKUID == "" && input.platform == "jd" {
		return input.itemID
	}
	return input.requestedSKUID
}

func freshProduct(id string, input productInput, title string, price float64, category, brand, picURL string, combined, main, details, skus []string, props map[string]string, createdAt, apiUsed string, variants *catalog.ProductVariantMetadata, shopName string, specsBySKU map[string]map[string]string) any {
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
			ShopName        string                          `json:"shopName,omitempty"`
			CurrentSpecs    map[string]string               `json:"currentSpecs,omitempty"`
		}{id, input.platform, input.itemID, input.itemID, input.itemID, title, price, category, brand, picURL, picURL, combined, main, details, details, skus, props, createdAt, variants, shopName, specsBySKU[requestedSpecSKU(input)]},
		imagePayload{main, details, skus, props, price, brand, category, variants, shopName, nil},
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

func resolveProductInput(body map[string]any) (productInput, string) {
	requested := "auto"
	if text, ok := body["platform"].(string); ok {
		requested = strings.ToLower(strings.TrimSpace(text))
	}
	if requested == "" {
		requested = "auto"
	}
	if requested == "tmall" {
		requested = "taobao"
	}
	switch requested {
	case "auto", "jd", "taobao", "1688", "pinduoduo":
	default:
		return productInput{}, "不支持该商品平台，请选择京东、淘宝/天猫、1688 或拼多多"
	}
	for _, name := range []string{"force_refresh", "forceRefresh"} {
		if value, ok := body[name]; ok && value != nil {
			if _, isBool := value.(bool); !isBool {
				return productInput{}, "强制刷新参数必须为布尔值"
			}
		}
	}
	raw, ok := firstProductRaw(body)
	if !ok {
		return productInput{}, "请输入有效的商品 ID 或商品详情链接"
	}
	force := false
	if value, ok := body["force_refresh"].(bool); ok {
		force = value
	}
	if value, ok := body["forceRefresh"].(bool); ok {
		force = value
	}
	if productIDPattern.MatchString(raw) {
		platform := requested
		if platform == "auto" {
			platform = "jd"
		}
		return productInput{platform: platform, itemID: raw, forceRefresh: force}, ""
	}
	matches := productLinkPattern.FindAllString(raw, -1)
	if len(matches) > 1 {
		return productInput{}, "每次请传入一个商品链接"
	}
	candidate := raw
	if len(matches) == 1 {
		candidate = matches[0]
	}
	candidate = strings.TrimRight(candidate, "，。；）)]")
	if !strings.Contains(strings.ToLower(candidate), "://") {
		candidate = "https://" + candidate
	}
	parsed, err := url.Parse(candidate)
	if err != nil || parsed.Hostname() == "" {
		return productInput{}, "请输入有效的商品 ID 或商品详情链接"
	}
	host := strings.ToLower(parsed.Hostname())
	detected := platformFromHost(host)
	if detected == "" || parsed.User != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return productInput{}, "未识别到支持的商品详情链接，请输入京东、淘宝/天猫、1688 或拼多多链接"
	}
	if requested != "auto" && requested != detected {
		return productInput{}, "所选平台与商品链接不一致，请切换平台或使用自动识别"
	}
	if hostMatches(host, "3.cn") || hostMatches(host, "tb.cn") || hostMatches(host, "u.jd.com") {
		return productInput{}, "商品分享短链不包含可靠的商品 ID，请先在浏览器展开后复制完整详情链接"
	}
	itemID := itemIDFromURL(parsed, detected)
	if !productIDPattern.MatchString(itemID) {
		return productInput{}, "链接中未找到商品 ID。请复制完整商品详情链接，或选择平台后输入商品 ID（短链请先在浏览器展开）"
	}
	requestedSKU := parsed.Query().Get("skuId")
	if requestedSKU == "" {
		requestedSKU = parsed.Query().Get("sku_id")
	}
	if !productIDPattern.MatchString(requestedSKU) {
		requestedSKU = ""
	}
	return productInput{platform: detected, itemID: itemID, requestedSKUID: requestedSKU, forceRefresh: force}, ""
}

func firstProductRaw(body map[string]any) (string, bool) {
	for _, name := range []string{"url", "num_iid", "itemId", "id"} {
		switch value := body[name].(type) {
		case string:
			if strings.TrimSpace(value) != "" {
				return strings.TrimSpace(value), true
			}
		case json.Number:
			if productIDPattern.MatchString(value.String()) {
				return value.String(), true
			}
		case float64:
			text := strings.TrimSuffix(strings.TrimSuffix(jsonNumber(value), ".0"), ".00")
			if productIDPattern.MatchString(text) {
				return text, true
			}
		}
	}
	return "", false
}

func jsonNumber(value float64) string {
	body, _ := json.Marshal(value)
	return string(body)
}

func platformFromHost(host string) string {
	switch {
	case hostMatches(host, "jd.com") || hostMatches(host, "360buy.com") || hostMatches(host, "3.cn"):
		return "jd"
	case hostMatches(host, "taobao.com") || hostMatches(host, "tmall.com") || hostMatches(host, "tb.cn"):
		return "taobao"
	case hostMatches(host, "1688.com"):
		return "1688"
	case hostMatches(host, "yangkeduo.com") || hostMatches(host, "pinduoduo.com"):
		return "pinduoduo"
	default:
		return ""
	}
}

func hostMatches(host, root string) bool {
	return host == root || strings.HasSuffix(host, "."+root)
}

func itemIDFromURL(parsed *url.URL, platform string) string {
	keys := []string{"id", "itemId", "item_id"}
	switch platform {
	case "jd":
		keys = []string{"skuId", "sku", "wareId", "itemId", "item_id"}
	case "pinduoduo":
		keys = []string{"goods_id", "goodsId"}
	}
	for _, key := range keys {
		if value := parsed.Query().Get(key); productIDPattern.MatchString(value) {
			return value
		}
	}
	path := parsed.EscapedPath()
	switch platform {
	case "jd":
		if match := regexp.MustCompile(`(?i)^/(?:product/)?(\d{7,20})(?:\.html?)?/?$`).FindStringSubmatch(path); match != nil {
			return match[1]
		}
	case "1688":
		if match := regexp.MustCompile(`(?i)^/offer/(\d{7,20})(?:\.html?)?/?$`).FindStringSubmatch(path); match != nil {
			return match[1]
		}
	}
	return ""
}
