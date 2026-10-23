package sales

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/platform/storage"
	"beike.local/cloud/src/backend/internal/system"
)

var composeProjectID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

func prepareComposeOutput(workspace, projectID string) (string, string, error) {
	if !composeProjectID.MatchString(projectID) {
		return "", "", errors.New("projectId 只允许字母、数字、下划线和短横线")
	}
	if strings.TrimSpace(workspace) == "" {
		workspace = "local"
	}
	rel := workspace + "/video_sales/" + projectID
	dir := storage.SafeWithin(storage.ResolveRoot(), rel)
	if dir == "" {
		return "", "", errors.New("输出目录无效")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", "", errors.New("无法创建输出目录")
	}
	return dir, "/storage/" + rel, nil
}

func materializeComposeInputs(ctx context.Context, root string, payload *ComposePayload, destDir string) error {
	for i := range payload.Clips {
		local, err := resolveComposeMedia(ctx, payload.Clips[i].FilePath, destDir, fmt.Sprintf("clip_%d", i))
		if err != nil {
			return fmt.Errorf("片段 %d：%w", i+1, err)
		}
		payload.Clips[i].FilePath = local
		if payload.Clips[i].Type == "video" && payload.Clips[i].HasAudio && strings.TrimSpace(payload.Clips[i].AudioURL) == "" {
			if probed, probeErr := system.ProbeVideo(root, local); probeErr == nil {
				payload.Clips[i].HasAudio = probed.HasAudio
			}
		}
		if strings.TrimSpace(payload.Clips[i].AudioURL) == "" {
			continue
		}
		audio, audioErr := resolveComposeMedia(ctx, payload.Clips[i].AudioURL, destDir, fmt.Sprintf("voice_%d", i))
		if audioErr != nil {
			return fmt.Errorf("片段 %d 配音：%w", i+1, audioErr)
		}
		payload.Clips[i].AudioURL = audio
	}
	if strings.TrimSpace(payload.Output.BgmPath) == "" {
		return nil
	}
	local, err := resolveComposeMedia(ctx, payload.Output.BgmPath, destDir, "bgm")
	if err != nil {
		return fmt.Errorf("背景音乐：%w", err)
	}
	payload.Output.BgmPath = local
	return nil
}

func resolveComposeMedia(ctx context.Context, raw, destDir, name string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", errors.New("素材路径为空")
	}
	if strings.HasPrefix(raw, "http://") || strings.HasPrefix(raw, "https://") {
		return downloadComposeMedia(ctx, raw, destDir, name)
	}
	if strings.HasPrefix(raw, "data:") {
		return writeDataURL(raw, destDir, name)
	}
	rel, relErr := storageRelative(raw)
	if relErr != nil {
		return "", relErr
	}
	full := storage.SafeWithin(storage.ResolveRoot(), rel)
	if full == "" {
		return "", errors.New("素材路径超出存储目录")
	}
	info, err := os.Stat(full)
	if err != nil || info.IsDir() {
		return "", errors.New("素材文件不存在")
	}
	return full, nil
}

func storageRelative(raw string) (string, error) {
	if filepath.IsAbs(raw) && !strings.HasPrefix(raw, "/storage/") {
		return "", errors.New("只允许存储目录内的相对路径或 http(s) 链接")
	}
	rel := raw
	switch {
	case strings.HasPrefix(rel, "/storage/"):
		rel = strings.TrimPrefix(rel, "/storage/")
	case strings.HasPrefix(rel, "storage/"):
		rel = strings.TrimPrefix(rel, "storage/")
	}
	rel = strings.TrimPrefix(rel, "/")
	if rel == "" || rel == "." || filepath.IsAbs(rel) || strings.Contains(rel, "..") {
		return "", errors.New("只允许存储目录内的相对路径或 http(s) 链接")
	}
	return rel, nil
}

func writeDataURL(raw, destDir, name string) (string, error) {
	comma := strings.Index(raw, ",")
	if comma < 0 || !strings.Contains(raw[:comma], ";base64") {
		return "", errors.New("素材数据无效")
	}
	payload, err := base64.StdEncoding.DecodeString(raw[comma+1:])
	if err != nil || len(payload) == 0 || len(payload) > 80<<20 {
		return "", errors.New("素材数据无效")
	}
	ext := ".bin"
	header := raw[:comma]
	switch {
	case strings.Contains(header, "image/png"):
		ext = ".png"
	case strings.Contains(header, "image/webp"):
		ext = ".webp"
	case strings.Contains(header, "image/"):
		ext = ".jpg"
	case strings.Contains(header, "video/webm"):
		ext = ".webm"
	case strings.Contains(header, "video/"):
		ext = ".mp4"
	case strings.Contains(header, "audio/"):
		ext = ".mp3"
	}
	target := filepath.Join(destDir, name+ext)
	if err := os.WriteFile(target, payload, 0o644); err != nil {
		return "", errors.New("无法保存素材")
	}
	return target, nil
}

func downloadComposeMedia(ctx context.Context, rawURL, destDir, name string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", errors.New("素材链接无效")
	}
	resp, err := generate.ModelHTTP().Do(req)
	if err != nil {
		return "", errors.New("素材下载失败")
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", errors.New("素材下载失败")
	}
	ext := filepath.Ext(strings.Split(req.URL.Path, "?")[0])
	if ext == "" || len(ext) > 8 {
		ext = ".bin"
	}
	target := filepath.Join(destDir, name+ext)
	file, err := os.Create(target)
	if err != nil {
		return "", errors.New("无法保存素材")
	}
	defer file.Close()
	if _, err := io.Copy(file, io.LimitReader(resp.Body, 80<<20)); err != nil {
		return "", errors.New("素材下载失败")
	}
	return target, nil
}
