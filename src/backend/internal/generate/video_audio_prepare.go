package generate

import (
	"beike.local/cloud/src/backend/internal/platform/storage"
	"beike.local/cloud/src/backend/internal/system"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type videoAudioDurationLimits struct {
	minimum, maximum, total float64
}

type videoAudioPreparation struct {
	sourceDuration, submittedDuration float64
	trimmed                           bool
}

type localVideoAudioSource struct {
	path     string
	duration float64
}

func videoAudioLimits(model string) videoAudioDurationLimits {
	if viduQ4Preview(model) {
		return videoAudioDurationLimits{minimum: 3, maximum: 12}
	}
	if minimaxH3(model) {
		return videoAudioDurationLimits{minimum: 2, maximum: 15, total: 15}
	}
	if videoFamily(model) == "seedance" {
		if seedance25(model) {
			return videoAudioDurationLimits{minimum: 2, maximum: 30, total: 30}
		}
		return videoAudioDurationLimits{minimum: 2, maximum: 15, total: 15}
	}
	return videoAudioDurationLimits{minimum: 1, maximum: 15, total: 15}
}

// Inspect every local original before uploading any submission copy. Provider
// URLs and managed assets keep their existing provider-side metadata checks.
func inspectLocalVideoAudioReferences(ctx context.Context, root, model string, refs []string, workspace string, production bool) ([]localVideoAudioSource, error) {
	limits := videoAudioLimits(model)
	sources := make([]localVideoAudioSource, len(refs))
	for index, ref := range refs {
		if !strings.HasPrefix(strings.TrimSpace(ref), "/storage/") {
			continue
		}
		path, err := localReferenceAudioPath(strings.TrimSpace(ref), workspace, production)
		if err != nil {
			return nil, err
		}
		if _, _, _, err := readLocalReferenceAudio(path); err != nil {
			return nil, err
		}
		duration, err := system.ProbeAudioDuration(ctx, root, path)
		if err != nil {
			return nil, imageEditPrepareError{"参考音频校验失败：" + err.Error()}
		}
		if duration < limits.minimum {
			return nil, imageEditPrepareError{fmt.Sprintf("音频%d时长不足：当前模型参考音频至少需 %.0f 秒，当前为 %.2f 秒", index+1, limits.minimum, duration)}
		}
		sources[index] = localVideoAudioSource{path: path, duration: duration}
	}
	return sources, nil
}

// Preserve reference order and reserve the minimum for every remaining sample.
// Millisecond budgets keep rounding from exceeding a provider's total limit.
func planVideoAudioDurations(limits videoAudioDurationLimits, sources []localVideoAudioSource) ([]float64, error) {
	targets := make([]float64, len(sources))
	remainingCount := 0
	total := 0.0
	for index, source := range sources {
		if source.path != "" {
			remainingCount++
			targets[index] = math.Min(source.duration, limits.maximum)
			total += targets[index]
		}
	}
	if limits.total == 0 || total <= limits.total {
		return targets, nil
	}
	minimum := int64(limits.minimum * 1000)
	remaining := int64(limits.total * 1000)
	if limits.total > 0 && int64(remainingCount)*minimum > remaining {
		return nil, imageEditPrepareError{"参考音频数量过多，无法在总时长限制内保留每段最低时长"}
	}
	for index, source := range sources {
		if source.path == "" {
			continue
		}
		remainingCount--
		target := int64(math.Floor(math.Min(source.duration, limits.maximum) * 1000))
		if limits.total > 0 {
			target = min(target, remaining-int64(remainingCount)*minimum)
			remaining -= target
		}
		targets[index] = float64(target) / 1000
	}
	return targets, nil
}

func prepareVideoAudioReferences(ctx context.Context, root, model string, refs []string, workspace string, production bool, cfg *storage.ObjectConfig) ([]string, []videoAudioPreparation, error) {
	if len(refs) == 0 {
		return refs, nil, nil
	}
	sources, err := inspectLocalVideoAudioReferences(ctx, root, model, refs, workspace, production)
	if err != nil {
		return nil, nil, err
	}
	limits := videoAudioLimits(model)
	targets, err := planVideoAudioDurations(limits, sources)
	if err != nil {
		return nil, nil, err
	}
	prepared := append([]string(nil), refs...)
	results := make([]videoAudioPreparation, len(refs))
	for index, source := range sources {
		if source.path == "" {
			continue
		}
		if cfg == nil {
			return nil, nil, imageEditPrepareError{"当前未配置对象存储，参考音频需要公网可访问链接，请先完成对象存储配置"}
		}
		data, extension, mime, err := readLocalReferenceAudio(source.path)
		if err != nil {
			return nil, nil, err
		}
		submittedDuration := source.duration
		trim := source.duration > targets[index]
		convert := extension != "mp3" && extension != "wav"
		format, maximum := "wav", targets[index]
		if viduQ4Preview(model) {
			format, maximum = "mp3", limits.maximum
			convert = extension != "mp3"
		}
		if trim || convert {
			data, extension, mime, err = transcodeReferenceAudio(ctx, root, source.path, format, maximum)
			if err != nil {
				return nil, nil, err
			}
			submittedDuration, err = probePreparedReferenceAudio(ctx, root, data, extension)
			if err != nil {
				return nil, nil, err
			}
			if submittedDuration < limits.minimum || submittedDuration > maximum+0.000001 {
				return nil, nil, imageEditPrepareError{"参考音频处理后时长不符合模型限制，请更换声音样本"}
			}
		}
		key := storage.ObjectKeyWithConfig(*cfg, "refs", extension, "")
		if err := storage.Objects.Put(ctx, *cfg, key, mime, data); err != nil {
			return nil, nil, imageEditPrepareError{"对象存储上传参考音频失败，请检查存储配置"}
		}
		prepared[index], err = storage.ReferenceObjectURL(ctx, *cfg, key)
		if err != nil {
			return nil, nil, imageEditPrepareError{"参考音频已上传，但无法生成访问链接，请检查存储配置"}
		}
		trimmed := trim || submittedDuration < source.duration-0.000001 || convert && format == "mp3" && source.duration > maximum-0.1
		results[index] = videoAudioPreparation{sourceDuration: source.duration, submittedDuration: submittedDuration, trimmed: trimmed}
	}
	return prepared, results, nil
}

func probePreparedReferenceAudio(ctx context.Context, root string, data []byte, extension string) (float64, error) {
	file, err := os.CreateTemp("", "video-prepared-audio-*."+extension)
	if err != nil {
		return 0, imageEditPrepareError{"无法校验处理后的参考音频"}
	}
	defer os.Remove(file.Name())
	_, writeErr := file.Write(data)
	closeErr := file.Close()
	if writeErr != nil || closeErr != nil {
		return 0, imageEditPrepareError{"无法校验处理后的参考音频"}
	}
	duration, err := system.ProbeAudioDuration(ctx, root, file.Name())
	if err != nil {
		return 0, imageEditPrepareError{"参考音频处理后校验失败：" + err.Error()}
	}
	return duration, nil
}

func replaceVideoAudioReferences(body map[string]any, family string, refs []string) {
	if len(refs) == 0 {
		return
	}
	index := 0
	switch family {
	case "vidu":
		body["sounds"] = refs
	case "seedance", "minimax":
		content, _ := body["content"].([]map[string]any)
		for _, item := range content {
			if item["type"] == "audio_url" && index < len(refs) {
				item["audio_url"] = map[string]string{"url": refs[index]}
				index++
			}
		}
	case "wan":
		input, _ := body["input"].(map[string]any)
		media, _ := input["media"].([]map[string]string)
		for _, item := range media {
			if item["type"] == "reference_audio" && index < len(refs) {
				item["url"] = refs[index]
				index++
			}
		}
	}
}

const videoReferenceAudioMaxBytes = 15 << 20

func referenceAudioAllowed(model string) bool {
	id := strings.ToLower(strings.TrimSpace(model))
	return minimaxH3(id) || viduQ4Preview(id) || regexp.MustCompile(`seedance-2[.-](0|5)(\D|$)`).MatchString(id) || regexp.MustCompile(`^wan3\.0-video(-prime)?$`).MatchString(id)
}

func videoAudioInputError(payload map[string]json.RawMessage, model, mode string, visualCount int) string {
	audios := rawStringList(payload["audios"])
	if len(audios) == 0 {
		return ""
	}
	if videoFamily(model) == "grok-video" {
		return "Grok 自定义声音样本需要 xAI 专门权限；普通账号请使用官方预置音色，或切换支持音频参考的模型"
	}
	if !referenceAudioAllowed(model) {
		return "当前模型尚未接入参考音频，请切换支持音频参考的 MiniMax H3、Seedance 2.0 / 2.5、万相 3.0 或 Vidu Q4"
	}
	if mode != "omni" {
		return "参考音频仅支持全能参考模式，请切换生成方式"
	}
	if audio, set := rawBoolPresent(payload, "audio"); set && !audio {
		return "参考音频需要开启生成声音，不能在无声视频中使用"
	}
	maxAudios := 5
	if viduQ4Preview(model) || minimaxH3(model) {
		maxAudios = 3
	}
	if videoFamily(model) == "seedance" {
		maxAudios = 3
		maxMaterials := 12
		if seedance25(model) {
			maxAudios = 10
			maxMaterials = 50
		} else if visualCount == 0 {
			return "Seedance 2.0 参考音频需要至少搭配一张图片或一段视频"
		}
		if visualCount+len(audios) > maxMaterials {
			return fmt.Sprintf("当前模型的图片、视频与音频合计最多 %d 个素材", maxMaterials)
		}
	}
	if len(audios) > maxAudios {
		return fmt.Sprintf("当前模型最多支持 %d 个参考音频", maxAudios)
	}
	return ""
}

func attachVideoAudioReferences(body map[string]any, family string, audios []string) {
	if len(audios) == 0 {
		return
	}
	switch family {
	case "vidu":
		body["sounds"] = audios
		body["audio"] = true
	case "seedance", "minimax":
		content, _ := body["content"].([]map[string]any)
		for _, ref := range audios {
			content = append(content, map[string]any{"type": "audio_url", "audio_url": map[string]string{"url": ref}, "role": "reference_audio"})
		}
		body["content"] = content
	case "wan":
		input, _ := body["input"].(map[string]any)
		media, _ := input["media"].([]map[string]string)
		for _, ref := range audios {
			media = append(media, map[string]string{"type": "reference_audio", "url": ref})
		}
		input["media"] = media
	}
}

// Inspect local bytes before uploading or creating a paid generation task.
// Remote and provider-managed assets retain their provider-side metadata checks.
func validateLocalVideoAudioReferences(ctx context.Context, root, model string, refs []string, workspace string, production bool) error {
	_, err := inspectLocalVideoAudioReferences(ctx, root, model, refs, workspace, production)
	return err
}

func localReferenceAudioPath(ref, workspace string, production bool) (string, error) {
	path, err := resolveSeedanceLocalVideoPath(ref, workspace, production)
	if err != nil {
		return "", imageEditPrepareError{strings.ReplaceAll(err.Error(), "参考视频", "参考音频")}
	}
	return path, nil
}

func readLocalReferenceAudio(path string) ([]byte, string, string, error) {
	handle, err := os.Open(path)
	if err != nil {
		return nil, "", "", imageEditPrepareError{"本地参考音频不存在"}
	}
	defer handle.Close()
	body, err := io.ReadAll(io.LimitReader(handle, videoReferenceAudioMaxBytes+1))
	if err != nil || len(body) == 0 || len(body) > videoReferenceAudioMaxBytes {
		return nil, "", "", imageEditPrepareError{"参考音频为空或超过 15MB"}
	}
	ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(path)), ".")
	if ext == "wav" && len(body) >= 12 && string(body[:4]) == "RIFF" && string(body[8:12]) == "WAVE" {
		return body, ext, "audio/wav", nil
	}
	if ext == "mp3" && len(body) >= 4 && (string(body[:3]) == "ID3" || body[0] == 0xff && body[1]&0xe0 == 0xe0 && body[1]&0x06 != 0) {
		return body, ext, "audio/mpeg", nil
	}
	if len(body) >= 12 {
		switch {
		case ext == "m4a" && string(body[4:8]) == "ftyp":
			return body, ext, "audio/mp4", nil
		case (ext == "ogg" || ext == "opus") && string(body[:4]) == "OggS":
			return body, ext, "audio/ogg", nil
		case ext == "flac" && string(body[:4]) == "fLaC":
			return body, ext, "audio/flac", nil
		case ext == "aac" && (string(body[:3]) == "ID3" || body[0] == 0xff && body[1]&0xf6 == 0xf0):
			return body, ext, "audio/aac", nil
		}
	}
	return nil, "", "", imageEditPrepareError{"参考音频格式与文件内容不匹配，请上传完整的 MP3、WAV、M4A、AAC、OGG、FLAC 或 OPUS 音频"}
}

