package catalog

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/network"
)

var shareURLPattern = regexp.MustCompile(`(?i)https?://[^\s"'<>，。；）)]+`)
var imagePathPattern = regexp.MustCompile(`(?i)\.(jpg|jpeg|png|webp|gif|bmp|avif)$`)

// ParseSocialRequest runs the same social-link parser the catalog route uses.
func ParseSocialRequest(cfg config.Config, r *http.Request, raw string) (int, map[string]any) {
	return parseSocialLink(cfg, r, map[string]any{"url": raw})
}

func parseSocialLink(cfg config.Config, r *http.Request, body map[string]any) (int, map[string]any) {
	raw := firstSocialText(body, "url", "text", "link", "query")
	if raw == "" {
		return http.StatusBadRequest, map[string]any{"error": "请输入有效的小红书/抖音/快手/视频号分享链接或图片网址"}
	}
	target := extractShareURL(raw)
	parsed, err := url.Parse(target)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.User != nil {
		return http.StatusBadRequest, map[string]any{"success": false, "error": "请输入包含 http(s) 地址的有效分享链接或图片网址"}
	}
	if imagePathPattern.MatchString(parsed.Path) {
		media := map[string]any{"title": "图片直链素材", "cover": target, "images": []string{target}, "description": "", "author": "", "video": nil, "videos": []string{}}
		return http.StatusOK, map[string]any{"success": true, "title": "图片直链素材", "cover": target, "images": []string{target}, "video": nil, "videos": []string{}, "data": media}
	}
	fallback := !cfg.Production()
	qAppID := firstHeader(body, r, "qiyunAppId", "customQiyunAppId", "x-qiyun-appid", envFallback(fallback, "QIYUN_APP_ID"))
	qAppKey := firstHeader(body, r, "qiyunAppKey", "customQiyunAppKey", "x-qiyun-appkey", envFallback(fallback, "QIYUN_APP_KEY"))
	apiaSecret := firstHeader(body, r, "scraperSecret", "customApiKey", "x-apia-secret-key", envFallback(fallback, "EXTERNAL_SCRAPER_SECRET"))
	apiaClient := firstHeader(body, r, "scraperId", "customScraperId", "x-apia-client-id", envFallback(fallback, "EXTERNAL_SCRAPER_ID"))
	hasQiyun := qAppID != "" && qAppKey != ""
	hasApia := apiaSecret != "" && apiaClient != ""
	if !hasQiyun && !hasApia {
		return http.StatusBadRequest, map[string]any{"success": false, "error": "未配置社媒解析密钥。请前往「设置 -> 服务接口配置」配置「奇云解析 (支持30+主流平台)」或「APIA 解析」。"}
	}
	host := strings.ToLower(parsed.Hostname())
	needsQiyun := hostIs(host, "weixin.qq.com", "weibo.com", "weibo.cn", "bilibili.com", "b23.tv", "pipix.com", "pipixia.com")
	if needsQiyun && !hasQiyun {
		return http.StatusBadRequest, map[string]any{"success": false, "error": "该平台需要奇云解析，请在「设置 -> 服务接口配置」配置奇云 AppId 和 AppKey"}
	}
	preferred, _ := body["preferredScraper"].(string)
	qiyunFirst := preferred == "qiyun" || needsQiyun || (hasQiyun && !hasApia)
	order := []string{}
	if qiyunFirst {
		if hasQiyun {
			order = append(order, "奇云")
		}
		if hasApia && !needsQiyun {
			order = append(order, "APIA")
		}
	} else {
		if hasApia {
			order = append(order, "APIA")
		}
		if hasQiyun {
			order = append(order, "奇云")
		}
	}
	attempts := []map[string]any{}
	var last map[string]any
	for _, provider := range order {
		var media map[string]any
		var failure map[string]any
		if provider == "奇云" {
			media, failure = callQiyun(r.Context(), raw, qAppID, qAppKey)
		} else {
			media, failure = callApia(r.Context(), target, apiaSecret, apiaClient)
		}
		if media != nil {
			attempts = append(attempts, map[string]any{"provider": provider, "success": true})
			return http.StatusOK, map[string]any{
				"success": true, "title": media["title"], "description": media["description"], "author": media["author"],
				"cover": media["cover"], "images": media["images"], "video": media["video"], "videos": media["videos"],
				"apiUsed": provider, "attempts": attempts, "data": media,
			}
		}
		attempts = append(attempts, failure)
		last = failure
	}
	if last == nil {
		return http.StatusInternalServerError, map[string]any{"success": false, "error": "解析调度异常，无可用解析引擎", "attempts": attempts}
	}
	status, _ := last["status"].(int)
	if status == 0 {
		status = http.StatusBadGateway
	}
	return status, map[string]any{
		"success": false, "error": last["error"], "attempts": attempts, "upstreamCode": last["upstreamCode"], "httpStatus": last["httpStatus"], "retryable": last["retryable"],
	}
}

