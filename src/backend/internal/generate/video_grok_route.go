package generate

import (
	"net/url"
	"strings"

	"beike.local/cloud/src/backend/internal/gateway"
)

func grokOfficialHost(base string) bool {
	parsed, err := url.Parse(strings.TrimSpace(base))
	if err != nil {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	return host == "api.x.ai" || strings.HasSuffix(host, ".api.x.ai")
}

func routeGrokEndpoints(base, mode string) ([]string, []string) {
	root := strings.TrimRight(gateway.NormalizeGatewayBaseURL(base), "/")
	if !grokOfficialHost(base) && !strings.HasSuffix(strings.ToLower(root), "/xai") {
		root += "/xai"
	}
	return []string{root + "/v1/videos/" + grokSubmitPath(mode)}, []string{root + "/v1/videos/{taskId}"}
}

func grokOfficialModeError(base, model, mode string) string {
	if videoFamily(model) != "grok-video" {
		return ""
	}
	parsed, _ := url.Parse(strings.TrimSpace(base))
	if parsed != nil && strings.EqualFold(parsed.Hostname(), "us.api.x.ai") {
		return "Grok 美国区域端点暂不提供视频接口，请使用官方全球地址 https://api.x.ai/v1"
	}
	if grokOfficialHost(base) && strings.Contains(strings.ToLower(model), "grok-imagine-video-1.5") && (mode == "edit" || mode == "extend") {
		return "Grok 1.5 官方接口暂不支持编辑或延长，请切换生成方式；这两种方式需使用 grok-imagine-video"
	}
	return ""
}
