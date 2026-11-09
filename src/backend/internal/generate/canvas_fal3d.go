package generate

import (
	"net/http"
	"net/url"
	"os"
	"strings"
	"unicode/utf8"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
)

func fal3DCredentials(cfg config.Config, r *http.Request, input specializedInput) (string, string, int, string) {
	key := strings.TrimSpace(input.CustomAPIKey)
	if key == "" {
		key = strings.TrimSpace(r.Header.Get("x-custom-api-key"))
	}
	clientBase := strings.TrimSpace(input.CustomBaseURL)
	if clientBase == "" {
		clientBase = strings.TrimSpace(r.Header.Get("x-custom-base-url"))
	}
	defaults := strings.TrimSpace(os.Getenv("FAL_BASE_URL"))
	if defaults == "" {
		defaults = defaultCanvasBase()
	}
	base := defaults
	if clientBase != "" {
		if msg := unsafeCanvasGateway(cfg, r, map[string]any{"customBaseUrl": clientBase}); msg != "" {
			return "", "", http.StatusBadRequest, msg
		}
		base = gateway.NormalizeGatewayBaseURL(clientBase)
	}
	thirdParty := clientBase != "" && gateway.NormalizeGatewayBaseURL(clientBase) != gateway.NormalizeGatewayBaseURL(defaults)
	if key == "" && !thirdParty && !cfg.Production() {
		for _, envKey := range []string{"FAL_API_KEY", "AI_DRAWING_API_KEY", "AI_API_KEY"} {
			if v := strings.TrimSpace(os.Getenv(envKey)); v != "" {
				key = v
				break
			}
		}
	}
	if key == "" {
		return "", "", http.StatusServiceUnavailable, "请先配置 Fal / 3D 生成渠道的 API Key"
	}
	return falQueuePrefix(base), key, 0, ""
}

func falQueuePrefix(base string) string {
	trimmed := strings.TrimRight(strings.TrimSpace(base), "/")
	if strings.HasSuffix(strings.ToLower(trimmed), "/v1") {
		trimmed = strings.TrimRight(trimmed[:len(trimmed)-3], "/")
	}
	if trimmed == "" {
		trimmed = "https://queue.fal.run"
	}
	u, err := url.Parse(trimmed)
	if err == nil && (strings.EqualFold(u.Host, "queue.fal.run") || strings.EqualFold(u.Host, "fal.run")) {
		return u.Scheme + "://" + u.Host
	}
	if strings.HasSuffix(strings.ToLower(trimmed), "/fal") {
		return trimmed
	}
	return trimmed + "/fal"
}

func rewriteFalURL(rawURL, falPrefix string, rewriteOfficial bool) string {
	trimmed := strings.TrimSpace(rawURL)
	if trimmed == "" {
		return ""
	}
	prefix := strings.TrimRight(strings.TrimSpace(falPrefix), "/")
	u, err := url.Parse(trimmed)
	if err == nil && (u.Scheme == "https" || u.Scheme == "http") && u.Host != "" {
		if rewriteOfficial && (strings.EqualFold(u.Host, "queue.fal.run") || strings.EqualFold(u.Host, "fal.run")) {
			rest := u.Path
			if strings.HasSuffix(strings.ToLower(prefix), "/fal") && strings.HasPrefix(strings.ToLower(rest), "/fal/") {
				rest = rest[4:]
			}
			out := prefix + "/" + strings.TrimLeft(rest, "/")
			if u.RawQuery != "" {
				out += "?" + u.RawQuery
			}
			return out
		}
		base, baseErr := url.Parse(prefix)
		if baseErr != nil || u.User != nil || !strings.EqualFold(u.Scheme, base.Scheme) || !strings.EqualFold(u.Host, base.Host) {
			return ""
		}
		return trimmed
	}
	if err != nil || u.IsAbs() || u.Host != "" || strings.HasPrefix(trimmed, "//") {
		return ""
	}
	rest := "/" + strings.TrimLeft(trimmed, "/")
	if strings.HasSuffix(strings.ToLower(prefix), "/fal") && strings.HasPrefix(strings.ToLower(rest), "/fal/") {
		rest = rest[4:]
	}
	return prefix + "/" + strings.TrimLeft(rest, "/")
}

