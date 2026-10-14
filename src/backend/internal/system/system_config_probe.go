package system

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"beike.local/cloud/src/backend/internal/platform/network"
)

func probeWanbang(ctx context.Context, client *http.Client, key, secret string, endpoints []string) (bool, string, string) {
	last := ""
	for _, endpoint := range endpoints {
		parsed, err := url.Parse(endpoint)
		if err != nil {
			last = "万邦网关请求失败"
			continue
		}
		query := parsed.Query()
		query.Set("key", key)
		query.Set("secret", secret)
		parsed.RawQuery = query.Encode()
		data, status, err := getJSON(ctx, client, parsed.String())
		if err != nil || status < 200 || status >= 300 {
			if status > 0 {
				last = "万邦网关请求失败（HTTP " + strconv.Itoa(status) + "）"
			} else {
				last = "万邦网关请求失败"
			}
			continue
		}
		code := stringifyConfig(data["error_code"])
		if code == "4005" || code == "1001" || code == "4001" {
			return false, "", "万邦接口鉴权失败 [" + code + "]: " + configReason(data, "请检查 Key 与 Secret")
		}
		if code != "" && code != "0000" {
			last = "万邦接口返回异常 [" + code + "]: " + configReason(data, "未知错误")
			continue
		}
		return true, wanbangQuota(stringifyConfig(data["api_info"])), ""
	}
	if last == "" {
		last = "万邦网关响应异常，请检查 Key 与 Secret"
	}
	return false, "", last
}

func wanbangQuota(info string) string {
	today := regexp.MustCompile(`today:(\d+)`).FindStringSubmatch(info)
	max := regexp.MustCompile(`max:(\d+)`).FindStringSubmatch(info)
	expires := regexp.MustCompile(`expires:([\d-]+)`).FindStringSubmatch(info)
	if len(max) < 2 {
		return ""
	}
	todayCount := "0"
	if len(today) == 2 {
		todayCount = today[1]
	}
	quota := " (今日调用: " + todayCount + " / 每日上限: " + max[1]
	if len(expires) == 2 {
		quota += " / 到期日: " + expires[1]
	}
	return quota + ")"
}

func probeMediaCatalog(ctx context.Context, client *http.Client, baseURL, apiKey, model string) (int, map[string]any) {
	data, status, err := authorizedJSON(ctx, client, http.MethodGet, strings.TrimRight(baseURL, "/")+"/v1/models", apiKey, nil)
	if err != nil || status < 200 || status >= 300 {
		code := status
		if code == 0 {
			code = http.StatusBadGateway
		}
		return http.StatusBadRequest, map[string]any{"success": false, "status": code, "error": "模型目录请求失败（HTTP " + strconv.Itoa(code) + "），请检查网关地址、凭证或额度。", "testedGeneration": false}
	}
	list, _ := data["data"].([]any)
	if list == nil {
		return http.StatusBadRequest, map[string]any{"success": false, "error": "网关未返回有效的模型目录，无法确认模型是否可见。", "testedGeneration": false}
	}
	visible := false
	for _, item := range list {
		object, _ := item.(map[string]any)
		if stringifyConfig(object["id"]) == model {
			visible = true
		}
	}
	message := "网关连接正常，但目录中未找到该模型；生成权限和可用性尚未确认。"
	if visible {
		message = "网关连接正常，模型在目录中可见；未执行图片或视频生成。"
	}
	return http.StatusOK, map[string]any{"success": true, "model": model, "modelVisible": visible, "testedGeneration": false, "message": message}
}

func probeChat(ctx context.Context, client *http.Client, baseURL, apiKey, model string) (int, map[string]any) {
	payload, _ := json.Marshal(map[string]any{
		"model": model, "max_tokens": 10,
		"messages": []map[string]string{{"role": "user", "content": "Ping. Reply \"PONG\" only."}},
	})
	_, status, err := authorizedJSON(ctx, client, http.MethodPost, strings.TrimRight(baseURL, "/")+"/v1/chat/completions", apiKey, payload)
	if err != nil || status < 200 || status >= 300 {
		return http.StatusBadRequest, map[string]any{"success": false, "status": status, "error": "接口响应异常"}
	}
	return http.StatusOK, map[string]any{"success": true, "model": model}
}