func uploadAudioReference(ctx context.Context, root, ref, workspace string, production bool, cfg storage.ObjectConfig) (string, error) {
	path, err := localReferenceAudioPath(ref, workspace, production)
	if err != nil {
		return "", err
	}
	body, ext, mime, err := prepareLocalReferenceAudio(ctx, root, path)
	if err != nil {
		return "", err
	}
	key := storage.ObjectKeyWithConfig(cfg, "refs", ext, "")
	if err := storage.Objects.Put(ctx, cfg, key, mime, body); err != nil {
		return "", imageEditPrepareError{"对象存储上传参考音频失败，请检查存储配置"}
	}
	signed, err := storage.ReferenceObjectURL(ctx, cfg, key)
	if err != nil {
		return "", imageEditPrepareError{"参考音频已上传，但无法生成访问链接，请检查存储配置"}
	}
	return signed, nil
}

func resolveWanAudioRef(ctx context.Context, root, ref, workspace string, production bool, cfg *storage.ObjectConfig) (string, error) {
	ref = strings.TrimSpace(ref)
	if strings.HasPrefix(ref, "/storage/") {
		if cfg == nil {
			return "", imageEditPrepareError{"当前未配置对象存储，参考音频需要公网可访问链接，请先完成对象存储配置"}
		}
		return uploadAudioReference(ctx, root, ref, workspace, production, *cfg)
	}
	parsed, err := url.Parse(ref)
	if err != nil || parsed.Host == "" || parsed.User != nil || (parsed.Scheme != "https" && parsed.Scheme != "http" && parsed.Scheme != "oss") {
		return "", imageEditPrepareError{"参考音频需要公网 HTTP(S) 链接、OSS 临时链接或当前工作区音频"}
	}
	return ref, nil
}

