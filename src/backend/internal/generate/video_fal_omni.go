package generate

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/storage"
)

const falOmni10Model = "gemini-omni-1.0-flash"
const falOmniModel = "gemini-omni-1.2-flash"
const falOmniPath = "/google/gemini-omni-flash"

func falOmniVideo(model string) bool {
	id := videoCapabilityModelID(model)
	return id == falOmniModel || id == falOmni10Model
}

func falOmniEndpoint(model, mode string) string {
	version := "/v1.2/"
	if videoCapabilityModelID(model) == falOmni10Model {
		if mode == "text" {
			return falOmniPath
		}
		version = "/"
	}
	return falOmniPath + version + falOmniModePath(mode)
}

func falOmniModePath(mode string) string {
	switch mode {
	case "first_frame", "first_last_frame":
		return "image-to-video"
	case "omni":
		return "reference-to-video"
	case "edit", "extend":
		return mode
	default:
		return "text-to-video"
	}
}

func falOmniPayload(model, prompt, mode, ratio, resolution string, duration int, images, videos []string) map[string]any {
	body := map[string]any{"prompt": prompt}
	if videoCapabilityModelID(model) == falOmniModel {
		body["resolution"] = strings.ToLower(resolution)
	}
	if mode != "edit" {
		body["duration"] = duration
	}
	switch mode {
	case "edit", "extend":
		if len(videos) == 1 {
			body["video_url"] = videos[0]
		}
	default:
		body["aspect_ratio"] = ratio
	}
	switch mode {
	case "first_frame", "first_last_frame":
		if len(images) > 0 {
			body["image_url"] = images[0]
		}
		if len(images) == 2 && mode == "first_last_frame" {
			body["end_image_url"] = images[1]
		}
	case "omni":
		if len(images) > 0 {
			body["image_urls"] = images
		}
		if len(videos) > 0 {
			body["reference_video_urls"] = videos
		}
	}
	return body
}

func prepareFalOmniMedia(ctx context.Context, body map[string]any, workspace string, production bool, storeCfg *storage.ObjectConfig) error {
	prepareImage := func(ref string, index int) (string, error) {
		converted, err := dashscopeImageRef(ctx, ref, index, workspace, production)
		if err == nil && converted == "" {
			err = errors.New("参考图地址为空")
		}
		return converted, err
	}
	prepareVideo := func(ref string, _ int) (string, error) {
		if strings.HasPrefix(ref, "/storage/") {
			if storeCfg == nil {
				return "", errors.New("fal 参考视频需要公网地址，工作区视频请先配置对象存储")
			}
			return uploadVideoReference(ctx, ref, workspace, production, *storeCfg)
		}
		u, err := url.Parse(ref)
		if err != nil || u.User != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") {
			return "", errors.New("fal 参考视频需要可访问的 HTTP(S) 地址")
		}
		return ref, nil
	}
	for _, field := range []struct {
		name    string
		prepare func(string, int) (string, error)
	}{
		{"image_url", prepareImage}, {"end_image_url", prepareImage}, {"image_urls", prepareImage},
		{"video_url", prepareVideo}, {"reference_video_urls", prepareVideo},
	} {
		switch value := body[field.name].(type) {
		case string:
			converted, err := field.prepare(value, 0)
			if err != nil {
				return err
			}
			body[field.name] = converted
		case []string:
			result := make([]string, 0, len(value))
			for index, ref := range value {
				converted, err := field.prepare(ref, index)
				if err != nil {
					return err
				}
				result = append(result, converted)
			}
			body[field.name] = result
		}
	}
	return nil
}

func pollFalOmniVideo(cfg config.Config, w http.ResponseWriter, r *http.Request, base, key, taskID string) {
	endpoint := falImageBase(base) + falOmniPath + "/requests/" + url.PathEscape(taskID)
	read := func(endpoint string) (int, map[string]any) {
		code, raw, err := gateway.PostModelHeaders(r.Context(), http.MethodGet, endpoint, "", nil, 5*time.Second, falImageHeaders(key))
		data := map[string]any{}
		if err != nil || json.Unmarshal(raw, &data) != nil {
			return code, nil
		}
		return code, data
	}
	code, data := read(endpoint + "/status")
	parsed := pollParsed{status: "IN_PROGRESS"}
	if code == http.StatusOK && data != nil {
		switch firstString(data, "status") {
		case "IN_QUEUE", "IN_PROGRESS":
			parsed.progress = progressText(data)
		case "COMPLETED", "FAILED":
			if message := firstString(data, "error"); message != "" {
				parsed = pollParsed{status: "FAILURE", reason: safeVideoSubmitReason(message, key, 0, 0)}
			} else if firstString(data, "status") == "COMPLETED" {
				code, data = read(endpoint)
				if code == http.StatusUnprocessableEntity && data["detail"] != nil {
					parsed = pollParsed{status: "FAILURE", reason: "fal 视频生成失败，请查看 fal 任务详情"}
				} else if code == http.StatusOK {
					video, _ := data["video"].(map[string]any)
					if resultURL := specializedHTTPS(video["url"]); resultURL != "" {
						parsed = pollParsed{status: "SUCCESS", result: resultURL, progress: "100%"}
					} else {
						data = nil
					}
				} else {
					data = nil
				}
			} else {
				parsed = pollParsed{status: "FAILURE", reason: "fal 视频任务失败"}
			}
		default:
			data = nil
		}
		if data != nil {
			settleUnknownVideoTerminal(cfg, r, taskID, parsed, gateway.EncodeUsage(gateway.NormalizeUsage(data)))
			httpx.WriteJSON(w, http.StatusOK, polledTaskBody(r.Context(), cfg, scopeOf(r, "video"), taskID, parsed, data))
			return
		}
	}
	writeProbeMiss(cfg, w, r, "video", taskID, "视频任务失败", "暂时无法查询 fal 视频任务")
}