func probeQiyun(ctx context.Context, client *http.Client, endpoint, appID, appKey, testURL string) (bool, string, any) {
	body, _ := json.Marshal(map[string]string{"appId": appID, "appKey": appKey, "url": testURL})
	data, status, err := postJSON(ctx, client, endpoint, body)
	if err != nil {
		return false, "连接奇云网关失败", nil
	}
	if status < 200 || status >= 300 {
		return false, "奇云网关返回 HTTP " + strconv.Itoa(status), status
	}
	code := stringifyConfig(data["code"])
	if code == "200" {
		title := ""
		if item, ok := data["data"].(map[string]any); ok {
			title = stringifyConfig(item["title"])
		}
		if title == "" {
			title = "作品"
		}
		runes := []rune(title)
		if len(runes) > 20 {
			title = string(runes[:20])
		}
		return true, "奇云接口测试通过！已成功提取《" + title + "》", nil
	}
	if code == "204" || code == "500" {
		return true, "奇云 AppId/AppKey 凭证校验通过（测试样本返回状态码: " + code + "）", code
	}
	return false, "短视频或图集解析异常", code
}

func probeApia(ctx context.Context, client *http.Client, base, clientID, secret, testURL string) (bool, bool, any, string) {
	endpoint := strings.TrimRight(base, "/") + "/" + url.PathEscape(secret) + "/" + url.PathEscape(clientID) + "/"
	data, _, err := getJSON(ctx, client, endpoint+"?url="+url.QueryEscape(testURL))
	if err != nil || data == nil {
		payload, _ := json.Marshal(map[string]string{"url": testURL})
		data, _, err = postJSON(ctx, client, endpoint, payload)
	}
	if err != nil || data == nil {
		return false, false, nil, "连接 APIA 解析网关失败"
	}
	code := stringifyConfig(data["code"])
	authOK := code == "103" || code == "104" || code == "110" || code == "113" || code == "114"
	if code == "200" || code == "0" || code == "" && data["data"] != nil {
		return true, true, code, "APIA 密钥有效且小红书解析成功"
	}
	if authOK {
		return true, false, code, "APIA 密钥连通正常，但测试笔记未能解析 [" + code + "]"
	}
	return false, false, code, "APIA 密钥或 ID 配置错误 [155]"
}

func getJSON(ctx context.Context, client *http.Client, rawURL string) (map[string]any, int, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, 0, err
	}
	request.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	return doJSON(client, request)
}

func postJSON(ctx context.Context, client *http.Client, rawURL string, body []byte) (map[string]any, int, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, rawURL, bytes.NewReader(body))
	if err != nil {
		return nil, 0, err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	return doJSON(client, request)
}

func authorizedJSON(ctx context.Context, client *http.Client, method, rawURL, apiKey string, body []byte) (map[string]any, int, error) {
	request, err := http.NewRequestWithContext(ctx, method, rawURL, bytes.NewReader(body))
	if err != nil {
		return nil, 0, err
	}
	request.Header.Set("Authorization", "Bearer "+apiKey)
	request.Header.Set("Content-Type", "application/json")
	return doJSON(client, request)
}

func doJSON(client *http.Client, request *http.Request) (map[string]any, int, error) {
	if client == nil {
		client = network.SafeClient()
	}
	response, err := client.Do(request)
	if err != nil {
		return nil, 0, err
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	if err != nil {
		return nil, response.StatusCode, err
	}
	var data map[string]any
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	_ = decoder.Decode(&data)
	return data, response.StatusCode, nil
}

func configReason(data map[string]any, fallback string) string {
	for _, key := range []string{"reason", "error"} {
		if text := stringifyConfig(data[key]); text != "" {
			return text
		}
	}
	return fallback
}

func stringifyConfig(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case json.Number:
		return typed.String()
	default:
		return ""
	}
}