func resolveSeedanceAudioRef(ctx context.Context, root string, scope seedanceAssetScope, ref, workspace string, production bool, cfg *storage.ObjectConfig) (string, error) {
	ref = strings.TrimSpace(ref)
	if strings.HasPrefix(strings.ToLower(ref), "asset://") {
		return ensureSeedanceAssetActive(ctx, scope, strings.TrimSpace(ref[len("asset://"):]), "Audio")
	}
	resolved, err := resolveWanAudioRef(ctx, root, ref, workspace, production, cfg)
	if err != nil {
		return "", err
	}
	if strings.HasPrefix(strings.ToLower(resolved), "oss://") {
		return "", imageEditPrepareError{"Seedance 参考音频需要公网 HTTP(S) 链接或 asset:// 素材标识"}
	}
	// Some Seedance gateways accept asset:// for images/videos while requiring
	// HTTP(S) in audio_url. Preserve the playable URL instead of registering Audio
	// or reusing a cached asset URI for an originally local/HTTP(S) voice sample.
	return resolved, nil
}

// Existing local voice-library formats are converted only for provider input.
// Source bytes remain untouched; duration limits are supplied by preparation.
func prepareLocalReferenceAudio(ctx context.Context, root, path string) ([]byte, string, string, error) {
	body, ext, mime, err := readLocalReferenceAudio(path)
	if err != nil || ext == "mp3" || ext == "wav" {
		return body, ext, mime, err
	}
	return transcodeReferenceAudio(ctx, root, path, "wav", 0)
}

