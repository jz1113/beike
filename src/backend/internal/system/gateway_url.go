package system

import (
	"net/url"
	"strings"
)

// IsDashScopeGateway reports hosts that speak the Qianwen / DashScope native API.
func IsDashScopeGateway(raw string) bool {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	if host == "" {
		return false
	}
	if host == "qianwenaiapi.com" || host == "maas.qianwenaiapi.com" || strings.HasSuffix(host, ".qianwenaiapi.com") {
		return true
	}
	return strings.Contains(host, "dashscope") && (host == "aliyuncs.com" || strings.HasSuffix(host, ".aliyuncs.com"))
}

// ChatCompletionsURL is the OpenAI-compatible chat endpoint for a provider base URL.
// DashScope hosts use /compatible-mode/v1 unless that prefix is already present.
func ChatCompletionsURL(base string) string {
	return openAICompatibleRoot(base) + "/chat/completions"
}

// ModelsURL is the OpenAI-compatible model catalog endpoint for a provider base URL.
func ModelsURL(base string) string {
	return openAICompatibleRoot(base) + "/models"
}

// DashScopeRoot strips compatible-mode and /api/v1 suffixes so native image paths can be appended.
func DashScopeRoot(base string) string {
	root := strings.TrimRight(normalizeGatewayBaseURL(base), "/")
	lower := strings.ToLower(root)
	for _, suffix := range []string{"/compatible-mode", "/api"} {
		if strings.HasSuffix(lower, suffix) {
			root = strings.TrimRight(root[:len(root)-len(suffix)], "/")
			lower = strings.ToLower(root)
		}
	}
	return root
}

func openAICompatibleRoot(base string) string {
	trimmed := strings.TrimRight(strings.TrimSpace(base), "/")
	lower := strings.ToLower(trimmed)
	if strings.HasSuffix(lower, "/compatible-mode/v1") {
		return trimmed
	}
	if IsDashScopeGateway(trimmed) {
		return DashScopeRoot(trimmed) + "/compatible-mode/v1"
	}
	return strings.TrimRight(normalizeGatewayBaseURL(trimmed), "/") + "/v1"
}
