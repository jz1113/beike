package system

import (
	"context"
	"encoding/json"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/network"
)

func gatewayUserHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var payload map[string]any
		if raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20)); err == nil && json.Valid(raw) {
			_ = json.Unmarshal(raw, &payload)
		}
		if payload == nil {
			payload = map[string]any{}
		}
		base := normalizeGatewayBaseURL(firstTextValue(payload["baseUrl"], r.Header.Get("x-custom-base-url"), os.Getenv("AI_DRAWING_BASE_URL"), "https://ai.comfly.org"))
		if base == "" {
			base = "https://ai.comfly.org"
		}
		userID := strings.TrimSpace(firstTextValue(payload["userId"], r.Header.Get("new-api-user")))
		token := strings.TrimSpace(firstTextValue(payload["systemToken"], r.Header.Get("x-gateway-system-token"), bearerToken(r)))
		if userID == "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "缺少用户 ID (New-API-User)，请在个人中心查看并填入用户 ID"})
			return
		}
		if token == "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "缺少系统访问令牌，请在网关个人中心生成并填入系统令牌（非 API 令牌）"})
			return
		}
		zone := "Asia/Shanghai"
		if text, ok := payload["timeZone"].(string); ok && text != "" {
			zone = text
		}
		status, body := fetchGatewayUser(r.Context(), network.SafeClient(), base, userID, token, zone)
		httpx.WriteJSON(w, status, body)
	}
}

func fetchGatewayUser(ctx context.Context, client *http.Client, base, userID, token, zone string) (int, map[string]any) {
	requestCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	data, status, err := gatewayGET(requestCtx, client, base+"/api/user/self", token, userID)
	if err != nil {
		if requestCtx.Err() != nil && ctx.Err() == nil {
			return http.StatusGatewayTimeout, map[string]any{"success": false, "error": "请求网关接口超时 (15s)，请检查网络或 Base URL 是否可达"}
		}
		return http.StatusGatewayTimeout, map[string]any{"success": false, "error": "连接网关失败"}
	}
	if status >= 200 && status < 300 && data["success"] != false && (data["data"] != nil || data["quota"] != nil || data["username"] != nil) {
		raw, _ := data["data"].(map[string]any)
		if raw == nil {
			raw = data
		}
		return http.StatusOK, map[string]any{"success": true, "user": newAPIUser(raw, userID)}
	}
	if billed, ok := billingUser(requestCtx, client, base, userID, token, zone); ok {
		return http.StatusOK, map[string]any{"success": true, "user": billed}
	}
	message := firstTextValue(data["message"])
	if nested, ok := data["error"].(map[string]any); ok {
		message = firstTextValue(nested["message"], message)
	}
	switch status {
	case http.StatusUnauthorized:
		message = appendDetail("系统访问令牌 (System Token) 无效或未授权，请检查令牌是否正确复制（切勿有多余空格）", message)
	case http.StatusForbidden:
		message = appendDetail("无权访问该用户信息，请核对用户 ID (New-API-User) 是否匹配", message)
	case http.StatusNotFound:
		message = appendDetail("网关接口未找到或用户不存在，请检查 Base URL 与用户 ID", message)
	default:
		if data["success"] == false {
			message = appendDetail("系统访问令牌 (System Token) 无效或未授权，请检查令牌是否正确复制（切勿有多余空格）", message)
		} else if message == "" {
			message = "网关响应异常 (HTTP " + strconv.Itoa(status) + ")"
		}
	}
	httpStatus := status
	if httpStatus < 400 || httpStatus >= 600 {
		httpStatus = http.StatusBadRequest
	}
	return httpStatus, map[string]any{"success": false, "error": message, "rawStatus": status}
}

func newAPIUser(raw map[string]any, userID string) map[string]any {
	quota := numberValue(raw["quota"])
	used := numberValue(raw["used_quota"])
	formatted := round2(quota / 500000)
	usedFormatted := round2(used / 500000)
	total := quota + used
	remaining := 0
	if total > 0 {
		remaining = int(math.Min(100, math.Max(0, math.Round(quota/total*100))))
	}
	name := firstTextValue(raw["username"])
	if name == "" {
		name = "用户 #" + userID
	}
	display := firstTextValue(raw["display_name"], name)
	id := raw["id"]
	if id == nil {
		id = userID
	}
	return map[string]any{
		"id": id, "username": name, "displayName": display, "email": firstTextValue(raw["email"]),
		"quota": quota, "usedQuota": used, "quotaFormatted": formatted, "quotaRmb": round2(formatted * 1.2),
		"usedQuotaFormatted": usedFormatted, "usedQuotaRmb": round2(usedFormatted * 1.2), "remainingPercent": remaining,
		"requestCount": numberValue(raw["request_count"]), "group": firstTextValue(raw["group"], "default"),
	}
}

