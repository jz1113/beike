package collect

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

const wanbangBodyLimit = 8 << 20

// Product detail collection can take longer than a normal API read. Keep each
// attempt bounded while allowing the caller to cancel or impose a shorter limit.
const wanbangRequestTimeout = 60 * time.Second

type wanbangStatusError struct{ status int }

func (err wanbangStatusError) Error() string { return "万邦网关请求失败" }

type wanbangBodyError struct{ kind string }

func (err wanbangBodyError) Error() string { return "万邦采集接口响应异常: " + err.kind }

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

func collectionContextResult(ctx context.Context) Result {
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return failureResult(http.StatusGatewayTimeout, "采集请求已超时，请稍后重试")
	}
	return failureResult(499, "采集已取消")
}

func wanbangBodyFailure(err wanbangBodyError) collectionFailure {
	message := "万邦采集接口返回非 JSON 响应，请稍后重试"
	switch err.kind {
	case "empty":
		message = "万邦采集接口返回空响应，请稍后重试"
	case "tooLarge":
		message = "万邦采集接口响应超过 8 MiB 限制"
	}
	return collectionFailure{error: message, status: http.StatusBadGateway, stop: true}
}

// Keep the existing two-attempt ceiling per existing method. Protocol/body
// errors and permanent business errors never cause another paid request.
func fetchWanbang(ctx context.Context, client *http.Client, rawURL string) (map[string]any, error) {
	if client == nil {
		return nil, wanbangStatusError{status: http.StatusBadGateway}
	}
	for attempt := 0; attempt < 2; attempt++ {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		data, permanent, err := requestWanbang(ctx, client, rawURL)
		if err == nil && (permanent || attempt == 1 || !temporaryWanbang(data)) {
			return data, nil
		}
		if err != nil && (attempt == 1 || !retryWanbangRequest(err)) {
			return nil, err
		}
		if err := waitWanbangRetry(ctx); err != nil {
			return nil, err
		}
	}
	return nil, fmt.Errorf("万邦重试次数已用尽")
}

func requestWanbang(ctx context.Context, client *http.Client, rawURL string) (map[string]any, bool, error) {
	requestCtx, cancel := context.WithTimeout(ctx, wanbangRequestTimeout)
	defer cancel()
	request, err := http.NewRequestWithContext(requestCtx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, false, err
	}
	request.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	response, err := client.Do(request)
	if err != nil {
		return nil, false, err
	}
	defer response.Body.Close()
	body, readErr := io.ReadAll(io.LimitReader(response.Body, wanbangBodyLimit+1))
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, false, wanbangStatusError{status: response.StatusCode}
	}
	if readErr != nil {
		return nil, false, readErr
	}
	if len(body) > wanbangBodyLimit {
		return nil, false, wanbangBodyError{kind: "tooLarge"}
	}
	return parseWanbang(body, response.Header.Get("Content-Type"), response.StatusCode)
}

func retryWanbangRequest(err error) bool {
	switch failure := err.(type) {
	case wanbangBodyError:
		return false
	case wanbangStatusError:
		return failure.status >= 500 || failure.status == http.StatusRequestTimeout
	default:
		return true
	}
}

func waitWanbangRetry(ctx context.Context) error {
	timer := time.NewTimer(time.Second)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return ctx.Err()
	}
}

func parseWanbang(body []byte, contentType string, status int) (map[string]any, bool, error) {
	if len(body) > wanbangBodyLimit {
		return nil, false, wanbangBodyError{kind: "tooLarge"}
	}
	if len(bytes.TrimSpace(body)) == 0 {
		return nil, false, wanbangBodyError{kind: "empty"}
	}
	var parsed map[string]any
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	if err := decoder.Decode(&parsed); err != nil || parsed == nil {
		return nil, false, wanbangBodyError{kind: "nonJSON"}
	}
	var trailing any
	if decoder.Decode(&trailing) != io.EOF {
		return nil, false, wanbangBodyError{kind: "nonJSON"}
	}
	message := strings.ToLower(stringify(parsed["error"]) + " " + stringify(parsed["reason"]) + " " + stringify(parsed["error_code"]))
	permanent := strings.Contains(message, "not-found") || strings.Contains(message, "不存在") || strings.Contains(message, "下架") || strings.Contains(message, "invalid") || strings.Contains(message, "empty") || strings.Contains(message, "apikey")
	if !permanent {
		switch stringify(parsed["error_code"]) {
		case "2000", "4003", "4004", "4005", "4006", "4007", "4008", "4009", "4010", "4012", "4013", "4014", "4015", "4016":
			permanent = true
		}
	}
	_ = contentType // Valid JSON wins over unreliable upstream Content-Type.
	_ = status      // HTTP errors are handled separately from body errors.
	return parsed, permanent, nil
}

func temporaryWanbang(data map[string]any) bool {
	if data["item"] != nil && !wanbangReportedError(data["error"]) {
		switch stringify(data["error_code"]) {
		case "", "0", "0000":
			return false
		}
	}
	switch stringify(data["error_code"]) {
	case "4000", "4001", "4002", "4017", "5000":
		return true
	default:
		return false
	}
}
