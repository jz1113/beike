package sales

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"image"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

// A high-detail 4K PNG can exceed 20 MiB before it is split into JPEG views.
// Keep a separate source budget from uploads/OCR and bound decoded pixels below.
const assetGridMaxBytes = 64 << 20

// Bound concurrent full-image decoding rather than multiplying memory by nine.
var assetGridSlots = make(chan struct{}, 2)

var assetGridViews = map[string][]string{
	"persona": {"face", "front", "side", "threeQuarterLeft", "threeQuarterRight", "back", "sideRight", "upperBody", "backThreeQuarter"},
	"scene":   {"left", "right", "reverse", "frontWide", "leftWide", "rightWide", "reverseLeft", "reverseRight", "detail"},
}

type assetGridImage struct {
	View string `json:"view"`
	URL  string `json:"url"`
}

// AssetViewGrid only crops an existing result. It never submits a model request.
func AssetViewGrid(_ config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		fail := func(status int, message string) {
			httpx.WriteJSON(w, status, map[string]any{"success": false, "error": message})
		}
		// Inline base64 bodies are large too; acquire a slot before buffering JSON.
		select {
		case assetGridSlots <- struct{}{}:
			defer func() { <-assetGridSlots }()
		default:
			fail(429, "图片裁切正在进行，请稍后继续处理原图")
			return
		}
		var body struct {
			Kind     string `json:"kind"`
			ImageURL string `json:"imageUrl"`
		}
		bodyLimit := int64(base64.StdEncoding.EncodedLen(assetGridMaxBytes)) + 4096
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, bodyLimit))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&body); err != nil {
			var oversized *http.MaxBytesError
			if errors.As(err, &oversized) {
				httpx.WriteJSON(w, 413, map[string]any{"success": false, "code": "image_too_large", "error": "九宫格请求过大，原图最多支持 64 MB"})
			} else {
				fail(400, "请选择人物或场景九宫格图片")
			}
			return
		}
		if len(assetGridViews[body.Kind]) != 9 || strings.TrimSpace(body.ImageURL) == "" {
			fail(400, "请选择人物或场景九宫格图片")
			return
		}
		if err := decoder.Decode(new(any)); err != io.EOF {
			fail(400, "请求体必须是单个 JSON 对象")
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 90*time.Second)
		defer cancel()
		workspace := httpx.WorkspaceFrom(r)
		data, err := readAssetGrid(ctx, strings.TrimSpace(body.ImageURL), workspace)
		if err != nil {
			status, code := http.StatusBadRequest, "image_read_failed"
			var oversized originalImageSizeError
			if errors.As(err, &oversized) {
				status, code = http.StatusRequestEntityTooLarge, "image_too_large"
			}
			httpx.WriteJSON(w, status, map[string]any{"success": false, "code": code, "error": "九宫格原图读取失败：" + err.Error()})
			return
		}
		if err := validateAssetGrid(data); err != nil {
			fail(422, err.Error())
			return
		}
		images, err := splitAssetGrid(ctx, data, body.Kind, workspace)
		if err != nil {
			log.Printf("[sales-grid] crop/save failed: %v", err)
			if ctx.Err() != nil {
				fail(504, "九宫格裁切已取消或超时，可继续处理原图")
			} else {
				fail(500, "九宫格裁切或保存失败，可继续处理原图")
			}
			return
		}
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "images": images})
	}
}

func readAssetGrid(ctx context.Context, source, workspace string) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if !strings.HasPrefix(source, "data:") {
		if len(source) > 8192 {
			return nil, errors.New("图片地址过长")
		}
		if strings.HasPrefix(source, "https://") || strings.HasPrefix(source, "http://") {
			return fetchAssetGridOriginal(ctx, source)
		}
		return readOriginalBytes(ctx, source, workspace, assetGridMaxBytes)
	}
	header, payload, ok := strings.Cut(source, ",")
	switch header {
	case "data:image/jpeg;base64", "data:image/png;base64", "data:image/webp;base64", "data:image/gif;base64":
	default:
		return nil, errors.New("仅支持 JPEG、PNG、WebP 或 GIF 图片")
	}
	if len(payload) > base64.StdEncoding.EncodedLen(assetGridMaxBytes) {
		return nil, originalImageSizeError{assetGridMaxBytes}
	}
	if !ok {
		return nil, errors.New("九宫格图片编码无效")
	}
	data, err := base64.StdEncoding.DecodeString(payload)
	if err != nil || len(data) == 0 {
		return nil, errors.New("九宫格图片编码无效")
	}
	if len(data) > assetGridMaxBytes {
		return nil, originalImageSizeError{assetGridMaxBytes}
	}
	return data, nil
}

func validateAssetGrid(data []byte) error {
	dimensions, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return errors.New("请使用有效的 JPEG、PNG、WebP 或 GIF 九宫格图片")
	}
	if dimensions.Width < 768 || dimensions.Height < 768 {
		return errors.New("九宫格分辨率过低，每个视角至少需要 256 × 256 像素")
	}
	if int64(dimensions.Width)*int64(dimensions.Height) > 40_000_000 {
		return errors.New("九宫格超过 4000 万像素")
	}
	return nil
}
