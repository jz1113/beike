package keywords

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/network"
	"beike.local/cloud/src/backend/internal/system"
)

const keywordDeepSeekBaseURL = "https://api.deepseek.com"

type balanceFetch func(context.Context, string) (map[string]any, int, error)

func keywordBalanceHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		status, body := keywordBalance(r, fetchDeepSeekBalance)
		httpx.WriteJSON(w, status, body)
	}
}

func keywordBalance(r *http.Request, fetch balanceFetch) (int, map[string]any) {
	raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil || len(strings.TrimSpace(string(raw))) == 0 || !json.Valid(raw) {
		return http.StatusBadRequest, map[string]any{"success": false, "error": "请求数据格式异常"}
	}
	baseURL, apiKey, message := parseBalanceRequest(raw)
	if message != "" {
		return http.StatusBadRequest, map[string]any{"success": false, "error": message}
	}
	baseURL = system.NormalizeGatewayBaseURL(baseURL)
	if baseURL != keywordDeepSeekBaseURL {
		return http.StatusBadRequest, map[string]any{"success": false, "error": "词包审核只接受 DeepSeek 官方接口，请到设置里填写 DeepSeek API Key"}
	}
	apiKey = strings.TrimSpace(apiKey)
	if apiKey == "" {
		return http.StatusBadRequest, map[string]any{"success": false, "error": "未配置 DeepSeek API Key，请到设置里的 DeepSeek 官方服务填写"}
	}
	data, status, err := fetch(r.Context(), apiKey)
	if err != nil {
		return http.StatusBadGateway, map[string]any{"success": false, "error": balanceTransportError(err)}
	}
	if status < 200 || status >= 300 {
		return status, map[string]any{"success": false, "error": deepSeekFailure(status, data, "DeepSeek"), "code": "deepseek_api_error"}
	}
	balance, err := pickDeepSeekBalance(data)
	if err != nil {
		return http.StatusBadGateway, map[string]any{"success": false, "error": err.Error()}
	}
	return http.StatusOK, map[string]any{
		"success": true, "currency": balance.currency, "total": balance.total,
		"granted": balance.granted, "toppedUp": balance.toppedUp, "available": balance.available,
	}
}

func fetchDeepSeekBalance(ctx context.Context, apiKey string) (map[string]any, int, error) {
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	return system.GatewayGET(ctx, network.SafeClient(), keywordDeepSeekBaseURL+"/user/balance", apiKey, "")
}

type deepSeekBalance struct {
	currency, total, granted, toppedUp string
	available                          bool
}

func pickDeepSeekBalance(data map[string]any) (deepSeekBalance, error) {
	infos, _ := data["balance_infos"].([]any)
	var cny, usd map[string]any
	for _, item := range infos {
		info, ok := item.(map[string]any)
		if !ok {
			continue
		}
		switch info["currency"] {
		case "CNY":
			if cny == nil {
				cny = info
			}
		case "USD":
			if usd == nil {
				usd = info
			}
		}
	}
	chosen := cny
	if chosen == nil {
		chosen = usd
	}
	if chosen == nil {
		return deepSeekBalance{}, fmt.Errorf("未能读取 DeepSeek 余额")
	}
	currency, _ := chosen["currency"].(string)
	if currency != "CNY" && currency != "USD" {
		return deepSeekBalance{}, fmt.Errorf("未能读取 DeepSeek 余额")
	}
	return deepSeekBalance{
		currency: currency, total: balanceAmount(chosen["total_balance"]),
		granted: balanceAmount(chosen["granted_balance"]), toppedUp: balanceAmount(chosen["topped_up_balance"]),
		available: data["is_available"] == true,
	}, nil
}

func balanceAmount(value any) string {
	if value == nil {
		return "0"
	}
	switch typed := value.(type) {
	case string:
		return typed
	case json.Number:
		return typed.String()
	case float64:
		return strconvFormat(typed)
	default:
		return fmt.Sprint(typed)
	}
}

func strconvFormat(value float64) string {
	text := fmt.Sprintf("%v", value)
	return text
}

func parseBalanceRequest(raw []byte) (string, string, string) {
	var payload any
	if json.Unmarshal(raw, &payload) != nil {
		return "", "", "请求数据格式异常"
	}
	object, ok := payload.(map[string]any)
	if !ok {
		return "", "", "Expected object, received " + jsonKind(payload)
	}
	base, message := optionalStringField(object, "customBaseUrl")
	if message != "" {
		return "", "", message
	}
	key, message := optionalStringField(object, "customApiKey")
	return base, key, message
}

func optionalStringField(object map[string]any, key string) (string, string) {
	value, ok := object[key]
	if !ok {
		return "", ""
	}
	text, ok := value.(string)
	if !ok {
		return "", key + ": Expected string, received " + jsonKind(value)
	}
	return text, ""
}

func jsonKind(value any) string {
	switch value.(type) {
	case nil:
		return "null"
	case string:
		return "string"
	case bool:
		return "boolean"
	case float64, json.Number:
		return "number"
	case []any:
		return "array"
	default:
		return "object"
	}
}

func balanceTransportError(err error) string {
	message := err.Error()
	lower := strings.ToLower(message)
	if strings.Contains(lower, "timeout") || strings.Contains(lower, "deadline") {
		return "模型响应超时，已生成内容已保留。请稍后继续，或检查上游服务的超时设置。"
	}
	if strings.Contains(lower, "refused") || strings.Contains(lower, "no such host") || strings.Contains(lower, "network") {
		return "网络连接失败，请检查网络或 API 地址"
	}
	return "余额查询失败"
}

var deepSeekHints = map[int]string{
	400: "DeepSeek 请求格式有误，请检查本批请求参数",
	401: "DeepSeek API Key 无效或已失效，请到设置中检查密钥",
	402: "DeepSeek 账户余额不足，请检查余额或充值",
	422: "DeepSeek 请求参数有误，请检查模型和参数配置",
	429: "DeepSeek 请求过于频繁，请稍后重试",
	500: "DeepSeek 服务暂时故障，请稍后重试",
	503: "DeepSeek 服务繁忙，请稍后重试",
	504: "DeepSeek 在约 120 秒切断了响应，请减少每批词数后重试",
	524: "DeepSeek 在约 120 秒切断了响应，请减少每批词数后重试",
}

func deepSeekFailure(status int, data map[string]any, provider string) string {
	hint := deepSeekHints[status]
	if hint == "" {
		hint = "DeepSeek 请求失败，请稍后重试"
	}
	if provider != "DeepSeek" {
		hint = strings.ReplaceAll(strings.ReplaceAll(hint, "DeepSeek ", provider), "DeepSeek", provider)
	}
	detail := upstreamDetail(data)
	if detail == "" {
		if status == http.StatusGatewayTimeout || status == 524 {
			return fmt.Sprintf("%s（HTTP %d）", hint, status)
		}
		return hint
	}
	return hint + "。接口原因：" + detail
}

func upstreamDetail(data map[string]any) string {
	if data == nil {
		return ""
	}
	switch errorValue := data["error"].(type) {
	case string:
		return clipRunes(strings.TrimSpace(errorValue), 300)
	case map[string]any:
		text, _ := errorValue["message"].(string)
		return clipRunes(strings.TrimSpace(text), 300)
	default:
		return ""
	}
}

func clipRunes(value string, max int) string {
	runes := []rune(value)
	if len(runes) <= max {
		return value
	}
	return string(runes[:max])
}
