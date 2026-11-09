package generate

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
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
	case "omni-flash":
		submit = []string{root + "/v1/videos"}
		query = []string{root + "/v1/videos/{taskId}"}
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
		if minimaxH3(model) {
			submit = []string{root + "/v2/video_generation"}
			query = []string{root + "/v2/query/video_generation/{taskId}"}
		} else if strings.Contains(strings.ToLower(model), "t2v-01") {
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
	return gateway.IsDashScopeGateway(base)
}

// routeWanEndpoints picks one native DashScope URL for Qianwen hosts, and passthrough
// URLs for other gateways. Wan never uses the flat /v1/videos adapter.
func routeWanEndpoints(base, protocol string) (submit, query []string) {
	const submitPath = "/api/v1/services/aigc/video-generation/video-synthesis"
	const queryPath = "/api/v1/tasks/{taskId}"
	if dashscopeVideoRoute(base, protocol) {
		root := gateway.DashScopeRoot(base)
		return []string{root + submitPath}, []string{root + queryPath}
	}
	root := strings.TrimRight(gateway.NormalizeGatewayBaseURL(base), "/")
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
	root := strings.TrimRight(gateway.NormalizeGatewayBaseURL(base), "/")
	out := make([]string, 0, len(templates))
	for _, template := range templates {
		endpoint := strings.ReplaceAll(template, "{base}", root)
		endpoint = strings.ReplaceAll(endpoint, "{taskId}", taskID)
		out = append(out, endpoint)
	}
	return out
}

// VideoBind attaches an upstream task ID the user found in the provider console
// to a submission whose response was never confirmed. It never submits
// generation; the existing taskId GET then polls the bound task.
func VideoBind(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			TaskKey string `json:"taskKey"`
			TaskID  string `json:"taskId"`
		}
		raw, err := io.ReadAll(io.LimitReader(r.Body, 64<<10))
		if err != nil || json.Unmarshal(raw, &body) != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求格式不正确"})
			return
		}
		key, taskID := strings.TrimSpace(body.TaskKey), strings.TrimSpace(body.TaskID)
		if key == "" || len(key) > 256 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "任务标识无效"})
			return
		}
		taskID, nativeOperation := normalizeVeoBindID(taskID)
		if !nativeOperation && (taskID == "" || len(taskID) > 256 || imageTaskStillSubmitting(taskID) || strings.ContainsAny(taskID, " \t\r\n/?#")) {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "上游任务 ID 无效"})
			return
		}
		db, err := openTaskDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{"success": false, "error": "提交记录暂时无法更新，请稍后重试"})
			return
		}
		defer db.Close()
		now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
		// Only an unconfirmed receipt without an upstream ID can be bound, so a
		// confirmed or already-bound task is never redirected to another one.
		result, err := db.ExecContext(r.Context(), `
			UPDATE "ImageTask" SET "taskId" = ?, "status" = 'IN_PROGRESS', "failReason" = NULL, "updatedAt" = ?
			WHERE "workspaceId" = ? AND "idempotencyKey" = ? AND "mediaType" = 'video'
				AND "status" = 'SUBMISSION_UNKNOWN' AND ("taskId" IS NULL OR "taskId" = '' OR "taskId" LIKE 'pending\_%' ESCAPE '\')`,
			taskID, now, workspaceOf(r), key)
		if err != nil {
			httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{"success": false, "error": "提交记录暂时无法更新，请稍后重试"})
			return
		}
		if count, _ := result.RowsAffected(); count != 1 {
			httpx.WriteJSON(w, http.StatusConflict, map[string]any{"success": false, "error": "该提交记录无需绑定或已绑定上游任务，请直接查询原任务"})
			return
		}
		row, err := readVideoSubmission(r.Context(), db, workspaceOf(r), key)
		if err != nil || !row.found {
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "taskKey": key, "taskId": taskID, "status": "IN_PROGRESS"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, videoSubmissionBody(row))
	})
}

// Reject before uploading references or creating a paid task. Wan truncates an
// overlong prompt upstream; losing the final action/audio rules is not acceptable.
func videoPromptInputError(payload map[string]json.RawMessage, model string) string {
	limit := 0
	label := ""
	switch {
	case minimaxH3(model):
		limit, label = 7000, "MiniMax-H3"
	case strings.HasPrefix(strings.ToLower(strings.TrimSpace(model)), "wan3"):
		limit, label = 20000, "万相 3.0"
	default:
		return ""
	}
	prompt := strings.TrimSpace(rawString(payload, "prompt"))
	if rawBool(payload, "preserve_prompt") {
		_ = json.Unmarshal(payload["prompt"], &prompt)
	} else if minimaxH3(model) {
		audio, set := rawBoolPresent(payload, "audio")
		body := minimaxH3Payload(model, prompt, "text", "16:9", "768P", 5, nil, nil, audio, set, false)
		prompt, _ = body["content"].([]map[string]any)[0]["text"].(string)
	}
	if count := utf8.RuneCountInString(prompt); count > limit {
		return fmt.Sprintf("%s 视频提示词最多 %d 个字符，当前 %d 个；请精简提示词后重试，保留商品、场景、动作与声音要求", label, limit, count)
	}
	return ""
}

func videoSeedInputError(payload map[string]json.RawMessage, model string) string {
	if videoFamily(model) != "wan" || payload["seed"] == nil {
		return ""
	}
	seed := rawNumber(payload, "seed")
	if seed < -1 || seed > 2147483647 {
		return "万相随机种子须为 -1 或 0～2147483647 的整数"
	}
	return ""
}