func callQiyun(ctx context.Context, raw, appID, appKey string) (map[string]any, map[string]any) {
	payload, _ := json.Marshal(map[string]string{"appId": appID, "appKey": appKey, "url": extractShareURL(raw)})
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://qyapi.ipaybuy.cn/api/video", strings.NewReader(string(payload)))
	if err != nil {
		return nil, socialFail("奇云", "", "连接奇云网关失败", 0)
	}
	request.Header.Set("Content-Type", "application/json")
	client := network.SafeClient()
	client.Timeout = 25 * time.Second
	response, err := client.Do(request)
	if err != nil {
		return nil, socialFail("奇云", "", "连接奇云网关失败", 0)
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, socialFail("奇云", response.StatusCode, "奇云网关返回 HTTP "+response.Status, response.StatusCode)
	}
	var data map[string]any
	if json.Unmarshal(body, &data) != nil {
		return nil, socialFail("奇云", "", "奇云接口返回空响应", 0)
	}
	if codeText(data["code"]) == "200" {
		item, _ := data["data"].(map[string]any)
		if item != nil {
			return qiyunMedia(item), nil
		}
	}
	return nil, socialFail("奇云", data["code"], qiyunError(data), 0)
}

func callApia(ctx context.Context, target, secret, clientID string) (map[string]any, map[string]any) {
	endpoint := "https://apia.vip/api/dsp/" + url.PathEscape(secret) + "/" + url.PathEscape(clientID) + "/"
	attempts := []struct{ method, body string }{
		{http.MethodGet, ""},
		{http.MethodPost, "json"},
		{http.MethodPost, "form"},
	}
	var last map[string]any
	for _, attempt := range attempts {
		requestURL := endpoint
		var reader io.Reader
		if attempt.method == http.MethodGet {
			requestURL += "?url=" + url.QueryEscape(target)
		} else if attempt.body == "form" {
			reader = strings.NewReader("url=" + url.QueryEscape(target))
		} else {
			raw, _ := json.Marshal(map[string]string{"url": target})
			reader = strings.NewReader(string(raw))
		}
		request, err := http.NewRequestWithContext(ctx, attempt.method, requestURL, reader)
		if err != nil {
			continue
		}
		if attempt.body == "json" {
			request.Header.Set("Content-Type", "application/json")
		}
		if attempt.body == "form" {
			request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		}
		client := network.SafeClient()
		client.Timeout = 30 * time.Second
		response, err := client.Do(request)
		if err != nil {
			last = socialFail("APIA", "", "连接 APIA 解析网关失败", 0)
			return nil, last
		}
		body, _ := io.ReadAll(io.LimitReader(response.Body, 4<<20))
		response.Body.Close()
		if response.StatusCode < 200 || response.StatusCode >= 300 {
			last = socialFail("APIA", response.StatusCode, "APIA 网关返回 HTTP "+response.Status, response.StatusCode)
			if response.StatusCode != http.StatusMethodNotAllowed {
				return nil, last
			}
			continue
		}
		var data map[string]any
		if json.Unmarshal(body, &data) != nil {
			last = socialFail("APIA", "", "APIA 接口返回无效响应", 0)
			return nil, last
		}
		code := codeText(data["code"])
		if code == "155" || code == "104" || code == "110" {
			return nil, socialFail("APIA", data["code"], apiaError(code, data), 0)
		}
		if code != "" && code != "200" {
			return nil, socialFail("APIA", data["code"], apiaError(code, data), 0)
		}
		if media := apiaMedia(data); len(stringList(media["images"])) > 0 || media["video"] != nil {
			return media, nil
		}
		last = socialFail("APIA", data["code"], "接口未返回有效图片或视频素材", 0)
	}
	if last == nil {
		last = socialFail("APIA", "", "连接 APIA 解析网关失败", 0)
	}
	return nil, last
}

func qiyunMedia(item map[string]any) map[string]any {
	images := []string{}
	videos := []string{}
	if list, ok := item["images"].([]any); ok {
		for _, image := range list {
			switch typed := image.(type) {
			case string:
				if text := strings.TrimSpace(typed); text != "" {
					images = append(images, text)
				}
			case map[string]any:
				if text, _ := typed["url"].(string); strings.TrimSpace(text) != "" {
					images = append(images, strings.TrimSpace(text))
				}
			}
		}
	}
	if text, _ := item["video_url"].(string); strings.TrimSpace(text) != "" {
		videos = append(videos, strings.TrimSpace(text))
	}
	cover, _ := item["cover_url"].(string)
	cover = strings.TrimSpace(cover)
	if len(videos) == 0 && len(images) == 0 && cover != "" {
		images = append(images, cover)
	}
	title, _ := item["title"].(string)
	content, _ := item["content"].(string)
	if strings.TrimSpace(content) == "" {
		content = title
	}
	author := ""
	if person, ok := item["author"].(map[string]any); ok {
		author, _ = person["name"].(string)
	}
	var video any
	if len(videos) > 0 {
		video = videos[0]
	}
	if len(images) == 0 && video == nil {
		return nil
	}
	return map[string]any{"title": strings.TrimSpace(title), "description": strings.TrimSpace(content), "author": strings.TrimSpace(author), "cover": firstNonEmpty(cover, images), "images": images, "video": video, "videos": videos}
}

