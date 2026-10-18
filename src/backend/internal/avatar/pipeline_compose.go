package avatar

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/platform/storage"
)

func composeAvatarExtras(ctx context.Context, task VideoTask, videoURL string) (string, error) {
	if !needsCompose(task) {
		return videoURL, nil
	}
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		return "", errors.New("合成背景或字幕需要本机安装 ffmpeg")
	}
	dir, err := os.MkdirTemp("", "avatar-compose-*")
	if err != nil {
		return "", errors.New("无法创建合成临时目录")
	}
	defer os.RemoveAll(dir)
	input, err := fetchToFile(ctx, videoURL, filepath.Join(dir, "in.mp4"))
	if err != nil {
		return "", err
	}
	output := filepath.Join(dir, "out.mp4")
	width, height := canvasSize(task)
	subtitle, subErr := subtitleFilter(task, dir)
	if subErr != nil {
		return "", errors.New("字幕文件写入失败")
	}
	args := []string{"-y"}
	if strings.TrimSpace(task.BgMediaURL) != "" {
		bg, bgErr := fetchToFile(ctx, task.BgMediaURL, filepath.Join(dir, "bg"+mediaExt(task.BgMediaURL)))
		if bgErr != nil {
			return "", bgErr
		}
		filter := overlayFilter(task, width, height, subtitle)
		args = append(args, "-i", bg, "-i", input, "-filter_complex", filter, "-map", "[vout]", "-map", "1:a?")
	} else {
		args = append(args, "-i", input, "-vf", foregroundFilter(task, width, height, subtitle))
	}
	args = append(args, "-r", frameRateValue(task), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", output)
	if err := exec.CommandContext(ctx, "ffmpeg", args...).Run(); err != nil {
		return "", errors.New("背景或字幕合成失败")
	}
	body, err := os.ReadFile(output)
	if err != nil || len(body) == 0 {
		return "", errors.New("合成结果为空")
	}
	localURL, publicURL, err := generate.SaveWorkspaceBytes(task.WorkspaceID, "avatar", task.ID+"_final.mp4", "video/mp4", body)
	if err != nil {
		return "", err
	}
	if publicURL != "" {
		return publicURL, nil
	}
	if localURL != "" {
		return localURL, nil
	}
	return "", errors.New("合成结果保存失败")
}

func fetchToFile(ctx context.Context, raw, dest string) (string, error) {
	if strings.HasPrefix(raw, "http://") || strings.HasPrefix(raw, "https://") {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, raw, nil)
		if err != nil {
			return "", errors.New("素材地址无效")
		}
		resp, err := generate.ModelHTTP().Do(req)
		if err != nil {
			return "", errors.New("素材下载失败")
		}
		defer resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return "", errors.New("素材下载失败")
		}
		file, err := os.Create(dest)
		if err != nil {
			return "", errors.New("无法保存素材")
		}
		defer file.Close()
		if _, err := io.Copy(file, io.LimitReader(resp.Body, 120<<20)); err != nil {
			return "", errors.New("素材下载失败")
		}
		return dest, nil
	}
	rel := strings.TrimPrefix(strings.TrimSpace(raw), "/storage/")
	path := storage.SafeWithin(storage.ResolveRoot(), rel)
	if path == "" {
		return "", errors.New("素材不在存储目录内")
	}
	return path, nil
}

func needsCompose(task VideoTask) bool {
	if task.SubtitleEnabled || strings.TrimSpace(task.BgMediaURL) != "" {
		return true
	}
	if task.AvatarScale > 0 && task.AvatarScale != 1 {
		return true
	}
	x, y := parseOffset(task.AvatarPosition)
	return x != 0 || y != 0
}

func canvasSize(task VideoTask) (int, int) {
	width, height := 1920, 1080
	switch task.Resolution {
	case 1:
		width, height = 854, 480
	case 2:
		width, height = 1280, 720
	case 4:
		width, height = 2560, 1440
	case 5:
		width, height = 3840, 2160
	}
	if task.Layout == 2 {
		return height, width
	}
	return width, height
}

func frameRateValue(task VideoTask) string {
	switch task.FrameRate {
	case 1:
		return "25"
	case 3:
		return "50"
	case 4:
		return "60"
	default:
		return "30"
	}
}

func parseOffset(raw string) (int, int) {
	parts := strings.Split(raw, ",")
	if len(parts) != 2 {
		return 0, 0
	}
	x, _ := strconv.Atoi(strings.TrimSpace(parts[0]))
	y, _ := strconv.Atoi(strings.TrimSpace(parts[1]))
	return x, y
}

func avatarWidth(task VideoTask, canvas int) int {
	scale := task.AvatarScale
	if scale <= 0 {
		scale = 1
	}
	width := int(float64(canvas) * scale)
	if width < 2 {
		return 2
	}
	return width
}

func subtitleFilter(task VideoTask, dir string) (string, error) {
	if !task.SubtitleEnabled || strings.TrimSpace(task.ScriptContent) == "" {
		return "", nil
	}
	size := task.FontSize
	if size <= 0 {
		size = 36
	}
	color := strings.TrimSpace(task.FontColor)
	if color == "" || strings.ContainsAny(color, "':\\") {
		color = "white"
	}
	y := "h-90"
	switch task.FontPosition {
	case "top":
		y = "48"
	case "center":
		y = "(h-text_h)/2"
	}
	text := task.ScriptContent
	runes := []rune(text)
	if len(runes) > 80 {
		text = string(runes[:80])
	}
	path := filepath.Join(dir, "subtitle.txt")
	if err := os.WriteFile(path, []byte(text), 0o644); err != nil {
		return "", err
	}
	return fmt.Sprintf("drawtext=textfile='%s':fontsize=%d:fontcolor=%s:borderw=2:bordercolor=black:x=(w-text_w)/2:y=%s", escapeFilterPath(path), size, color, y), nil
}

func escapeFilterPath(path string) string {
	path = strings.ReplaceAll(path, `\`, `\\`)
	path = strings.ReplaceAll(path, ":", `\:`)
	path = strings.ReplaceAll(path, "'", `\'`)
	return path
}

func foregroundFilter(task VideoTask, width, height int, subtitle string) string {
	x, y := parseOffset(task.AvatarPosition)
	filter := fmt.Sprintf("scale=%d:-2,pad=%d:%d:(ow-iw)/2+%d:(oh-ih)/2+%d:color=%s", avatarWidth(task, width), width, height, x, y, padColor(task.BgColor))
	if subtitle != "" {
		filter += "," + subtitle
	}
	return filter
}

func overlayFilter(task VideoTask, width, height int, subtitle string) string {
	x, y := parseOffset(task.AvatarPosition)
	filter := fmt.Sprintf("[0:v]scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d[bg];[1:v]scale=%d:-2[av];[bg][av]overlay=(W-w)/2+%d:(H-h)/2+%d", width, height, width, height, avatarWidth(task, width), x, y)
	if subtitle == "" {
		return filter + "[vout]"
	}
	return filter + "[v];[v]" + subtitle + "[vout]"
}

func padColor(raw string) string {
	raw = strings.TrimSpace(raw)
	if len(raw) == 7 && strings.HasPrefix(raw, "#") {
		return "0x" + raw[1:]
	}
	return "black"
}
