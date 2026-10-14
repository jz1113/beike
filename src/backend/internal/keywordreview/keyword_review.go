package keywordreview

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	reviewsvc "beike.local/cloud/src/backend/internal/keywordreview/review"
	"beike.local/cloud/src/backend/internal/platform/database"
	"beike.local/cloud/src/backend/internal/platform/network"
	"beike.local/cloud/src/backend/internal/system"
)

func keywordReviewHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		result := executeKeywordReview(cfg, r, reviewHTTPClient())
		for key, values := range result.header {
			for _, value := range values {
				w.Header().Add(key, value)
			}
		}
		httpx.WriteJSON(w, result.status, result.body)
	}
}

func reviewHTTPClient() *http.Client {
	client := network.SafeClient()
	client.Timeout = 630 * time.Second
	return client
}

func executeKeywordReview(cfg config.Config, r *http.Request, client *http.Client) guardedResult {
	raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil || len(strings.TrimSpace(string(raw))) == 0 || !json.Valid(raw) {
		return guardedResult{status: http.StatusBadRequest, body: map[string]any{"success": false, "error": "请求数据格式异常"}}
	}
	parsed, rows, message := parseKeywordReview(raw)
	if message != "" {
		return guardedResult{status: http.StatusBadRequest, body: map[string]any{"success": false, "error": message}}
	}
	if lookupRequested(parsed) {
		return guardedResult{status: http.StatusBadRequest, body: map[string]any{"success": false, "error": "联网补查已暂停：当前接口不会执行网页搜索。请关闭补查后重试。"}}
	}
	provider := keywordText(parsed["provider"], "deepseek")
	model := keywordText(parsed["model"], "deepseek-flash")
	baseURL, apiKey, status, message := keywordCredentials(cfg, r, provider, model, keywordText(parsed["customBaseUrl"], ""), keywordText(parsed["customApiKey"], ""))
	if message != "" {
		return guardedResult{status: status, body: map[string]any{"success": false, "error": message}}
	}
	mode := keywordText(parsed["reviewMode"], "image")
	version := optionalInt(parsed["rulesVersion"])
	return guardKeywordSubmission(r, httpx.WorkspaceFrom(r), baseURL, apiKey, parsed, func() (int, map[string]any) {
		rules, ruleStatus, ruleBody := loadKeywordRules(cfg, r, version)
		if ruleBody != nil {
			return ruleStatus, ruleBody
		}
		reviewed, err := reviewsvc.Review(context.WithoutCancel(r.Context()), client, reviewsvc.Input{
			BaseURL: baseURL, APIKey: apiKey, Model: model, Provider: provider, Mode: mode, Rows: rows, Rules: rules,
		})
		return keywordReviewResult(provider, reviewed, err)
	})
}

func keywordReviewResult(provider string, reviewed reviewsvc.Result, err error) (int, map[string]any) {
	if err == nil {
		body := map[string]any{"success": true, "results": reviewed.Results, "failedIds": reviewed.Failed, "model": reviewed.Model, "lookedUp": 0}
		if len(reviewed.Usage) > 0 && string(reviewed.Usage) != "null" {
			body["usage"] = json.RawMessage(reviewed.Usage)
		}
		return http.StatusOK, body
	}
	var upstream *reviewsvc.UpstreamError
	if errors.As(err, &upstream) {
		message := upstream.Message
		if message == "" {
			message = deepSeekFailure(upstream.Status, upstream.Body, upstream.Provider)
		}
		code := "upstream_api_error"
		if upstream.Provider == "DeepSeek" {
			code = "deepseek_api_error"
		}
		return upstream.Status, map[string]any{"success": false, "error": message, "code": code}
	}
	var output *reviewsvc.OutputError
	if errors.As(err, &output) {
		body := map[string]any{"success": false, "error": output.Message, "code": "model_output_invalid"}
		if len(output.Usage) > 0 && string(output.Usage) != "null" {
			body["usage"] = json.RawMessage(output.Usage)
		}
		return http.StatusBadGateway, body
	}
	return http.StatusBadGateway, map[string]any{"success": false, "error": keywordTransportError(err)}
}

func keywordTransportError(err error) string {
	message := strings.ToLower(err.Error())
	if strings.Contains(message, "timeout") || strings.Contains(message, "deadline") {
		return "模型响应超时，已生成内容已保留。请稍后继续，或检查上游服务的超时设置。"
	}
	if strings.Contains(message, "refused") || strings.Contains(message, "no such host") || strings.Contains(message, "network") {
		return "网络连接失败，请检查网络或 API 地址"
	}
	return "关键词审核失败"
}