func apiaMedia(data map[string]any) map[string]any {
	root, _ := data["data"].(map[string]any)
	if root == nil {
		root = data
	}
	title, _ := root["title"].(string)
	description, _ := root["desc"].(string)
	images := stringList(root["images"])
	videos := stringList(root["videos"])
	if text, _ := root["video"].(string); text != "" {
		videos = append(videos, text)
	}
	var video any
	if len(videos) > 0 {
		video = videos[0]
	}
	cover, _ := root["cover"].(string)
	return map[string]any{"title": title, "description": description, "author": "", "cover": firstNonEmpty(cover, images), "images": images, "video": video, "videos": videos}
}

func socialFail(provider string, code any, message string, httpStatus int) map[string]any {
	status := http.StatusBadGateway
	retryable := true
	value := codeText(code)
	switch {
	case httpStatus == 429 || value == "3001" || value == "429":
		status, retryable = http.StatusTooManyRequests, false
	case value == "3002" || value == "3003" || value == "110":
		status, retryable = http.StatusPaymentRequired, false
	case httpStatus == 401 || httpStatus == 403 || value == "401" || value == "403" || value == "155" || value == "1001" || value == "1005":
		status, retryable = http.StatusBadRequest, false
	case value == "204" || value == "500" || value == "103" || value == "113" || value == "114":
		status, retryable = http.StatusUnprocessableEntity, false
	case value == "104":
		status, retryable = http.StatusServiceUnavailable, false
	case httpStatus >= 500:
		status = http.StatusBadGateway
	case httpStatus >= 400:
		status, retryable = httpStatus, false
	}
	failure := map[string]any{"provider": provider, "success": false, "error": message, "status": status, "retryable": retryable}
	if code != nil && code != "" {
		failure["upstreamCode"] = code
	}
	if httpStatus != 0 {
		failure["httpStatus"] = httpStatus
	}
	return failure
}

func qiyunError(data map[string]any) string {
	switch codeText(data["code"]) {
	case "204":
		return "暂时不支持解析该平台或作者设置了权限"
	case "500":
		return "解析失败，请检查链接是否正确或该作品是否已被删除"
	case "1001":
		return "参数错误，请检查请求参数"
	case "3001":
		return "请求过于频繁，请稍后再试"
	case "3002":
		return "奇云解析调用次数不足，请升级套餐或充值"
	case "3003":
		return "奇云解析今日调用次数已达上限"
	}
	if text, _ := data["msg"].(string); text != "" {
		return text
	}
	return "短视频或图集解析异常"
}

func apiaError(code string, data map[string]any) string {
	switch code {
	case "103":
		return "请输入正确的作品链接"
	case "104":
		return "该解析接口已暂停使用"
	case "110":
		return "解析次数不足，请稍后再试"
	case "114":
		return "作品不存在或当前链接不受支持，请检查作品是否公开或换用 App 分享短链"
	case "155":
		return "接口密钥配置错误"
	}
	if text, _ := data["msg"].(string); text != "" {
		return text
	}
	return "作品链接解析异常"
}

func extractShareURL(raw string) string {
	match := shareURLPattern.FindString(raw)
	if match == "" {
		return strings.TrimSpace(raw)
	}
	return strings.TrimRight(match, "，。；）)")
}

func firstSocialText(body map[string]any, keys ...string) string {
	for _, key := range keys {
		if text, ok := body[key].(string); strings.TrimSpace(text) != "" && ok {
			return strings.TrimSpace(text)
		}
	}
	return ""
}

func firstHeader(body map[string]any, r *http.Request, bodyKey, altKey, header, envValue string) string {
	for _, key := range []string{bodyKey, altKey} {
		if text, ok := body[key].(string); ok && strings.TrimSpace(text) != "" {
			return strings.TrimSpace(text)
		}
	}
	if text := strings.TrimSpace(r.Header.Get(header)); text != "" {
		return text
	}
	return strings.TrimSpace(envValue)
}

func envFallback(enabled bool, key string) string {
	if !enabled {
		return ""
	}
	return os.Getenv(key)
}

func hostIs(host string, roots ...string) bool {
	for _, root := range roots {
		if host == root || strings.HasSuffix(host, "."+root) {
			return true
		}
	}
	return false
}

func codeText(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case int:
		return strconv.Itoa(typed)
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	default:
		return ""
	}
}

func stringList(value any) []string {
	list, ok := value.([]any)
	if !ok {
		return []string{}
	}
	texts := []string{}
	for _, item := range list {
		if text, ok := item.(string); ok && strings.TrimSpace(text) != "" {
			texts = append(texts, strings.TrimSpace(text))
		}
	}
	return texts
}

func firstNonEmpty(cover string, images []string) string {
	if strings.TrimSpace(cover) != "" {
		return strings.TrimSpace(cover)
	}
	if len(images) > 0 {
		return images[0]
	}
	return ""
}