// A positive maximum keeps the beginning of the sample without changing speed.
// Only fixed output formats are accepted; source media is never overwritten.
func transcodeReferenceAudio(ctx context.Context, root, path, format string, maxSeconds float64) ([]byte, string, string, error) {
	if format != "mp3" && format != "wav" {
		return nil, "", "", imageEditPrepareError{"参考音频转换仅支持 MP3 或 WAV 格式"}
	}
	if math.IsNaN(maxSeconds) || math.IsInf(maxSeconds, 0) {
		return nil, "", "", imageEditPrepareError{"参考音频时长限制不正确"}
	}
	body, ext, mime, err := readLocalReferenceAudio(path)
	if err != nil || ext == format && maxSeconds <= 0 {
		return body, ext, mime, err
	}
	limit := maxSeconds
	if limit > 0 && format == "mp3" {
		// MP3 frame padding is counted by ffprobe and provider duration checks.
		limit -= 0.1
		if limit <= 0 {
			return nil, "", "", imageEditPrepareError{"参考音频可用时长不足，无法准备 MP3 样本"}
		}
	}
	ffmpeg, ok := system.FFmpegBinary(root)
	if !ok {
		return nil, "", "", imageEditPrepareError{"当前环境未就绪 FFmpeg，无法转换已有音色样本，请检查媒体处理环境"}
	}
	file, err := os.CreateTemp("", "video-reference-audio-*."+format)
	if err != nil {
		return nil, "", "", imageEditPrepareError{"无法准备参考音频转换文件"}
	}
	defer os.Remove(file.Name())
	if err := file.Close(); err != nil {
		return nil, "", "", imageEditPrepareError{"无法准备参考音频转换文件"}
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	args := []string{"-nostdin", "-hide_banner", "-loglevel", "error", "-y",
		"-protocol_whitelist", "file,pipe", "-format_whitelist", "mov,matroska,webm,wav,mp3,aac,flac,ogg",
		"-i", path, "-map", "0:a:0", "-vn", "-sn", "-dn", "-map_metadata", "-1"}
	if limit > 0 {
		args = append(args, "-t", strconv.FormatFloat(math.Floor(limit*1e6)/1e6, 'f', 6, 64))
	}
	if format == "mp3" {
		args = append(args, "-c:a", "libmp3lame", "-q:a", "2")
	} else {
		args = append(args, "-c:a", "pcm_s16le")
	}
	args = append(args, "-ac", "1", "-ar", "32000", "-f", format, file.Name())
	cmd := exec.CommandContext(ctx, ffmpeg, args...)
	if err := cmd.Run(); err != nil {
		return nil, "", "", imageEditPrepareError{"参考音频转换失败，请确认样本完整且编码受支持"}
	}
	return readLocalReferenceAudio(file.Name())
}
