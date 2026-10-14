package assistant

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"beike.local/cloud/src/backend/internal/library"
	"beike.local/cloud/src/backend/internal/platform/storage"
	"beike.local/cloud/src/backend/internal/system"
)

func (box *toolBox) deconstructImage(args map[string]any) string {
	image := argText(args, "image_url", "url")
	if image == "" {
		return toolJSON(false, "缺少 image_url")
	}
	status, body := library.DeconstructImageURL(box.cfg, box.workspace, image, argText(args, "customApiKey"), argText(args, "customBaseUrl"))
	if status >= 400 {
		message, _ := body["error"].(string)
		if message == "" {
			message = "反推未完成"
		}
		return toolJSON(false, message)
	}
	prompt := reversePromptFrom(body)
	out, _ := json.Marshal(map[string]any{"success": true, "reversePrompt": prompt, "title": body["albumName"], "sections": body["data"]})
	return string(out)
}

func reversePromptFrom(body map[string]any) string {
	if data, ok := body["data"].(map[string]any); ok {
		if text, _ := data["reverse_prompt_zh"].(string); text != "" {
			return text
		}
		if images, ok := data["per_image"].([]any); ok && len(images) > 0 {
			if row, ok := images[0].(map[string]any); ok {
				if text, _ := row["reverse_prompt_zh"].(string); text != "" {
					return text
				}
			}
		}
	}
	return ""
}

func (box *toolBox) inspectVideo(args map[string]any) string {
	path, name, err := box.localVideo(argText(args, "video_url", "url"))
	if err != nil {
		return toolJSON(false, err.Error())
	}
	probe, err := system.ProbeVideo(box.cfg.Root, path)
	if err != nil {
		return toolJSON(false, err.Error())
	}
	frames := 0
	if probe.FPS > 0 {
		frames = int(probe.Duration * probe.FPS)
	}
	ratio := ""
	if probe.Height > 0 {
		ratio = fmt.Sprintf("%.3f", float64(probe.Width)/float64(probe.Height))
	}
	body, _ := json.Marshal(map[string]any{
		"success": true, "message": "已读取视频规格", "duration": probe.Duration,
		"width": probe.Width, "height": probe.Height, "fps": probe.FPS,
		"frameCount": frames, "aspectRatio": ratio, "filename": name,
	})
	return string(body)
}

func (box *toolBox) extractStoryboard(args map[string]any) string {
	count := intArgDefault(args, "sample_count", 12)
	if count < 4 {
		count = 4
	}
	if count > 24 {
		count = 24
	}
	return box.extractFrames(argText(args, "video_url", "url"), 0, 0, count, true)
}

func (box *toolBox) extractDetailedFrames(args map[string]any) string {
	start := floatArg(args, "start_time", "startSec")
	end := floatArg(args, "end_time", "endSec")
	if end <= start {
		end = start + 3
	}
	count := intArgDefault(args, "frame_count", 4)
	if count < 1 {
		count = 1
	}
	if count > 10 {
		count = 10
	}
	return box.extractFrames(argText(args, "video_url", "url"), start, end, count, false)
}

func (box *toolBox) extractFrames(video string, start, end float64, count int, storyboard bool) string {
	path, _, err := box.localVideo(video)
	if err != nil {
		return toolJSON(false, err.Error())
	}
	binary, ok := system.FFmpegBinary(box.cfg.Root)
	if !ok {
		return toolJSON(false, "ffmpeg 不可用")
	}
	dir, err := os.MkdirTemp("", "beike-frames-")
	if err != nil {
		return toolJSON(false, err.Error())
	}
	defer os.RemoveAll(dir)
	pattern := filepath.Join(dir, "frame-%02d.jpg")
	filter := fmt.Sprintf("fps=%d/%g", count, maxFloat(end-start, 1))
	args := []string{"-y"}
	if start > 0 {
		args = append(args, "-ss", fmt.Sprint(start))
	}
	if end > start {
		args = append(args, "-to", fmt.Sprint(end))
	}
	args = append(args, "-i", path, "-vf", filter, "-frames:v", strconv.Itoa(count), pattern)
	if err := exec.Command(binary, args...).Run(); err != nil {
		return toolJSON(false, "抽帧失败")
	}
	var images []string
	var urls []string
	for i := 1; i <= count; i++ {
		file := filepath.Join(dir, fmt.Sprintf("frame-%02d.jpg", i))
		raw, err := os.ReadFile(file)
		if err != nil {
			continue
		}
		rel := storage.WorkspaceKey(fmt.Sprintf("assistant-attachments/frame-%d.jpg", i), box.workspace)
		dest := storage.SafeWithin(storage.ResolveRoot(), rel)
		if dest == "" {
			continue
		}
		_ = os.MkdirAll(filepath.Dir(dest), 0o755)
		if os.WriteFile(dest, raw, 0o644) != nil {
			continue
		}
		urls = append(urls, "/storage/"+rel)
		if len(images) < 20 && len(strings.Join(images, "")) < 5_000_000 {
			images = append(images, "data:image/jpeg;base64,"+base64.StdEncoding.EncodeToString(raw))
		}
	}
	body := map[string]any{"success": true, "message": "已抽取画面", "frameUrls": urls, "_visualImages": images}
	if storyboard {
		body["contactSheetUrl"] = firstOrEmpty(urls)
		body["sampleFrames"] = urls
	} else {
		body["timeRange"] = []float64{start, end}
	}
	encoded, _ := json.Marshal(body)
	return string(encoded)
}

func (box *toolBox) localVideo(reference string) (string, string, error) {
	reference = strings.TrimSpace(reference)
	if reference == "" {
		return "", "", fmt.Errorf("缺少 video_url")
	}
	if strings.HasPrefix(reference, "/storage/") {
		rel := strings.TrimPrefix(reference, "/storage/")
		path := storage.SafeWithin(storage.ResolveRoot(), rel)
		if path == "" {
			return "", "", fmt.Errorf("视频不在工作区存储中")
		}
		return path, filepath.Base(path), nil
	}
	if strings.HasPrefix(reference, "file:") || filepath.IsAbs(reference) {
		return "", "", fmt.Errorf("只接受已上传的工作区视频")
	}
	return "", "", fmt.Errorf("只接受已上传的工作区视频")
}

func argText(args map[string]any, keys ...string) string {
	for _, key := range keys {
		if text := strings.TrimSpace(textArg(args, key)); text != "" {
			return text
		}
	}
	return ""
}

func floatArg(args map[string]any, keys ...string) float64 {
	for _, key := range keys {
		switch value := args[key].(type) {
		case float64:
			return value
		case string:
			parsed, _ := strconv.ParseFloat(value, 64)
			return parsed
		}
	}
	return 0
}

func maxFloat(value, floor float64) float64 {
	if value < floor {
		return floor
	}
	return value
}

func firstOrEmpty(values []string) string {
	if len(values) == 0 {
		return ""
	}
	return values[0]
}

func visualFollowup(raw string) any {
	var parsed map[string]any
	if json.Unmarshal([]byte(raw), &parsed) != nil {
		return nil
	}
	images, _ := parsed["_visualImages"].([]any)
	if len(images) == 0 {
		return nil
	}
	content := []any{}
	total := 0
	for _, item := range images {
		text, _ := item.(string)
		if text == "" || len(content) >= 20 || total+len(text) > 5_000_000 {
			continue
		}
		total += len(text)
		content = append(content, map[string]any{"type": "image_url", "image_url": map[string]any{"url": text}})
	}
	if len(content) == 0 {
		return nil
	}
	return content
}
