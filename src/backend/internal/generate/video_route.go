package generate

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/submission"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"unicode/utf8"
)

func Video(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			videoPoll(cfg, w, r)
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, 8<<20))
		if err != nil || json.Valid(body) == false {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求格式不正确"})
			return
		}
		var payload map[string]json.RawMessage
		if json.Unmarshal(body, &payload) != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求格式不正确"})
			return
		}
		if message := videoBodyError(payload); message != "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": message, "retryable": false})
			return
		}
		if message := videoModelError(payload); message != "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": message})
			return
		}
		base, _ := videoCredentials(cfg, r, payload)
		if message := videoInputError(payload, videoRequestedModel(payload), base); message != "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": message})
			return
		}
		submitVideo(cfg, w, r, payload)
	})
}

func videoRequestedModel(payload map[string]json.RawMessage) string {
	model := "doubao-seedance-2.0-mini"
	if raw, ok := payload["model"]; ok {
		if json.Unmarshal(raw, &model) != nil {
			return "doubao-seedance-2.0-mini"
		}
	}
	return model
}

func videoModelError(payload map[string]json.RawMessage) string {
	model := strings.TrimSpace(videoRequestedModel(payload))
	if model == "" {
		return "模型名称不能为空"
	}
	return ""
}

func videoPoll(cfg config.Config, w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	if query.Get("taskId") == "" && query.Has("taskKey") {
		pollVideoSubmission(cfg, w, r, query.Get("taskKey"))
		return
	}
	if query.Get("taskId") == "" && !query.Has("taskKey") {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "缺少 taskId 参数"})
		return
	}
	pollVideoTask(cfg, w, r, query.Get("taskId"))
}

func videoBodyError(payload map[string]json.RawMessage) string {
	steps := []func() string{
		func() string { return requiredString(payload, "prompt", 100_000, "视频提示词不能为空") },
		func() string { return optionalString(payload, "model", 200, true) },
		func() string { return optionalNumber(payload, "duration", false, false) },
		func() string { return optionalString(payload, "aspect_ratio", 32, false) },
		func() string { return optionalString(payload, "resolution", 32, false) },
		func() string { return stringList(payload, "images", 30) },
		func() string { return stringList(payload, "videos", 10) },
		func() string { return stringList(payload, "audios", 10) },
		func() string { return grokVoiceBodyError(payload) },
		func() string { return optionalBool(payload, "watermark") },
		func() string { return optionalString(payload, "productId", 256, false) },
		func() string { return optionalString(payload, "referenceImageUrl", 0, false) },
		func() string { return optionalString(payload, "first_frame_image", 0, false) },
		func() string { return optionalString(payload, "last_frame_image", 0, false) },
		func() string { return optionalString(payload, "ref_mode", 64, false) },
		func() string { return optionalString(payload, "camera_motion", 200, false) },
		func() string { return optionalString(payload, "camera_control", 200, false) },
		func() string { return optionalBool(payload, "audio") },
		func() string { return optionalBool(payload, "preserve_prompt") },
		func() string { return optionalBool(payload, "context_ir_enabled") },
		func() string { return optionalNumber(payload, "fps", true, false) },
		func() string { return optionalNumber(payload, "seed", false, true) },
		func() string { return optionalString(payload, "character", 2000, false) },
		func() string { return optionalString(payload, "character_id", 256, false) },
		func() string { return optionalString(payload, "customBaseUrl", 2048, false) },
		func() string { return optionalString(payload, "customApiKey", 4096, false) },
		func() string { return optionalString(payload, "clientTaskId", 256, false) },
		func() string { return optionalString(payload, "idempotencyKey", 256, false) },
		func() string { return optionalObject(payload, "storageConfig") },
	}
	for _, step := range steps {
		if message := step(); message != "" {
			return message
		}
	}
	return ""
}

func requiredString(payload map[string]json.RawMessage, key string, max int, empty string) string {
	raw, ok := payload[key]
	if !ok {
		return "Required"
	}
	return boundedString(raw, max, true, empty)
}

func optionalString(payload map[string]json.RawMessage, key string, max int, minOne bool) string {
	raw, ok := payload[key]
	if !ok {
		return ""
	}
	return boundedString(raw, max, minOne, "")
}

