package system

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

func requestTextProtocol(payload map[string]any) (string, bool) {
	value, exists := payload["textProtocol"]
	if !exists {
		return "", true
	}
	protocol, ok := value.(string)
	if !ok {
		return "", false
	}
	switch protocol {
	case "", "auto", "openai", "gemini", "anthropic":
		return protocol, true
	default:
		return "", false
	}
}

func catalogNativeProtocol(payload map[string]any, base string) string {
	for _, field := range []string{"catalogProtocol", "providerType", "provider", "textProtocol"} {
		value, _ := payload[field].(string)
		switch value {
		case "gemini", "anthropic":
			return value
		case "openai":
			return ""
		}
	}
	parsed, _ := url.Parse(base)
	if parsed != nil {
		switch strings.ToLower(parsed.Hostname()) {
		case "generativelanguage.googleapis.com":
			return "gemini"
		case "api.anthropic.com":
			return "anthropic"
		}
	}
	return ""
}

func readNativeModels(ctx context.Context, client *http.Client, base, key, protocol string) ([]any, int, string) {
	parsed, err := url.Parse(strings.TrimRight(base, "/"))
	if err != nil || parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" || (parsed.Scheme != "https" && parsed.Scheme != "http") {
		return nil, http.StatusBadRequest, "模型目录地址无效"
	}
	root := strings.TrimRight(parsed.Path, "/")
	if strings.HasSuffix(root, "/models") {
		root = strings.TrimSuffix(root, "/models")
	}
	if protocol == "gemini" {
		root = strings.TrimSuffix(root, "/v1")
		if !strings.HasSuffix(root, "/v1beta") {
			root += "/v1beta"
		}
	} else if !strings.HasSuffix(root, "/v1") {
		root += "/v1"
	}
	parsed.Path = root + "/models"
	requestCtx, cancel := context.WithTimeout(ctx, 40*time.Second)
	defer cancel()
	copyClient := *client
	copyClient.CheckRedirect = func(*http.Request, []*http.Request) error { return errors.New("原生模型目录不允许重定向") }
	list := []any{}
	seenPages := map[string]bool{}
	page := ""
	for count := 0; count < 20; count++ {
		query := url.Values{}
		if page != "" {
			if protocol == "gemini" {
				query.Set("pageToken", page)
			} else {
				query.Set("after_id", page)
			}
		}
		parsed.RawQuery = query.Encode()
		request, err := http.NewRequestWithContext(requestCtx, http.MethodGet, parsed.String(), nil)
		if err != nil {
			return nil, 0, "模型目录请求构造失败"
		}
		if protocol == "gemini" {
			request.Header.Set("x-goog-api-key", key)
		} else {
			request.Header.Set("x-api-key", key)
			request.Header.Set("anthropic-version", "2023-06-01")
		}
		response, err := copyClient.Do(request)
		if err != nil {
			return nil, 0, "原生模型目录连接失败"
		}
		raw, readErr := io.ReadAll(io.LimitReader(response.Body, (4<<20)+1))
		response.Body.Close()
		var data map[string]any
		if readErr != nil || len(raw) > 4<<20 || json.Unmarshal(raw, &data) != nil {
			return nil, response.StatusCode, "原生模型目录返回无效或过大的响应"
		}
		if response.StatusCode < 200 || response.StatusCode >= 300 {
			return nil, response.StatusCode, "原生模型目录请求失败；请检查该渠道是否支持所选原生接口及密钥权限"
		}
		field := "data"
		if protocol == "gemini" {
			field = "models"
		}
		items, ok := data[field].([]any)
		if !ok {
			return nil, http.StatusBadGateway, "原生模型目录响应格式不兼容"
		}
		for _, item := range items {
			object, _ := item.(map[string]any)
			id := firstTextValue(object["id"])
			if protocol == "gemini" {
				id = strings.TrimPrefix(firstTextValue(object["name"]), "models/")
			}
			if id != "" {
				list = append(list, map[string]any{"id": id, "name": firstTextValue(object["displayName"], object["display_name"], id)})
			}
		}
		if protocol == "gemini" {
			page = firstTextValue(data["nextPageToken"])
		} else {
			page = ""
			if data["has_more"] == true {
				page = firstTextValue(data["last_id"])
			}
		}
		if page == "" {
			return list, http.StatusOK, ""
		}
		if seenPages[page] {
			return nil, http.StatusBadGateway, "原生模型目录分页未前进"
		}
		seenPages[page] = true
	}
	return nil, http.StatusBadGateway, "原生模型目录分页超过限制，请缩小目录或手动添加模型"
}
