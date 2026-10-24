package generate

import (
	"net/url"
	"strings"
	"sync"

	"beike.local/cloud/src/backend/internal/system"
)

var videoQueries sync.Map

func rememberVideoQuery(base, taskID, template string) {
	videoQueries.Store(strings.TrimRight(base, "/")+":"+taskID, template)
}

func videoQueryTemplate(base, taskID string) string {
	value, ok := videoQueries.Load(strings.TrimRight(base, "/") + ":" + taskID)
	if !ok {
		return ""
	}
	text, _ := value.(string)
	return text
}

func videoEndpointSet(family, model, mode string, images []string) ([]string, []string, map[string]string) {
	root := "{base}"
	var submit, query []string
	headers := map[string]string{}
	switch family {
	case "seedance":
		submit = []string{root + "/seedance/v3/contents/generations/tasks", root + "/v2/videos/generations"}
		query = []string{root + "/seedance/v3/contents/generations/tasks/{taskId}", root + "/v2/videos/generations/{taskId}"}
	case "wan":
		submit = []string{
			root + "/wan/api/v1/services/aigc/video-generation/video-synthesis",
			root + "/qwen/api/v1/services/aigc/video-generation/video-synthesis",
			root + "/api/v1/services/aigc/video-generation/video-synthesis",
		}
		query = []string{
			root + "/wan/api/v1/tasks/{taskId}",
			root + "/qwen/api/v1/tasks/{taskId}",
			root + "/api/v1/tasks/{taskId}",
		}
		headers["X-DashScope-Async"] = "enable"
	case "kling":
		mode := "text2video"
		if strings.Contains(strings.ToLower(model), "omni") {
			mode = "omni-video"
		} else if len(images) > 0 {
			mode = "image2video"
		}
		submit = []string{root + "/kling/v1/videos/" + mode}
		query = []string{root + "/kling/v1/videos/" + mode + "/{taskId}"}
	case "vidu":
		path := viduSubmitPath(mode)
		submit = []string{root + "/vidu/v2/" + path, root + "/vidu/ent/v2/" + path}
		query = []string{root + "/vidu/v2/tasks/{taskId}/creations", root + "/vidu/ent/v2/tasks/{taskId}/creations"}
	case "grok-video":
		submit = []string{root + "/xai/v1/videos/" + grokSubmitPath(mode)}
		query = []string{root + "/xai/v1/videos/{taskId}"}
	case "minimax":
		if strings.Contains(strings.ToLower(model), "t2v-01") {
			submit = []string{root + "/minimax/v1/video_generation"}
			query = []string{root + "/minimax/v1/query/video_generation?task_id={taskId}"}
		} else {
			submit = []string{root + "/v1/videos", root + "/v2/videos/generations", root + "/minimax/v1/video_generation"}
			query = []string{root + "/v1/videos/{taskId}", root + "/v2/videos/generations/{taskId}", root + "/minimax/v1/query/video_generation?task_id={taskId}"}
		}
	case "veo":
		submit = []string{root + "/v2/videos/generations", root + "/v1/videos", root + "/v1/video/generations"}
		query = []string{root + "/v2/videos/generations/{taskId}", root + "/v1/videos/{taskId}", root + "/v1/video/generations/{taskId}"}
	case "sora":
		submit = []string{root + "/v2/videos/generations", root + "/v1/videos", root + "/v1/video/generations", root + "/xai/v1/videos/generations"}
		query = []string{root + "/v2/videos/generations/{taskId}", root + "/v1/videos/{taskId}", root + "/v1/video/generations/{taskId}"}
	default:
		submit = []string{root + "/v2/videos/generations", root + "/v1/videos", root + "/v1/video/generations"}
		query = []string{root + "/v2/videos/generations/{taskId}", root + "/v1/videos/{taskId}", root + "/v1/video/generations/{taskId}"}
	}
	return submit, query, headers
}

func viduSubmitPath(mode string) string {
	switch mode {
	case "first_frame":
		return "img2video"
	case "first_last_frame":
		return "start-end2video"
	case "text":
		return "text2video"
	default:
		return "reference2video"
	}
}

func grokSubmitPath(mode string) string {
	switch mode {
	case "edit":
		return "edits"
	case "extend":
		return "extensions"
	default:
		return "generations"
	}
}

func dashscopeVideoRoute(base, protocol string) bool {
	switch strings.ToLower(strings.TrimSpace(protocol)) {
	case "dashscope", "qwen", "qianwen":
		return true
	}
	return system.IsDashScopeGateway(base)
}

// routeWanEndpoints picks one native DashScope URL for Qianwen hosts, and passthrough
// URLs for other gateways. Wan never uses the flat /v1/videos adapter.
func routeWanEndpoints(base, protocol string) (submit, query []string) {
	const submitPath = "/api/v1/services/aigc/video-generation/video-synthesis"
	const queryPath = "/api/v1/tasks/{taskId}"
	if dashscopeVideoRoute(base, protocol) {
		root := system.DashScopeRoot(base)
		return []string{root + submitPath}, []string{root + queryPath}
	}
	root := strings.TrimRight(system.NormalizeGatewayBaseURL(base), "/")
	parsed, _ := url.Parse(root)
	if parsed != nil && (parsed.Hostname() == "ai.comfly.org" || parsed.Hostname() == "comfly.org") {
		return []string{root + "/qwen" + submitPath}, []string{root + "/qwen" + queryPath}
	}
	return []string{
			root + "/wan" + submitPath,
			root + "/qwen" + submitPath,
			root + submitPath,
		}, []string{
			root + "/wan" + queryPath,
			root + "/qwen" + queryPath,
			root + queryPath,
		}
}

func expandVideoURLs(base string, templates []string, taskID string) []string {
	root := strings.TrimRight(system.NormalizeGatewayBaseURL(base), "/")
	out := make([]string, 0, len(templates))
	for _, template := range templates {
		endpoint := strings.ReplaceAll(template, "{base}", root)
		endpoint = strings.ReplaceAll(endpoint, "{taskId}", taskID)
		out = append(out, endpoint)
	}
	return out
}
