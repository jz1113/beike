package sales

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/platform/media"
	"beike.local/cloud/src/backend/internal/platform/network"
	"beike.local/cloud/src/backend/internal/platform/storage"
	_ "golang.org/x/image/webp"
)

type originalImageSizeError struct{ maxBytes int64 }

func (e originalImageSizeError) Error() string {
	return fmt.Sprintf("原图超过 %d MB", e.maxBytes>>20)
}

func readOriginal(ctx context.Context, source, workspace string) ([]byte, error) {
	data, err := readOriginalBytes(ctx, source, workspace, 12<<20)
	if err != nil {
		return nil, err
	}
	dimensions, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || dimensions.Width <= 0 || dimensions.Height <= 0 {
		return nil, errors.New("请使用 JPEG、PNG、WebP 或 GIF 图片")
	}
	if int64(dimensions.Width)*int64(dimensions.Height) > 40_000_000 {
		return nil, errors.New("图片超过 4000 万像素，请裁剪后上传")
	}
	return data, nil
}

func readOriginalBytes(ctx context.Context, source, workspace string, maxBytes int64) ([]byte, error) {
	parsed, err := url.Parse(source)
	if err != nil {
		return nil, errors.New("图片地址无效")
	}
	var reader io.ReadCloser
	if parsed.Scheme == "" && parsed.Host == "" && strings.HasPrefix(parsed.Path, "/storage/") {
		root := storage.ResolveRoot()
		rel := strings.TrimPrefix(parsed.Path, "/storage/")
		file := storage.SafeWithin(root, rel)
		if file == "" || !storage.WorkspaceRel(rel, workspace, true) {
			return nil, errors.New("图片不属于当前工作区")
		}
		realRoot, rootErr := filepath.EvalSymlinks(root)
		realFile, fileErr := filepath.EvalSymlinks(file)
		realRel, relErr := filepath.Rel(realRoot, realFile)
		if rootErr != nil || fileErr != nil || relErr != nil || storage.SafeWithin(realRoot, realRel) == "" || !storage.WorkspaceRel(filepath.ToSlash(realRel), workspace, true) {
			return nil, errors.New("图片来源无法读取")
		}
		reader, err = os.Open(realFile)
	} else if (parsed.Scheme == "https" || parsed.Scheme == "http") && parsed.Host != "" && parsed.User == nil {
		fetchCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		defer cancel()
		request, reqErr := http.NewRequestWithContext(fetchCtx, http.MethodGet, source, nil)
		if reqErr != nil {
			return nil, errors.New("图片地址无效")
		}
		for key, value := range media.RemoteMediaHeaders(source, "image/*") {
			request.Header.Set(key, value)
		}
		response, fetchErr := network.SafeClient().Do(request)
		if fetchErr != nil {
			return nil, errors.New("远程图片不可访问")
		}
		reader = response.Body
		if response.StatusCode != 200 {
			reader.Close()
			return nil, errors.New("远程图片下载失败")
		}
		if response.ContentLength > maxBytes {
			reader.Close()
			return nil, originalImageSizeError{maxBytes}
		}
	} else {
		return nil, errors.New("仅支持已上传图片或公网 HTTP 图片")
	}
	if err != nil {
		return nil, errors.New("图片文件不存在")
	}
	defer reader.Close()
	if file, ok := reader.(*os.File); ok {
		if info, statErr := file.Stat(); statErr == nil && info.Size() > maxBytes {
			return nil, originalImageSizeError{maxBytes}
		}
	}
	data, err := io.ReadAll(io.LimitReader(reader, maxBytes+1))
	if err != nil {
		return nil, errors.New("原图读取中断，请重试")
	}
	if len(data) == 0 {
		return nil, errors.New("原图为空")
	}
	if int64(len(data)) > maxBytes {
		return nil, originalImageSizeError{maxBytes}
	}
	return data, nil
}