func attachVideoSeed(body map[string]any, family string, payload map[string]json.RawMessage) {
	if family == "wan" && payload["seed"] != nil {
		body["parameters"].(map[string]any)["seed"] = int64(rawNumber(payload, "seed"))
	}
}

func rawNumber(payload map[string]json.RawMessage, key string) float64 {
	var value float64
	if json.Unmarshal(payload[key], &value) != nil {
		return 0
	}
	return value
}

func readVideoTaskID(data map[string]any, family string) string {
	if data == nil || data["error"] != nil {
		return ""
	}
	if family == "veo" {
		if name := firstString(data, "name"); veoOperationPath.MatchString(name) {
			return encodeVeoOperation(name)
		}
	}
	if family == "minimax" {
		if task, ok := data["task"].(map[string]any); ok {
			if id := firstString(task, "id", "task_id"); id != "" {
				return id
			}
		}
	}
	if text, ok := data["task_id"].(string); ok && strings.TrimSpace(text) != "" {
		return strings.TrimSpace(text)
	}
	if nested, ok := data["data"].(map[string]any); ok {
		if text := firstString(nested, "task_id", "id"); text != "" {
			return text
		}
	}
	if output, ok := data["output"].(map[string]any); ok {
		if text, ok := output["task_id"].(string); ok && text != "" {
			return text
		}
	}
	if text, ok := data["id"].(string); ok && text != "" {
		return text
	}
	if text, ok := data["data"].(string); ok && text != "" {
		return text
	}
	if family == "grok-video" {
		if text, ok := data["request_id"].(string); ok {
			return text
		}
	}
	return ""
}

// A route fallback is only safe when the target format can express every input.
func videoAlternateBodies(base string, a *videoAdapted, mode string, nativeH3 map[string]any) map[string]string {
	if a.family == "veo" && veoNativeBase(base) {
		return nil
	}
	if nativeVideoProvider(base) == a.family {
		return nil
	}
	root := strings.TrimRight(gateway.NormalizeGatewayBaseURL(base), "/")
	var body map[string]any
	var endpoint string
	switch a.family {
	case "seedance":
		body = unifiedSeedanceBody(a.payload, mode)
		if body == nil {
			a.endpoints = a.endpoints[:1]
			a.queries = a.queries[:1]
			return nil
		}
		endpoint = root + "/v2/videos/generations"
	case "wan":
		if !minimaxComflyHost(base) || (a.modelID != "wan3.0-video" && a.modelID != "wan3.0-video-prime") {
			return nil
		}
		input := a.payload["input"].(map[string]any)
		body = map[string]any{"model": a.modelID, "prompt": input["prompt"]}
		for k, v := range a.payload["parameters"].(map[string]any) {
			if k == "ratio" {
				k = "aspect_ratio"
			}
			body[k] = v
		}
		if refs, ok := input["media"]; ok {
			body["media"] = refs
		}
	case "grok-video":
		if !minimaxComflyHost(base) || !strings.EqualFold(a.modelID, "grok-imagine-video-1.5") || mode == "edit" || mode == "extend" || a.payload["reference_audios"] != nil {
			return nil
		}
		body = map[string]any{"model": a.modelID, "prompt": a.payload["prompt"], "aspect_ratio": a.ratio, "seconds": strconv.Itoa(a.duration), "resolution": a.resolution}
		if image, ok := a.payload["image"].(map[string]string); ok {
			body["images"] = []string{image["url"]}
		}
		if last, ok := a.payload["last_frame"].(map[string]string); ok {
			body["last_frame"] = last["url"]
		}
		if refs, ok := a.payload["reference_images"].([]map[string]string); ok {
			urls := make([]string, 0, len(refs))
			for _, ref := range refs {
				urls = append(urls, ref["url"])
			}
			body["reference_images"] = urls
		}
	case "minimax":
		if nativeH3 == nil || minimaxOfficialHost(base) || minimaxMetasoHost(base) || minimaxComflyHost(base) {
			return nil
		}
		endpoint = root + "/minimax/v1/video_generation"
		body = nativeH3
	default:
		return nil
	}
	if endpoint == "" {
		endpoint = root + "/v1/videos"
		a.endpoints = append(a.endpoints, endpoint)
		a.queries = append(a.queries, endpoint+"/{taskId}")
	}
	encoded, _ := json.Marshal(body)
	return map[string]string{endpoint: string(encoded)}
}

func unifiedSeedanceBody(native map[string]any, mode string) map[string]any {
	body := map[string]any{}
	for _, k := range []string{"model", "duration", "resolution", "ratio", "generate_audio", "seed", "watermark"} {
		if value, ok := native[k]; ok {
			body[k] = value
		}
	}
	if task, ok := native["omni_reference_task_type"]; ok {
		body["task_type"] = task
	}
	images := []string{}
	for _, item := range native["content"].([]map[string]any) {
		switch item["type"] {
		case "text":
			body["prompt"] = item["text"]
		case "image_url":
			images = append(images, item["image_url"].(map[string]string)["url"])
		case "video_url":
			if body["video"] != nil {
				return nil
			}
			body["video"] = item["video_url"].(map[string]string)["url"]
		default:
			return nil
		}
	}
	// One or two images alone imply frame roles on the unified endpoint.
	if mode == "omni" && len(images) > 0 && len(images) <= 2 && body["video"] == nil {
		return nil
	}
	if len(images) > 0 {
		body["images"] = images
	}
	return body
}