func billingUser(ctx context.Context, client *http.Client, base, userID, token, zone string) (map[string]any, bool) {
	data, status, err := gatewayGET(ctx, client, base+"/dashboard/billing/subscription", token, "")
	if err != nil || status < 200 || status >= 300 || data["object"] != "billing_subscription" {
		return nil, false
	}
	start, end := billingDates(time.Now(), zone)
	usage, usageStatus, usageErr := gatewayGET(ctx, client, base+"/dashboard/billing/usage?start_date="+url.QueryEscape(start)+"&end_date="+url.QueryEscape(end), token, "")
	cents := any(nil)
	if usageErr == nil && usageStatus >= 200 && usageStatus < 300 {
		cents = usage["total_usage"]
	}
	amounts := billingAmounts(data["hard_limit_usd"], cents)
	user := map[string]any{
		"id": userID, "username": "用户 #" + userID, "displayName": "用户 #" + userID, "email": "",
		"quota": amounts["quotaFormatted"].(float64) * 500000, "usedQuota": amounts["usedQuotaFormatted"].(float64) * 500000,
		"requestCount": 0, "group": "DEFAULT",
	}
	for key, value := range amounts {
		user[key] = value
	}
	return user, true
}

func gatewayGET(ctx context.Context, client *http.Client, rawURL, token, userID string) (map[string]any, int, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, 0, err
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Accept", "application/json")
	if userID != "" {
		request.Header.Set("New-API-User", userID)
		request.Header.Set("Content-Type", "application/json")
	}
	if client == nil {
		client = network.SafeClient()
	}
	response, err := client.Do(request)
	if err != nil {
		return nil, 0, err
	}
	defer response.Body.Close()
	var data map[string]any
	decoder := json.NewDecoder(io.LimitReader(response.Body, 2<<20))
	decoder.UseNumber()
	_ = decoder.Decode(&data)
	if data == nil {
		data = map[string]any{}
	}
	return data, response.StatusCode, nil
}

func billingDates(now time.Time, zone string) (string, string) {
	location, err := time.LoadLocation(zone)
	if err != nil {
		location, _ = time.LoadLocation("Asia/Shanghai")
	}
	local := now.In(location)
	return local.Format("2006") + "-01-01", local.Format("2006-01-02")
}

func billingAmounts(limitValue, centsValue any) map[string]any {
	limit, limitOK := nonnegative(limitValue)
	cents, centsOK := nonnegative(centsValue)
	used := 0.0
	if centsOK {
		used = round2(cents / 100)
	}
	balance := limitOK && centsOK
	remaining := 0.0
	if balance {
		remaining = round2(math.Max(0, limit-used))
	}
	total := remaining + used
	percent := 0
	if balance && total > 0 {
		percent = int(math.Min(100, math.Max(0, math.Round(remaining/total*100))))
	}
	return map[string]any{
		"usageAvailable": centsOK, "balanceAvailable": balance, "quotaFormatted": remaining, "usedQuotaFormatted": used,
		"quotaRmb": round2(remaining * 1.2), "usedQuotaRmb": round2(used * 1.2), "remainingPercent": percent,
	}
}

func nonnegative(value any) (float64, bool) {
	switch typed := value.(type) {
	case json.Number:
		parsed, err := typed.Float64()
		return parsed, err == nil && parsed >= 0
	case float64:
		return typed, !math.IsNaN(typed) && typed >= 0
	case string:
		if strings.TrimSpace(typed) == "" {
			return 0, false
		}
		parsed, err := strconv.ParseFloat(typed, 64)
		return parsed, err == nil && parsed >= 0
	default:
		return 0, false
	}
}

func numberValue(value any) float64 {
	parsed, ok := nonnegative(value)
	if !ok {
		return 0
	}
	return parsed
}

func round2(value float64) float64 {
	return math.Round(value*100) / 100
}

func firstTextValue(values ...any) string {
	for _, value := range values {
		text, ok := value.(string)
		if ok && strings.TrimSpace(text) != "" {
			return strings.TrimSpace(text)
		}
	}
	return ""
}

func bearerToken(r *http.Request) string {
	auth := r.Header.Get("Authorization")
	if len(auth) > 7 && strings.EqualFold(auth[:7], "bearer ") {
		return strings.TrimSpace(auth[7:])
	}
	return ""
}

func appendDetail(prefix, detail string) string {
	if detail == "" {
		return prefix
	}
	return prefix + " (" + detail + ")"
}