func validateFalImage(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	if strings.HasPrefix(trimmed, "data:image/") {
		if _, ext := specializedMedia(trimmed, true); ext != "" {
			return trimmed
		}
		return ""
	}
	return specializedHTTPS(trimmed)
}

func normalizeFal3DModel(model string) string {
	switch strings.TrimSpace(strings.ToLower(model)) {
	case "hunyuan-3d-rapid-fal":
		return "hunyuan-3d-rapid-fal"
	case "hunyuan-3d-smart-topology-fal":
		return "hunyuan-3d-smart-topology-fal"
	case "tripo-h3", "tripo-3d-v3.1-huya":
		return "tripo-h3"
	default:
		return "hunyuan-3d-pro-fal"
	}
}

func buildFal3DRequest(input specializedInput) (string, map[string]any, string) {
	model := normalizeFal3DModel(input.Model)
	material := strings.TrimSpace(strings.ToLower(input.Material))
	if material == "" {
		if input.Textured {
			material = "texture"
		} else {
			material = "geometry"
		}
	}
	isGeometry := material == "geometry"
	isPbr := material == "pbr"

	var images []string
	for _, item := range input.Images {
		if valid := validateFalImage(item); valid != "" {
			images = append(images, valid)
		} else if strings.TrimSpace(item) != "" {
			return "", nil, "请连接有效的 PNG、JPEG、WebP 参考图（最多 6 MB）"
		}
	}
	if len(images) == 0 && strings.TrimSpace(input.Image) != "" {
		valid := validateFalImage(input.Image)
		if valid == "" {
			return "", nil, "请连接有效的 PNG、JPEG、WebP 参考图（最多 6 MB）"
		}
		images = append(images, valid)
	}

	prompt := strings.TrimSpace(input.Prompt)

	switch model {
	case "hunyuan-3d-smart-topology-fal":
		fileURL := specializedHTTPS(strings.TrimSpace(input.SourceFileURL))
		if fileURL == "" {
			return "", nil, "拓扑优化模型需要连接上游 3D 模型（GLB/OBJ）"
		}
		fileType := "glb"
		if u, err := url.Parse(fileURL); err == nil && strings.HasSuffix(strings.ToLower(u.Path), ".obj") {
			fileType = "obj"
		}
		return "fal-ai/hunyuan-3d/v3.1/smart-topology", map[string]any{
			"input_file_url":  fileURL,
			"input_file_type": fileType,
			"polygon_type":    "triangle",
			"face_level":      "medium",
		}, ""

	case "hunyuan-3d-rapid-fal":
		if len(images) > 0 {
			return "fal-ai/hunyuan-3d/v3.1/rapid/image-to-3d", map[string]any{
				"input_image_url": images[0],
				"enable_geometry": isGeometry,
				"enable_pbr":      isPbr,
			}, ""
		}
		if prompt == "" || utf8.RuneCountInString(prompt) > 1024 {
			return "", nil, "请输入 1–1024 字的 3D 描述或连接参考图"
		}
		runes := []rune(prompt)
		if len(runes) > 200 {
			prompt = string(runes[:200])
		}
		return "fal-ai/hunyuan-3d/v3.1/rapid/text-to-3d", map[string]any{
			"prompt":          prompt,
			"enable_geometry": isGeometry,
			"enable_pbr":      isPbr,
		}, ""

	case "tripo-h3":
		base := map[string]any{
			"texture":          !isGeometry,
			"pbr":              isPbr,
			"texture_quality":  "standard",
			"geometry_quality": "standard",
		}
		if len(images) >= 2 {
			limit := len(images)
			if limit > 4 {
				limit = 4
			}
			base["image_urls"] = images[:limit]
			base["texture_alignment"] = "original_image"
			base["orientation"] = "default"
			return "tripo3d/h3.1/multiview-to-3d", base, ""
		}
		if len(images) == 1 {
			base["image_url"] = images[0]
			base["texture_alignment"] = "original_image"
			base["orientation"] = "default"
			return "tripo3d/h3.1/image-to-3d", base, ""
		}
		if prompt == "" || utf8.RuneCountInString(prompt) > 1024 {
			return "", nil, "请输入 1–1024 字的 3D 描述或连接参考图"
		}
		base["prompt"] = prompt
		return "tripo3d/h3.1/text-to-3d", base, ""

	default:
		generateType := "Normal"
		if isGeometry {
			generateType = "Geometry"
		}
		if len(images) > 0 {
			body := map[string]any{
				"input_image_url": images[0],
				"generate_type":   generateType,
				"enable_pbr":      isPbr,
				"face_count":      500000,
			}
			viewKeys := []string{
				"back_image_url", "left_image_url", "right_image_url",
				"top_image_url", "bottom_image_url",
				"left_front_image_url", "right_front_image_url",
			}
			for idx, key := range viewKeys {
				if idx+1 < len(images) && images[idx+1] != "" {
					body[key] = images[idx+1]
				}
			}
			return "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d", body, ""
		}
		if prompt == "" || utf8.RuneCountInString(prompt) > 1024 {
			return "", nil, "请输入 1–1024 字的 3D 描述或连接参考图"
		}
		return "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d", map[string]any{
			"prompt":        prompt,
			"generate_type": generateType,
			"enable_pbr":    isPbr,
			"face_count":    500000,
		}, ""
	}
}