func loadKeywordRules(cfg config.Config, r *http.Request, version *int) ([]reviewsvc.RuleEntry, int, map[string]any) {
	if version != nil && *version == 0 {
		return nil, 0, nil
	}
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		return nil, http.StatusInternalServerError, map[string]any{"success": false, "error": "关键词审核失败"}
	}
	defer db.Close()
	current, history, err := database.ListKeywordRules(r.Context(), db, httpx.WorkspaceFrom(r))
	if err != nil {
		return nil, http.StatusInternalServerError, map[string]any{"success": false, "error": "关键词审核失败"}
	}
	chosen := current
	if version != nil {
		found := false
		for _, item := range history {
			if item.Version == *version {
				chosen = item
				found = true
				break
			}
		}
		if !found {
			return nil, http.StatusConflict, map[string]any{"success": false, "error": fmt.Sprintf("审核规则版本 v%d 不存在", *version)}
		}
	}
	rules := make([]reviewsvc.RuleEntry, len(chosen.Entries))
	for index, entry := range chosen.Entries {
		rules[index] = reviewsvc.RuleEntry{Section: entry.Section, Text: entry.Text, Mode: entry.Mode}
	}
	return rules, 0, nil
}

func keywordCredentials(cfg config.Config, r *http.Request, provider, model, baseURL, apiKey string) (string, string, int, string) {
	if provider == "deepseek" {
		if model != "deepseek-flash" {
			return "", "", http.StatusBadRequest, "关键词审核仅支持 deepseek-flash"
		}
		baseURL = system.NormalizeGatewayBaseURL(baseURL)
		if baseURL != keywordDeepSeekBaseURL {
			return "", "", http.StatusBadRequest, "关键词审核只接受 DeepSeek 官方接口，请到设置里填写 DeepSeek API Key"
		}
		apiKey = strings.TrimSpace(apiKey)
		if apiKey == "" {
			return "", "", http.StatusBadRequest, "未配置 DeepSeek API Key，请到设置里的 DeepSeek 官方服务填写"
		}
		return baseURL, apiKey, 0, ""
	}
	approved, ok := system.ApprovedModel(cfg.Root, model)
	if !ok || approved.Capability != "multimodal" {
		return "", "", http.StatusBadRequest, "请选择设置中已支持的多模态模型"
	}
	baseURL, apiKey, err := resolveKeywordGateway(cfg, r, baseURL, apiKey)
	if err != nil {
		return "", "", http.StatusInternalServerError, err.Error()
	}
	if apiKey == "" {
		return "", "", http.StatusBadRequest, "未配置模型网关 API Key，请到设置里填写"
	}
	return baseURL, apiKey, 0, ""
}

func resolveKeywordGateway(cfg config.Config, r *http.Request, bodyBase, bodyKey string) (string, string, error) {
	customKey := strings.TrimSpace(bodyKey)
	if customKey == "" {
		customKey = strings.TrimSpace(r.Header.Get("x-custom-api-key"))
	}
	clientBase := strings.TrimSpace(bodyBase)
	if clientBase == "" {
		clientBase = strings.TrimSpace(r.Header.Get("x-custom-base-url"))
	}
	if clientBase != "" && !system.AllowCustomBase(cfg) && !system.SafeHTTPSGateway(clientBase) {
		return "", "", errors.New("当前接口地址与服务器允许的视觉网关不一致。请在设置 → 服务接口配置中改为服务器配置的网关地址，或联系管理员配置该网关；密钥未发送到其他网关。")
	}
	defaults := defaultGatewayBase()
	base := system.NormalizeGatewayBaseURL(defaults)
	if clientBase != "" && (system.AllowCustomBase(cfg) || system.SafeHTTPSGateway(clientBase)) {
		base = system.NormalizeGatewayBaseURL(clientBase)
	}
	if base == "" {
		base = defaults
	}
	thirdParty := clientBase != "" && system.NormalizeGatewayBaseURL(clientBase) != system.NormalizeGatewayBaseURL(defaults)
	if customKey == "" && !thirdParty && !cfg.Production() {
		customKey = strings.TrimSpace(os.Getenv("AI_DRAWING_API_KEY"))
		if customKey == "" {
			customKey = strings.TrimSpace(os.Getenv("AI_API_KEY"))
		}
	}
	return base, customKey, nil
}

func defaultGatewayBase() string {
	if value := strings.TrimSpace(os.Getenv("AI_DRAWING_BASE_URL")); value != "" {
		return value
	}
	for _, key := range []string{"AI_DRAWING_API_BASE_URL", "AI_API_BASE", "AI_BASE_URL"} {
		if value := strings.TrimSpace(os.Getenv(key)); value != "" {
			return value
		}
	}
	return "https://ai.comfly.org"
}

func lookupRequested(payload map[string]any) bool {
	if payload["lookup"] == true {
		return true
	}
	budget, ok := payload["lookupBudget"].(float64)
	return ok && budget > 0
}

func keywordText(value any, fallback string) string {
	text, _ := value.(string)
	text = strings.TrimSpace(text)
	if text == "" {
		return fallback
	}
	return text
}

func optionalInt(value any) *int {
	number, ok := value.(float64)
	if !ok {
		return nil
	}
	parsed := int(number)
	return &parsed
}
