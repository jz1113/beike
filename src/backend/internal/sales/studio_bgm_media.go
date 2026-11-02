package sales

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/storage"
	"beike.local/cloud/src/backend/internal/system"
)

func prepareStudioBgmInput(ctx context.Context, cfg config.Config, workspace string, body studioBgmImportRequest, client audioMixMediaClient) (string, studioBgm, func(), error) {
	track := studioBgm{Title: "上传配乐", Description: "从上传音频保存", MoodTags: []string{"BGM"}, BPM: 100,
		License: "用户上传 · 授权范围以原素材为准", SuitableCategories: []string{"fashion", "beauty", "home", "food", "tech", "other"}}
	if body.BuiltinID != "" {
		builtin, exists := lookupBuiltinBgm(body.BuiltinID)
		if !exists {
			return "", track, func() {}, errors.New("内置配乐不存在")
		}
		file, err := os.CreateTemp("", "sales-bgm-import-*.wav")
		if err != nil {
			return "", track, func() {}, errors.New("准备配乐文件失败")
		}
		cleanup := func() { _ = os.Remove(file.Name()) }
		_, writeErr := file.Write(renderBuiltinBgmWAV(builtin))
		closeErr := file.Close()
		if writeErr != nil || closeErr != nil {
			cleanup()
			return "", track, func() {}, errors.New("写入配乐文件失败")
		}
		return file.Name(), builtin, cleanup, nil
	}
	video, source, limit := body.VideoURL != "", body.AudioURL, audioMixAudioLimit
	if video {
		source, limit = body.VideoURL, audioMixVideoLimit
		track.Title, track.Description = "参考视频原音轨", "保存参考视频的原始音轨；包含原片中已有的人声、音乐和环境声，未分离人声。"
		track.MoodTags = []string{"参考视频原音轨"}
		track.License = "参考视频原音轨 · 授权范围以原素材为准"
	}
	file, cleanup, err := resolveAudioMixMedia(ctx, source, workspace, video, client)
	if err == nil {
		info, statErr := os.Stat(file)
		if statErr != nil || !info.Mode().IsRegular() || info.Size() == 0 {
			err = errors.New("音视频文件不存在或为空")
		} else if info.Size() > limit {
			err = fmt.Errorf("音视频文件超过 %d MB，请截取后再导入", limit>>20)
		}
	}
	return file, track, cleanup, err
}

func renderStudioBgm(ctx context.Context, root, workspace, input string, start, duration float64) (output, audioURL string, measured float64, err error) {
	ffmpeg, ok := system.FFmpegBinary(root)
	if !ok {
		return "", "", 0, errors.New("FFmpeg 不可用，请检查媒体处理环境")
	}
	rel := storage.WorkspaceKey(fmt.Sprintf("azhuo/generated/audio/%s/sales_bgm_%s.m4a", time.Now().Format("200601"), httpx.RequestID()), workspace)
	output = storage.SafeWithin(storage.ResolveRoot(), rel)
	if output == "" || os.MkdirAll(filepath.Dir(output), 0o755) != nil {
		return "", "", 0, errors.New("创建配乐保存目录失败")
	}
	defer func() {
		if err != nil {
			_ = os.Remove(output)
		}
	}()
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	args := append([]string{"-y", "-nostdin", "-v", "error"}, audioMixInputArgs(input)...)
	args = append(args, "-ss", strconv.FormatFloat(start, 'f', 6, 64), "-t", strconv.FormatFloat(duration, 'f', 6, 64),
		"-map", "0:a:0", "-vn", "-map_metadata", "-1", "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-ac", "2",
		"-fs", strconv.FormatInt(audioMixAudioLimit, 10), "-movflags", "+faststart", output)
	cmd := exec.CommandContext(ctx, ffmpeg, args...)
	cmd.Stdout, cmd.Stderr = io.Discard, io.Discard
	if cmd.Run() != nil {
		return output, "", 0, errors.New("音轨保存失败，请确认音视频编码受支持后重试")
	}
	measured, err = system.ProbeAudioDuration(ctx, root, output)
	if err != nil || measured < 1 || measured > 601 {
		return output, "", 0, errors.New("保存的音轨不足 1 秒或无法读取，请调整片段后重试")
	}
	return output, "/storage/" + rel, roundTenth(measured), nil
}