func submitFal3D(cfg config.Config, w http.ResponseWriter, r *http.Request, client *http.Client, input specializedInput) (string, string, string, string, int, bool) {
	falPrefix, key, errStatus, errMsg := fal3DCredentials(cfg, r, input)
	if errMsg != "" {
		specializedError(w, errStatus, errMsg, true)
		return "", "", "", "", 0, false
	}
	modelPath, body, validationErr := buildFal3DRequest(input)
	if validationErr != "" {
		specializedError(w, http.StatusBadRequest, validationErr, true)
		return "", "", "", "", 0, false
	}
	endpoint := falPrefix + "/" + modelPath
	result, status := specializedPost(r.Context(), client, endpoint, key, body)
	nested, _ := result["data"].(map[string]any)
	pick := func(field string) string {
		if v := strings.TrimSpace(specializedString(result, field)); v != "" {
			return v
		}
		return strings.TrimSpace(specializedString(nested, field))
	}
	task := pick("request_id")
	if task == "" {
		task = pick("task_id")
	}
	if task == "" {
		task = pick("id")
	}
	statusURL := rewriteFalURL(pick("status_url"), falPrefix, true)
	if statusURL == "" && task != "" {
		statusURL = falPrefix + "/" + modelPath + "/requests/" + task + "/status"
	}
	responseURL := rewriteFalURL(pick("response_url"), falPrefix, true)
	if responseURL == "" && task != "" {
		responseURL = falPrefix + "/" + modelPath + "/requests/" + task
	}
	return task, "fal:" + modelPath, statusURL, responseURL, status, true
}

func falFileURL(v any) string {
	switch item := v.(type) {
	case string:
		return specializedHTTPS(strings.TrimSpace(item))
	case map[string]any:
		for _, k := range []string{"url", "file_url", "href"} {
			if u := specializedHTTPS(strings.TrimSpace(specializedString(item, k))); u != "" {
				return u
			}
		}
	}
	return ""
}

