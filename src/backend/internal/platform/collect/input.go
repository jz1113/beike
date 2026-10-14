package collect

import (
	"encoding/json"
	"net/url"
	"regexp"
	"strings"
)

type productInput struct {
	platform, itemID string
	forceRefresh     bool
}

var productIDPattern = regexp.MustCompile(`^\d{7,20}$`)
var productLinkPattern = regexp.MustCompile(`(?i)https?://[^\s"'<>，。；）)\]]+`)

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
		return productInput{}, "每次请传入一个商品链接，多个链接请使用批量采集"
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
	return productInput{platform: detected, itemID: itemID, forceRefresh: force}, ""
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
