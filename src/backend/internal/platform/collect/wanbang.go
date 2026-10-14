package collect

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/platform/media"
)

type collectionFailure struct {
	error            string
	status           int
	upstream         any
	retryable        *bool
	stop             bool
	includeRetryable bool
}

var rateLimitPattern = regexp.MustCompile(`(?i)请求次数频繁|请勿使用盗版|操作过于频繁|请稍后再试|验证码|安全验证|风控拦截|(?:请求|访问).*(?:频率|次数).*(?:限|超|频繁)|rate.?limit|call.?limit`)
var htmlImagePattern = regexp.MustCompile(`(?i)<img[^>]+(?:src|data-original|data-src|data-lazyload|data-ks-lazyload)=["']([^"']+)["']`)
var videoPathPattern = regexp.MustCompile(`(?i)\.(?:mp4|mov|m4v|webm|avi|flv|m3u8|html?)(?:[/?#!]|$)`)

func productTitleFailure(title string) (collectionFailure, bool) {
	if !rateLimitPattern.MatchString(title) {
		return collectionFailure{}, false
	}
	retryable := false
	return collectionFailure{error: "电商采集接口触发上游频控或安全验证，请降低并发或稍后重试", status: http.StatusTooManyRequests, stop: true, retryable: &retryable, includeRetryable: true}, true
}

func wanbangFailure(data map[string]any) collectionFailure {
	item, _ := data["item"].(map[string]any)
	code := data["error_code"]
	message := joinText(data["reason"], data["error"], item["error"])
	value := ""
	if code != nil {
		value = strings.TrimSpace(stringify(code))
	}
	retryable := false
	failure := collectionFailure{upstream: code, stop: true, retryable: &retryable, includeRetryable: true}
	switch value {
	case "2000":
		failure.error = "该商品未返回查询结果，请检查商品是否存在或已下架"
		failure.status = http.StatusNotFound
		return failure
	case "4008", "4013":
		failure.error = "万邦采集接口请求受限，请稍后重试"
		failure.status = http.StatusTooManyRequests
		return failure
	case "4016":
		failure.error = "万邦接口余额或调用配额不足，请检查服务接口配置"
		failure.status = http.StatusPaymentRequired
		return failure
	case "4003", "4004", "4005", "4007", "4012", "4014", "4015":
		failure.error = "万邦接口凭证、参数或权限异常，请检查服务接口配置"
		failure.status = http.StatusBadRequest
		return failure
	case "4006", "4010":
		failure.error = "万邦接口未开通或已停用，请检查服务接口配置"
		failure.status = http.StatusServiceUnavailable
		return failure
	case "4009":
		failure.error = "万邦接口维护中，请稍后重试"
		failure.status = http.StatusServiceUnavailable
		yes := true
		failure.retryable = &yes
		return failure
	case "4017":
		failure.error = "万邦采集接口超时，请稍后重试"
		failure.status = http.StatusGatewayTimeout
		yes := true
		failure.retryable = &yes
		failure.stop = false
		return failure
	}
	if rateLimitPattern.MatchString(message) {
		failure.error = "万邦采集接口请求受限，请稍后重试"
		failure.status = http.StatusTooManyRequests
		return failure
	}
	if regexp.MustCompile(`(?i)余额|扣费|次数不足|配额`).MatchString(message) {
		failure.error = "万邦接口余额或调用配额不足，请检查服务接口配置"
		failure.status = http.StatusPaymentRequired
		return failure
	}
	if regexp.MustCompile(`(?i)apikey|api key|secret|密钥|权限`).MatchString(message) {
		failure.error = "万邦接口凭证、参数或权限异常，请检查服务接口配置"
		failure.status = http.StatusBadRequest
		return failure
	}
	if regexp.MustCompile(`(?i)not.?found|不存在|下架|无效.*(?:id|商品)|invalid.*(?:id|item)`).MatchString(message) {
		failure.error = "商品不存在、已下架或商品 ID 无效，请检查输入"
		failure.status = http.StatusNotFound
		return failure
	}
	failure.error = "万邦接口未返回有效的商品图片，请检查商品链接或稍后重试"
	failure.status = http.StatusBadGateway
	failure.stop = false
	failure.includeRetryable = false
	failure.retryable = nil
	return failure
}

func cleanProductImages(values []any) []string {
	seen := map[string]struct{}{}
	images := []string{}
	for _, value := range values {
		text, ok := value.(string)
		if !ok {
			continue
		}
		normalized := media.NormalizeImageURLToStandardJpg(text)
		parsed, err := url.Parse(normalized)
		if err != nil || parsed.User != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || videoPathPattern.MatchString(parsed.Path) || !media.IsProductImageURL(normalized) {
			continue
		}
		if _, ok := seen[normalized]; ok {
			continue
		}
		seen[normalized] = struct{}{}
		images = append(images, normalized)
	}
	return images
}