func boundedString(raw json.RawMessage, max int, minOne bool, empty string) string {
	kind := rawKind(raw)
	if kind != "string" {
		return "Expected string, received " + kind
	}
	var value string
	if json.Unmarshal(raw, &value) != nil {
		return "Expected string, received string"
	}
	if minOne && len(value) == 0 {
		if empty != "" {
			return empty
		}
		return "String must contain at least 1 character(s)"
	}
	value = strings.TrimSpace(value)
	if minOne && value == "" {
		if empty != "" {
			return empty
		}
		return "String must contain at least 1 character(s)"
	}
	if max > 0 && utf8.RuneCountInString(value) > max {
		return "String must contain at most " + Itoa(max) + " character(s)"
	}
	return ""
}

func stringList(payload map[string]json.RawMessage, key string, max int) string {
	raw, ok := payload[key]
	if !ok {
		return ""
	}
	if rawKind(raw) != "array" {
		return "Expected array, received " + rawKind(raw)
	}
	var items []json.RawMessage
	if json.Unmarshal(raw, &items) != nil {
		return "Expected array, received array"
	}
	if len(items) > max {
		return "Array must contain at most " + Itoa(max) + " element(s)"
	}
	for _, item := range items {
		if message := boundedString(item, 0, true, ""); message != "" {
			return message
		}
	}
	return ""
}

func optionalBool(payload map[string]json.RawMessage, key string) string {
	raw, ok := payload[key]
	if !ok {
		return ""
	}
	if rawKind(raw) != "boolean" {
		return "Expected boolean, received " + rawKind(raw)
	}
	return ""
}

func optionalNumber(payload map[string]json.RawMessage, key string, positive bool, integer bool) string {
	raw, ok := payload[key]
	if !ok {
		return ""
	}
	kind := rawKind(raw)
	if kind != "number" {
		return "Expected number, received " + kind
	}
	var value float64
	if json.Unmarshal(raw, &value) != nil {
		return "Number must be finite"
	}
	if integer && value != float64(int64(value)) {
		return "Expected integer, received float"
	}
	if positive && value <= 0 {
		return "Number must be greater than 0"
	}
	return ""
}

func rawKind(raw json.RawMessage) string {
	text := strings.TrimSpace(string(raw))
	switch {
	case text == "" || text == "null":
		return "null"
	case text == "true" || text == "false":
		return "boolean"
	case strings.HasPrefix(text, "\""):
		return "string"
	case strings.HasPrefix(text, "["):
		return "array"
	case strings.HasPrefix(text, "{"):
		return "object"
	default:
		return "number"
	}
}

func optionalObject(payload map[string]json.RawMessage, key string) string {
	raw, ok := payload[key]
	if !ok || rawKind(raw) == "null" {
		return ""
	}
	if rawKind(raw) != "object" {
		return "Expected object, received " + rawKind(raw)
	}
	return ""
}

func nativeVideoProvider(base string) string {
	parsed, err := url.Parse(base)
	if err != nil {
		return ""
	}
	host := strings.ToLower(parsed.Hostname())
	switch host {
	case "api.vidu.cn", "api.vidu.com":
		return "vidu"
	case "api.klingai.com", "api-beijing.klingai.com", "api-singapore.klingai.com":
		return "kling"
	}
	if strings.HasPrefix(host, "ark.") && strings.HasSuffix(host, ".volces.com") && strings.Count(host, ".") == 3 {
		return "seedance"
	}
	return ""
}

