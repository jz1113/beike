package generate

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"beike.local/cloud/src/backend/internal/platform/storage"
)

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
