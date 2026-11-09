package generate

import (
	"beike.local/cloud/src/backend/internal/gateway"
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

func grokVoiceBodyError(payload map[string]json.RawMessage) string {
	if message := stringList(payload, "voice_ids", 3); message != "" {
		return message
	}
	var values []json.RawMessage
	_ = json.Unmarshal(payload["voice_ids"], &values)
	for _, value := range values {
		if message := boundedString(value, 64, true, ""); message != "" {
			return message
		}
	}
	return ""
}

func grokVoiceInputError(payload map[string]json.RawMessage, model, mode string) string {
	voices := rawStringList(payload["voice_ids"])
	if len(voices) == 0 {
		return ""
	}
	if !regexp.MustCompile(`(?i)^grok-imagine-video-1[.-]5(?:-preview)?$`).MatchString(strings.TrimSpace(model)) {
		return "官方预置音色仅支持 Grok Imagine Video 1.5"
	}
	if len(rawStringList(payload["audios"])) > 0 {
		return "Grok 官方预置音色不能与自定义声音样本同时使用；音频文件参考需要 xAI 专门权限"
	}
	if mode == "edit" || mode == "extend" {
		return "Grok 编辑和延长视频不支持选择官方预置音色，请切换生成方式"
	}
	if audio, set := rawBoolPresent(payload, "audio"); set && !audio {
		return "Grok 官方预置音色需要开启生成声音"
	}
	if strings.EqualFold(rawStringValue(payload["resolution"]), "1080P") {
		return "Grok 官方预置音色参考最高支持 720P，请降低清晰度"
	}
	if len(voices) > 3 {
		return "Grok 最多支持 3 个官方预置音色"
	}
	return ""
}

func attachGrokVoiceReferences(body map[string]any, voiceIDs []string) {
	if len(voiceIDs) == 0 {
		return
	}
	voices := make([]map[string]string, 0, len(voiceIDs))
	for _, id := range voiceIDs {
		voices = append(voices, map[string]string{"voice_id": strings.ToLower(strings.TrimSpace(id))})
	}
	body["reference_audios"] = voices
}

// Grok accepts inline images and MP4 videos. Resolve local storage references
// after the submission claim so retries keep their original input fingerprint.
func prepareGrokMedia(ctx context.Context, body map[string]any, workspace string, production bool) error {
	imageIndex := 0
	prepareImage := func(node any) error {
		err := prepareGrokMediaNode(node, func(ref string) (string, error) {
			value, err := dashscopeImageRef(ctx, normalizeImageRef(ref), imageIndex, workspace, production)
			if err == nil && value == "" {
				err = imageEditPrepareError{"Grok 参考图地址为空"}
			}
			return value, err
		})
		imageIndex++
		return err
	}
	for _, key := range []string{"image", "last_frame"} {
		if node, ok := body[key]; ok {
			if err := prepareImage(node); err != nil {
				return err
			}
		}
	}
	switch refs := body["reference_images"].(type) {
	case []map[string]string:
		for _, node := range refs {
			if err := prepareImage(node); err != nil {
				return err
			}
		}
	case []any:
		for _, node := range refs {
			if err := prepareImage(node); err != nil {
				return err
			}
		}
	}
	if refs, ok := body["images"].([]string); ok {
		for index, ref := range refs {
			node := map[string]string{"url": ref}
			if err := prepareImage(node); err != nil {
				return err
			}
			refs[index] = node["url"]
		}
	}
	if node, ok := body["video"]; ok {
		return prepareGrokMediaNode(node, func(ref string) (string, error) {
			return prepareGrokVideoReference(ctx, ref, workspace, production)
		})
	}
	return nil
}

func prepareGrokMediaNode(node any, resolve func(string) (string, error)) error {
	var ref, fileID string
	switch typed := node.(type) {
	case map[string]string:
		ref, fileID = typed["url"], typed["file_id"]
	case map[string]any:
		ref, _ = typed["url"].(string)
		fileID, _ = typed["file_id"].(string)
	default:
		return imageEditPrepareError{"Grok 参考素材格式不正确"}
	}
	if ref == "" && strings.TrimSpace(fileID) != "" {
		return nil
	}
	resolved, err := resolve(ref)
	if err != nil {
		return err
	}
	switch typed := node.(type) {
	case map[string]string:
		typed["url"] = resolved
	case map[string]any:
		typed["url"] = resolved
	}
	return nil
}

func prepareGrokVideoReference(ctx context.Context, ref, workspace string, production bool) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	ref = normalizeImageRef(ref)
	if !strings.HasPrefix(ref, "/storage/") {
		if strings.HasPrefix(strings.ToLower(ref), "data:video/mp4;base64,") {
			return ref, nil
		}
		parsed, err := url.Parse(ref)
		if err == nil && parsed.Host != "" && parsed.User == nil && (parsed.Scheme == "https" || parsed.Scheme == "http") {
			return ref, nil
		}
		return "", imageEditPrepareError{"Grok 参考视频需要公网 HTTP(S) 链接、MP4 数据或当前工作区 MP4 视频"}
	}
	path, err := resolveSeedanceLocalVideoPath(ref, workspace, production)
	if err != nil {
		return "", err
	}
	if !strings.EqualFold(filepath.Ext(path), ".mp4") {
		return "", imageEditPrepareError{"Grok 参考视频需要 MP4 格式，请先转换视频后重试"}
	}
	file, err := os.Open(path)
	if err != nil {
		return "", imageEditPrepareError{"本地参考视频不存在"}
	}
	defer file.Close()
	// Keep the existing application upload limit; this is not a provider quota.
	body, err := io.ReadAll(io.LimitReader(file, 32<<20+1))
	if err != nil || len(body) == 0 || len(body) > 32<<20 {
		return "", imageEditPrepareError{"参考视频为空或超过当前 32MB 上传上限"}
	}
	if len(body) < 12 || string(body[4:8]) != "ftyp" {
		return "", imageEditPrepareError{"Grok 参考视频不是有效的 MP4 文件"}
	}
	return "data:video/mp4;base64," + base64.StdEncoding.EncodeToString(body), nil
}

func grokOfficialHost(base string) bool {
	parsed, err := url.Parse(strings.TrimSpace(base))
	if err != nil {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	return host == "api.x.ai" || strings.HasSuffix(host, ".api.x.ai")
}

func routeGrokEndpoints(base, mode string) ([]string, []string) {
	root := strings.TrimRight(gateway.NormalizeGatewayBaseURL(base), "/")
	if !grokOfficialHost(base) && !strings.HasSuffix(strings.ToLower(root), "/xai") {
		root += "/xai"
	}
	return []string{root + "/v1/videos/" + grokSubmitPath(mode)}, []string{root + "/v1/videos/{taskId}"}
}

func grokOfficialModeError(base, model, mode string) string {
	if videoFamily(model) != "grok-video" {
		return ""
	}
	parsed, _ := url.Parse(strings.TrimSpace(base))
	if parsed != nil && strings.EqualFold(parsed.Hostname(), "us.api.x.ai") {
		return "Grok 美国区域端点暂不提供视频接口，请使用官方全球地址 https://api.x.ai/v1"
	}
	if (grokOfficialHost(base) || minimaxComflyHost(base)) && strings.Contains(strings.ToLower(model), "grok-imagine-video-1.5") && (mode == "edit" || mode == "extend") {
		return "Grok 1.5 官方接口暂不支持编辑或延长，请切换生成方式；这两种方式需使用 grok-imagine-video"
	}
	return ""
}