// Official providers must never receive gateway prefixes or fallback formats.
func applyNativeVideoRoute(base, mode, apiKey string, a *videoAdapted) {
	if a.family == "kling" && mode == "motion_control" && minimaxComflyHost(base) {
		root := strings.TrimSuffix(strings.TrimRight(base, "/"), "/v1")
		a.endpoints = []string{root + "/kling/v1/videos/motion-control"}
		a.queries = []string{root + "/kling/v1/videos/motion-control/{taskId}"}
		return
	}
	provider := nativeVideoProvider(base)
	if provider == "" || provider != a.family {
		return
	}
	parsed, _ := url.Parse(base)
	root := parsed.Scheme + "://" + parsed.Host
	switch provider {
	case "seedance":
		a.endpoints = []string{root + "/api/v3/contents/generations/tasks"}
		a.queries = []string{root + "/api/v3/contents/generations/tasks/{taskId}"}
		if a.payload != nil {
			switch a.modelID {
			case "doubao-seedance-2.0-mini":
				a.payload["model"] = "doubao-seedance-2-0-mini-260615"
			case "doubao-seedance-2.5":
				a.payload["model"] = "doubao-seedance-2-5-260628"
			}
		}
	case "vidu":
		a.endpoints = []string{root + "/ent/v2/" + viduSubmitPath(mode)}
		a.queries = []string{root + "/ent/v2/tasks/{taskId}/creations"}
		if a.headers == nil {
			a.headers = map[string]string{}
		}
		a.headers["Authorization"] = "Token " + apiKey
	case "kling":
		if kling4Model(a.modelID) {
			path := "omni-video"
			switch mode {
			case "text":
				path = "text-to-video"
			case "first_frame", "first_last_frame":
				path = "image-to-video"
			}
			a.endpoints = []string{root + "/" + path + "/" + a.modelID}
			a.queries = []string{root + "/tasks?task_ids={taskId}"}
			return
		}
		if mode == "motion_control" {
			version := "2.6"
			if a.modelID == "kling-video-v3" {
				version = "3.0"
			}
			a.endpoints = []string{root + "/motion-control/kling-" + version}
			a.queries = []string{root + "/tasks?task_ids={taskId}"}
			return
		}
		path := "text2video"
		if strings.Contains(strings.ToLower(a.modelID), "omni") {
			path = "omni-video"
		} else if mode == "first_frame" || mode == "first_last_frame" {
			path = "image2video"
		}
		a.endpoints = []string{root + "/v1/videos/" + path}
		a.queries = []string{root + "/v1/videos/" + path + "/{taskId}"}
	}
}

type videoTaskRoute struct {
	Digest string `json:"digest"`
	Query  string `json:"query,omitempty"`
}

func videoRouteDigest(base, key, model string, r *http.Request) string {
	// These documented Metaso base aliases resolve to the same native routes.
	if minimaxH3(model) && minimaxMetasoHost(base) {
		if parsed, err := url.Parse(base); err == nil {
			base = parsed.Scheme + "://" + parsed.Host
		}
	}
	return submission.Hash([]string{gateway.NormalizeGatewayBaseURL(base), key, model, strings.ToLower(strings.TrimSpace(r.Header.Get("x-custom-protocol"))), r.Header.Get("x-request-template")})
}

func videoSubmissionRoute(cfg config.Config, r *http.Request, payload map[string]json.RawMessage, model, query string) string {
	base, key := videoCredentials(cfg, r, payload)
	raw, _ := json.Marshal(videoTaskRoute{Digest: videoRouteDigest(base, key, model, r), Query: query})
	return string(raw)
}

// Persisted identity is authoritative, including after a process restart.
func authorizeVideoRoute(cfg config.Config, w http.ResponseWriter, r *http.Request, taskID string) (string, bool) {
	db, err := openTaskDB(cfg)
	if err != nil {
		httpx.WriteJSON(w, 503, map[string]any{"success": false, "submissionUnknown": true, "error": "原视频渠道暂时无法核对"})
		return "", false
	}
	defer db.Close()
	var raw string
	err = db.QueryRowContext(r.Context(), `SELECT "routeFingerprint" FROM "ImageTask" WHERE "workspaceId"=? AND "mediaType"='video' AND "taskId"=? AND (?='' OR "id"=?) LIMIT 1`, workspaceOf(r), taskID, r.Header.Get("x-task-record-id"), r.Header.Get("x-task-record-id")).Scan(&raw)
	var route videoTaskRoute
	base, key := pollCredentials(cfg, r)
	if err == nil && json.Unmarshal([]byte(raw), &route) == nil && route.Digest != "" && route.Digest == videoRouteDigest(base, key, r.URL.Query().Get("model"), r) {
		return route.Query, true
	}
	code, message := "task_route_changed", "当前视频渠道、模型或密钥与原任务不一致，请恢复原配置后核对；不会向其他渠道查询"
	if err != nil || raw == "" {
		code, message = "task_route_unavailable", "旧视频任务缺少可验证的渠道记录，请核对原渠道任务；不会猜测渠道或重新生成"
	}
	httpx.WriteJSON(w, 409, map[string]any{"success": false, "code": code, "submissionUnknown": true, "error": message})
	return "", false
}
