package generate

import (
	"context"
	"errors"
	"strings"
	"time"
)

// GenerateImageURL submits a prompt through the image family router and returns a direct URL.
func GenerateImageURL(ctx context.Context, base, key, model, prompt, size string) (string, error) {
	if strings.TrimSpace(key) == "" || strings.TrimSpace(base) == "" {
		return "", errors.New("未配置生图密钥")
	}
	protocol := resolveImageProtocol(base, "")
	result, err := protocol.Submit(imageRequest{
		Ctx: ctx, Base: base, APIKey: key, Model: model, Prompt: prompt, Size: size, Quality: "hd",
	})
	if err != nil {
		return "", errors.New("生图请求失败")
	}
	if result.Direct != "" {
		return result.Direct, nil
	}
	if result.TaskID != "" && result.Status >= 200 && result.Status < 300 {
		return pollImageURL(ctx, protocol, base, key, model, result.TaskID)
	}
	if result.Status != 0 {
		return "", errors.New(imageUpstreamError(result.Data, result.Status))
	}
	return "", errors.New("生图接口未返回图片")
}

func pollImageURL(ctx context.Context, protocol imageProtocol, base, key, model, taskID string) (string, error) {
	deadline := time.Now().Add(90 * time.Second)
	for time.Now().Before(deadline) {
		parsed, _, ok := protocol.Poll(imagePollRequest{Ctx: ctx, Base: base, APIKey: key, TaskID: taskID, Model: model})
		if ok && parsed.status == "SUCCESS" && parsed.result != "" {
			return parsed.result, nil
		}
		if ok && parsed.status == "FAILURE" {
			reason := parsed.reason
			if reason == "" {
				reason = "生图任务失败"
			}
			return "", errors.New(reason)
		}
		select {
		case <-ctx.Done():
			return "", errors.New("生图超时")
		case <-time.After(2 * time.Second):
		}
	}
	return "", errors.New("生图超时")
}
