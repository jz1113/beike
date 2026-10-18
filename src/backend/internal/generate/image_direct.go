package generate

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/modelgw"
)

// GenerateImageURL submits a prompt through the image family router and returns a direct URL.
func GenerateImageURL(ctx context.Context, base, key, model, prompt, size string) (string, error) {
	if strings.TrimSpace(key) == "" || strings.TrimSpace(base) == "" {
		return "", errors.New("未配置生图密钥")
	}
	adapted := buildImagePayload(model, prompt, size, "hd", nil)
	urls := imageSubmitURLs(base, false, adapted.family, model)
	var last error
	for index, endpoint := range urls {
		status, raw, err := PostModel(ctx, http.MethodPost, endpoint, key, adapted.payload, 120*time.Second)
		if err != nil {
			last = errors.New("生图请求失败")
			if index == len(urls)-1 {
				return "", last
			}
			continue
		}
		data := map[string]any{}
		_ = json.Unmarshal(raw, &data)
		if status >= 200 && status < 300 {
			if direct := imageDirect(data); direct != "" {
				return direct, nil
			}
			if taskID, _ := imageOutcome(data); taskID != "" {
				url, pollErr := pollImageURL(ctx, base, key, taskID)
				if pollErr == nil && url != "" {
					return url, nil
				}
				if pollErr != nil {
					last = pollErr
				} else {
					last = errors.New("生图接口未返回图片")
				}
				continue
			}
		}
		last = errors.New(imageUpstreamError(data, status))
		retryable := modelgw.CanTryAnotherEndpoint(status) || status >= 500 || (status >= 200 && status < 300)
		if !retryable {
			return "", last
		}
	}
	if last == nil {
		last = errors.New("生图接口未返回图片")
	}
	return "", last
}

func pollImageURL(ctx context.Context, base, key, taskID string) (string, error) {
	root := strings.TrimRight(base, "/")
	endpoints := []string{root + "/v1/images/" + taskID, root + "/v1/tasks/" + taskID}
	deadline := time.Now().Add(90 * time.Second)
	for time.Now().Before(deadline) {
		for _, endpoint := range endpoints {
			status, raw, err := PostModel(ctx, http.MethodGet, endpoint, key, nil, 20*time.Second)
			if err != nil || status < 200 || status >= 300 {
				continue
			}
			data := map[string]any{}
			_ = json.Unmarshal(raw, &data)
			if url := imageDirect(data); url != "" {
				return url, nil
			}
			state := strings.ToUpper(firstString(data, "task_status", "status", "state"))
			if nested, ok := data["data"].(map[string]any); ok && state == "" {
				state = strings.ToUpper(firstString(nested, "task_status", "status", "state"))
			}
			if isFailure(state) {
				return "", errors.New(imageUpstreamError(data, status))
			}
		}
		select {
		case <-ctx.Done():
			return "", errors.New("生图超时")
		case <-time.After(2 * time.Second):
		}
	}
	return "", errors.New("生图超时")
}