func extractFal3DResult(payload map[string]any) (string, string, []map[string]string) {
	if payload == nil {
		return "", "", nil
	}
	candidates := []map[string]any{payload}
	for _, key := range []string{"data", "output", "response", "result"} {
		if sub, ok := payload[key].(map[string]any); ok && sub != nil {
			candidates = append(candidates, sub)
		}
	}
	var glbURL, objURL, fbxURL, usdzURL, thumbURL string
	for _, node := range candidates {
		urls, _ := node["model_urls"].(map[string]any)
		if glbURL == "" {
			for _, v := range []any{urls["glb"], node["model_glb"], node["pbr_model"], node["model_mesh"], node["base_model"], node["glb"], node["mesh"]} {
				if u := falFileURL(v); u != "" {
					glbURL = u
					break
				}
			}
		}
		if objURL == "" {
			for _, v := range []any{urls["obj"], node["model_obj"], node["obj"]} {
				if u := falFileURL(v); u != "" {
					objURL = u
					break
				}
			}
		}
		if fbxURL == "" {
			for _, v := range []any{urls["fbx"], node["model_fbx"], node["fbx"]} {
				if u := falFileURL(v); u != "" {
					fbxURL = u
					break
				}
			}
		}
		if usdzURL == "" {
			for _, v := range []any{urls["usdz"], node["model_usdz"], node["usdz"]} {
				if u := falFileURL(v); u != "" {
					usdzURL = u
					break
				}
			}
		}
		if thumbURL == "" {
			for _, v := range []any{node["thumbnail"], node["rendered_image"], node["thumbnail_url"], node["preview"]} {
				if u := falFileURL(v); u != "" {
					thumbURL = u
					break
				}
			}
		}
	}
	modelURL := glbURL
	if modelURL == "" {
		modelURL = objURL
	}
	if modelURL == "" {
		modelURL = fbxURL
	}
	if modelURL == "" {
		modelURL = usdzURL
	}
	var outputs []map[string]string
	for _, entry := range []struct {
		url string
		ext string
	}{
		{glbURL, "glb"},
		{objURL, "obj"},
		{fbxURL, "fbx"},
		{usdzURL, "usdz"},
	} {
		if entry.url != "" {
			outputs = append(outputs, map[string]string{"url": entry.url, "extension": entry.ext})
		}
	}
	return modelURL, thumbURL, outputs
}

func queryFal3D(cfg config.Config, w http.ResponseWriter, r *http.Request, client *http.Client, task, mode string, receiptBody map[string]any) {
	falPrefix, key, _, errMsg := fal3DCredentials(cfg, r, specializedInput{})
	if errMsg != "" {
		specializedError(w, http.StatusServiceUnavailable, "3D 服务配置不可用", false)
		return
	}
	modelPath := strings.TrimPrefix(mode, "fal:")
	savedStatus := specializedString(receiptBody, "statusUrl")
	savedResponse := specializedString(receiptBody, "responseUrl")
	statusURL := rewriteFalURL(savedStatus, falPrefix, false)
	responseURL := rewriteFalURL(savedResponse, falPrefix, false)
	if (savedStatus != "" && statusURL == "") || (savedResponse != "" && responseURL == "") {
		specializedError(w, http.StatusConflict, "请切回提交任务时使用的 3D 渠道", false)
		return
	}
	if statusURL == "" {
		statusURL = falPrefix + "/" + modelPath + "/requests/" + task + "/status"
	}
	if responseURL == "" {
		responseURL = falPrefix + "/" + modelPath + "/requests/" + task
	}

	data, code := specializedJSON(r.Context(), client, http.MethodGet, statusURL, key, "", nil)
	if code != http.StatusOK || data == nil {
		specializedError(w, http.StatusBadGateway, "查询服务暂不可用，可继续查询原任务", false)
		return
	}
	nested, _ := data["data"].(map[string]any)
	rawStatus := strings.ToUpper(strings.TrimSpace(specializedString(data, "status")))
	if rawStatus == "" {
		rawStatus = strings.ToUpper(strings.TrimSpace(specializedString(nested, "status")))
	}

	result := map[string]any{"success": true, "taskId": task, "status": "pending"}
	switch rawStatus {
	case "FAILED", "ERROR", "CANCELED", "CANCELLED", "EXPIRED":
		result["status"] = "failed"
	case "COMPLETED", "SUCCESS", "SUCCEEDED", "DONE":
		modelURL, imageURL, outputs := extractFal3DResult(data)
		if modelURL == "" && responseURL != "" {
			respData, respCode := specializedJSON(r.Context(), client, http.MethodGet, responseURL, key, "", nil)
			if respCode != http.StatusOK || respData == nil {
				specializedError(w, http.StatusBadGateway, "读取 3D 结果暂不可用，可继续查询原任务", false)
				return
			}
			modelURL, imageURL, outputs = extractFal3DResult(respData)
		}
		if modelURL == "" {
			specializedError(w, http.StatusBadGateway, "任务完成但没有可用的输出文件", false)
			return
		}
		result["status"] = "done"
		result["modelUrl"] = modelURL
		if imageURL != "" {
			result["imageUrl"] = imageURL
		}
		if len(outputs) > 0 {
			result["outputs"] = outputs
		}
	}
	httpx.WriteJSON(w, http.StatusOK, result)
}
