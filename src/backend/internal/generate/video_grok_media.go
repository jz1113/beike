package generate

import (
	"context"
	"encoding/base64"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

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
