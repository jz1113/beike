package collect

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
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

func productTitleFailure(title string) (collectionFailure, bool) {
	if !rateLimitPattern.MatchString(title) {
		return collectionFailure{}, false
	}
	retryable := false
	return collectionFailure{error: "电商采集接口触发上游频控或安全验证，请降低并发或稍后重试", status: http.StatusTooManyRequests, stop: true, retryable: &retryable, includeRetryable: true}, true
}

func wanbangReportedError(value any) bool {
	switch strings.ToLower(strings.TrimSpace(stringify(value))) {
	case "", "ok", "success":
		return false
	default:
		return true
	}
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
	case "4000":
		failure.error = "万邦采集接口服务器异常，请稍后重试"
		failure.status = http.StatusBadGateway
		yes := true
		failure.retryable = &yes
		failure.stop = false
		return failure
	case "4001":
		failure.error = "万邦采集接口网络异常，请稍后重试"
		failure.status = http.StatusBadGateway
		yes := true
		failure.retryable = &yes
		failure.stop = false
		return failure
	case "4002":
		failure.error = "万邦采集接口访问目标站点失败，请稍后重试"
		failure.status = http.StatusBadGateway
		yes := true
		failure.retryable = &yes
		failure.stop = false
		return failure
	case "5000":
		failure.error = "万邦采集接口返回未知错误，请稍后重试"
		failure.status = http.StatusBadGateway
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

func joinText(values ...any) string {
	parts := []string{}
	for _, value := range values {
		if text, ok := value.(string); ok && text != "" {
			parts = append(parts, text)
		}
	}
	return strings.Join(parts, "；")
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
