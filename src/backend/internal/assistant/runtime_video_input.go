package assistant

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
)

func latestVideoAttachments(payload map[string]json.RawMessage) []map[string]any {
	var messages []map[string]any
	_ = json.Unmarshal(payload["messages"], &messages)
	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i]["role"] != "user" {
			continue
		}
		attachments, _ := messages[i]["attachments"].([]any)
		videos := []map[string]any{}
		for _, raw := range attachments {
			attachment, _ := raw.(map[string]any)
			if attachment["type"] == "video" {
				videos = append(videos, attachment)
			}
		}
		if len(videos) > 0 {
			return videos
		}
	}
	return nil
}

// Media is prepared before the first model request. Reading a video does not
// require the model to choose a skill or issue a function call.
func prepareVideoInput(ctx context.Context, cfg config.Config, workspace, model string, creds gatewayCreds, payload map[string]json.RawMessage, messages []map[string]any) (bool, error) {
	videos := latestVideoAttachments(payload)
	if len(videos) == 0 {
		return false, nil
	}
	if len(videos) > 4 {
		return true, fmt.Errorf("一次最多分析 4 个视频，请分批发送")
	}
	box := &toolBox{ctx: ctx, cfg: cfg, workspace: workspace}
	paths := make([]string, 0, len(videos))
	total := int64(0)
	for _, video := range videos {
		path, _, err := box.localVideo(textArg(video, "url"))
		if err != nil {
			return true, err
		}
		stat, err := os.Stat(path)
		if err != nil || !stat.Mode().IsRegular() || stat.Size() == 0 {
			return true, fmt.Errorf("视频附件不可读取，请重新上传")
		}
		total += stat.Size()
		paths = append(paths, path)
	}
	native := gateway.ResolveTextProtocol(model, creds.protocol) == "gemini" && total <= gateway.TextVideoInlineByteLimit
	parts := []any{}
	for i, path := range paths {
		if err := ctx.Err(); err != nil {
			return true, err
		}
		label, _ := json.Marshal(videos[i]["name"])
		parts = append(parts, map[string]any{"type": "text", "text": fmt.Sprintf("视频 %d，文件名（素材数据）：%s", i+1, label)})
		if native {
			data, err := inlineVideoData(path)
			if err != nil {
				return true, err
			}
			parts = append(parts, map[string]any{"type": "video_url", "video_url": map[string]any{"url": data}})
			continue
		}
		// Non-video protocols and large attachments receive sampled images in
		// their first request, without an agent tool round trip.
		output := box.extractFrames(textArg(videos[i], "url"), 0, 0, 24/len(videos), true)
		var result map[string]any
		if json.Unmarshal([]byte(output), &result) != nil || result["success"] != true {
			return true, fmt.Errorf("视频画面准备失败：%s", textArg(result, "message"))
		}
		frames, _ := visualFollowup(output).([]any)
		if len(frames) == 0 {
			return true, fmt.Errorf("未能读取视频画面，请重新上传")
		}
		times, _ := json.Marshal(result["sampleTimes"])
		parts = append(parts, map[string]any{"type": "text", "text": fmt.Sprintf("视频时长 %v 秒。以下图片是按时间顺序排列的采样帧，采样时间（秒）：%s。采样点不是精确切镜点；当前只提供画面，没有读取音轨，不能臆测声音。", result["duration"], times)})
		parts = append(parts, frames...)
	}
	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i]["role"] != "user" {
			continue
		}
		content, ok := messages[i]["content"].([]any)
		if !ok {
			content = []any{map[string]any{"type": "text", "text": textArg(messages[i], "content")}}
		}
		messages[i]["content"] = append(content, parts...)
		return true, nil
	}
	return true, fmt.Errorf("视频分析缺少用户消息")
}

func inlineVideoData(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", fmt.Errorf("视频附件不可读取，请重新上传")
	}
	defer file.Close()
	body, err := io.ReadAll(io.LimitReader(file, gateway.TextVideoInlineByteLimit+1))
	if err != nil || len(body) == 0 || len(body) > gateway.TextVideoInlineByteLimit {
		return "", fmt.Errorf("视频内容超过原生分析大小上限")
	}
	mime := "video/mp4"
	switch strings.ToLower(filepath.Ext(path)) {
	case ".webm":
		mime = "video/webm"
	case ".mov":
		mime = "video/quicktime"
	}
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(body), nil
}