func extractURLs(source any, allowHTML bool) []string {
	urls := []string{}
	add := func(values []string) {
		for _, value := range values {
			if value == "" {
				continue
			}
			found := false
			for _, existing := range urls {
				if existing == value {
					found = true
					break
				}
			}
			if !found {
				urls = append(urls, value)
			}
		}
	}
	switch typed := source.(type) {
	case nil:
		return urls
	case string:
		clean := strings.TrimSpace(typed)
		if clean == "" {
			return urls
		}
		if strings.Contains(clean, "<img") || strings.Contains(clean, "&lt;img") {
			if !allowHTML {
				return urls
			}
			for _, match := range htmlImagePattern.FindAllStringSubmatch(clean, -1) {
				add([]string{media.NormalizeImageURLToStandardJpg(strings.TrimSpace(match[1]))})
			}
			return urls
		}
		if strings.HasPrefix(clean, "//") {
			clean = "https:" + clean
		}
		if strings.HasPrefix(clean, "http://") || strings.HasPrefix(clean, "https://") {
			add([]string{media.NormalizeImageURLToStandardJpg(clean)})
		}
	case []any:
		for _, item := range typed {
			add(extractURLs(item, allowHTML))
		}
	case map[string]any:
		for _, key := range []string{"url", "pic_url", "item_img", "prop_img", "sku"} {
			if typed[key] != nil {
				add(extractURLs(typed[key], allowHTML))
			}
		}
		for key, value := range typed {
			switch key {
			case "url", "pic_url", "item_img", "prop_img", "sku", "sku_url", "detail_url":
				continue
			}
			text, isText := value.(string)
			if isText && (strings.HasPrefix(text, "http") || strings.HasPrefix(text, "//") || strings.Contains(text, "<img")) {
				add(extractURLs(text, allowHTML))
				continue
			}
			if _, isMap := value.(map[string]any); isMap {
				add(extractURLs(value, allowHTML))
			}
			if _, isList := value.([]any); isList {
				add(extractURLs(value, allowHTML))
			}
		}
	}
	return urls
}

type wanbangStatusError struct{ status int }

func (err wanbangStatusError) Error() string { return "万邦网关请求失败" }

func fetchWanbang(ctx context.Context, client *http.Client, rawURL string) (map[string]any, error) {
	if client == nil {
		return nil, wanbangStatusError{status: http.StatusBadGateway}
	}
	var last error
	for attempt := 0; attempt < 2; attempt++ {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		requestCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		request, err := http.NewRequestWithContext(requestCtx, http.MethodGet, rawURL, nil)
		if err != nil {
			cancel()
			return nil, err
		}
		request.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
		response, err := client.Do(request)
		if err != nil {
			cancel()
			last = err
			if attempt == 1 || ctx.Err() != nil {
				return nil, err
			}
			time.Sleep(time.Second)
			continue
		}
		body, readErr := io.ReadAll(io.LimitReader(response.Body, 8<<20))
		response.Body.Close()
		cancel()
		if response.StatusCode < 200 || response.StatusCode >= 300 {
			statusErr := wanbangStatusError{status: response.StatusCode}
			if statusErr.status < 500 && statusErr.status != http.StatusRequestTimeout {
				return nil, statusErr
			}
			last = statusErr
			if attempt == 1 {
				return nil, statusErr
			}
			time.Sleep(time.Second)
			continue
		}
		if readErr != nil {
			return nil, readErr
		}
		parsed, permanent, err := parseWanbang(body, response.Header.Get("Content-Type"), response.StatusCode)
		if err != nil {
			return nil, err
		}
		if permanent || attempt == 1 || !temporaryWanbang(parsed) {
			return parsed, nil
		}
		last = errTemporary
		time.Sleep(time.Second)
	}
	return nil, last
}

var errTemporary = wanbangStatusError{status: http.StatusBadGateway}

func parseWanbang(body []byte, contentType string, status int) (map[string]any, bool, error) {
	text := strings.TrimSpace(string(body))
	if text == "" {
		return nil, false, wanbangStatusError{status: status}
	}
	var parsed map[string]any
	decoder := json.NewDecoder(strings.NewReader(text))
	decoder.UseNumber()
	if err := decoder.Decode(&parsed); err != nil || parsed == nil {
		return nil, false, wanbangStatusError{status: status}
	}
	message := strings.ToLower(stringify(parsed["error"]) + " " + stringify(parsed["reason"]) + " " + stringify(parsed["error_code"]))
	permanent := strings.Contains(message, "not-found") || strings.Contains(message, "不存在") || strings.Contains(message, "下架") || strings.Contains(message, "invalid") || strings.Contains(message, "empty") || strings.Contains(message, "apikey")
	if !permanent {
		switch stringify(parsed["error_code"]) {
		case "2000", "4003", "4004", "4005", "4006", "4007", "4008", "4009", "4010", "4012", "4013", "4014", "4015", "4016":
			permanent = true
		}
	}
	_ = contentType
	return parsed, permanent, nil
}

func temporaryWanbang(data map[string]any) bool {
	switch stringify(data["error_code"]) {
	case "4000", "4001", "4002", "4017", "5000":
		return true
	default:
		return false
	}
}

func joinText(values ...any) string {
	parts := []string{}
	for _, value := range values {
		if text, ok := value.(string); ok && text != "" {
			parts = append(parts, text)
		}
	}
	return strings.Join(parts, "；")
}

func asAny(values []string) []any {
	items := make([]any, len(values))
	for index, value := range values {
		items[index] = value
	}
	return items
}

func stringify(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case json.Number:
		return typed.String()
	case nil:
		return ""
	default:
		body, _ := json.Marshal(typed)
		return strings.Trim(string(body), `"`)
	}
}
