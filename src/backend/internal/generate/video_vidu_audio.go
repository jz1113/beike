package generate

import (
	"context"
	"net/url"
	"strings"

	"beike.local/cloud/src/backend/internal/platform/storage"
)

func prepareViduAudioReferences(ctx context.Context, root string, body map[string]any, workspace string, production bool, cfg *storage.ObjectConfig) error {
	sounds, _ := body["sounds"].([]string)
	if len(sounds) == 0 {
		return nil
	}
	resolved := make([]string, len(sounds))
	for index, ref := range sounds {
		ref = strings.TrimSpace(ref)
		if strings.HasPrefix(ref, "/storage/") {
			if cfg == nil {
				return imageEditPrepareError{"当前未配置对象存储，Vidu 参考音频需要公网可访问链接，请先完成对象存储配置"}
			}
			path, err := localReferenceAudioPath(ref, workspace, production)
			if err != nil {
				return err
			}
			data, err := prepareLocalViduReferenceAudio(ctx, root, path)
			if err != nil {
				return err
			}
			key := storage.ObjectKeyWithConfig(*cfg, "refs", "mp3", "")
			if err := storage.Objects.Put(ctx, *cfg, key, "audio/mpeg", data); err != nil {
				return imageEditPrepareError{"对象存储上传参考音频失败，请检查存储配置"}
			}
			ref, err = storage.ReferenceObjectURL(ctx, *cfg, key)
			if err != nil {
				return imageEditPrepareError{"参考音频已上传，但无法生成访问链接，请检查存储配置"}
			}
		}
		parsed, err := url.Parse(ref)
		if err != nil || parsed.Host == "" || parsed.User != nil || parsed.Scheme != "https" && parsed.Scheme != "http" {
			return imageEditPrepareError{"Vidu 参考音频需要公网 HTTP(S) 链接或当前工作区音频"}
		}
		resolved[index] = ref
	}
	body["sounds"] = resolved
	return nil
}

// Vidu accepts MP3 only; preserve the voice-library original and its timing.
func prepareLocalViduReferenceAudio(ctx context.Context, root, path string) ([]byte, error) {
	converted, _, _, err := transcodeReferenceAudio(ctx, root, path, "mp3", 0)
	return converted, err
}
