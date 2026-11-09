package sales

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/media"
	"beike.local/cloud/src/backend/internal/platform/network"
	"beike.local/cloud/src/backend/internal/platform/storage"
)

// A high-detail 4K PNG can exceed 20 MiB before it is split into JPEG views.
// Keep a separate source budget from uploads/OCR and bound decoded pixels below.
const assetGridMaxBytes = 64 << 20

// Bound concurrent full-image decoding rather than multiplying memory by nine.
var assetGridSlots = make(chan struct{}, 2)

const personaStrip = "persona-1x4"

func (job assetViewJob) gridKind() string {
	metadata, _ := job.generation["metadata"].(map[string]any)
	if job.Kind == "persona" && metadata["layout"] == "1x4" {
		return personaStrip
	}
	return job.Kind
}

func (job assetViewJob) wholeSheet() bool {
	metadata, _ := job.generation["metadata"].(map[string]any)
	return job.gridKind() == personaStrip && metadata["output"] == "sheet"
}

func (job assetViewJob) outputViews() []string {
	if job.wholeSheet() {
		return []string{"sheet"}
	}
	return assetGridViews[job.gridKind()]
}

var assetGridViews = map[string][]string{
	personaStrip: {"front", "side", "back", "face"},
	"persona":    {"face", "front", "side", "threeQuarterLeft", "threeQuarterRight", "back", "sideRight", "upperBody", "backThreeQuarter"},
	"scene":      {"left", "right", "reverse", "frontWide", "leftWide", "rightWide", "reverseLeft", "reverseRight", "detail"},
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
			Layout   string `json:"layout"`
			Whole    bool   `json:"whole"`
			ImageURL string `json:"imageUrl"`
		}
		bodyLimit := int64(base64.StdEncoding.EncodedLen(assetGridMaxBytes)) + 4096
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, bodyLimit))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&body); err != nil {
			var oversized *http.MaxBytesError
			if errors.As(err, &oversized) {
				httpx.WriteJSON(w, 413, map[string]any{"success": false, "code": "image_too_large", "error": "视角图请求过大，原图最多支持 64 MB"})
			} else {
				fail(400, "请选择人物或场景视角图图片")
			}
			return
		}
		gridKind := body.Kind
		if body.Kind == "persona" && body.Layout == "1x4" {
			gridKind = personaStrip
		} else if body.Layout != "" && body.Layout != "3x3" {
			fail(400, "不支持的视角布局")
			return
		}
		if (body.Whole && gridKind != personaStrip) || (body.Kind != "persona" && body.Kind != "scene") || strings.TrimSpace(body.ImageURL) == "" {
			fail(400, "请选择人物或场景视角图图片")
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
			httpx.WriteJSON(w, status, map[string]any{"success": false, "code": code, "error": "视角图原图读取失败：" + err.Error()})
			return
		}
		if err := validateAssetGrid(data, gridKind); err != nil {
			fail(422, err.Error())
			return
		}
		images, err := storeAssetViewResult(ctx, data, gridKind, workspace, body.Whole)
		if err != nil {
			log.Printf("[sales-grid] crop/save failed: %v", err)
			if ctx.Err() != nil {
				fail(504, "视角图裁切已取消或超时，可继续处理原图")
			} else {
				fail(500, "视角图裁切或保存失败，可继续处理原图")
			}
			return
		}
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "images": images})
	}
}

func storeAssetViewResult(ctx context.Context, data []byte, kind, workspace string, whole bool) ([]assetGridImage, error) {
	if !whole {
		return splitAssetGrid(ctx, data, kind, workspace)
	}
	if err := validateAssetGrid(data, kind); err != nil {
		return nil, err
	}
	url, err := storeAssetCreationBytes(ctx, data, kind, workspace)
	if err != nil {
		return nil, err
	}
	return []assetGridImage{{View: "sheet", URL: url}}, nil
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
		return nil, errors.New("视角图图片编码无效")
	}
	data, err := base64.StdEncoding.DecodeString(payload)
	if err != nil || len(data) == 0 {
		return nil, errors.New("视角图图片编码无效")
	}
	if len(data) > assetGridMaxBytes {
		return nil, originalImageSizeError{assetGridMaxBytes}
	}
	return data, nil
}

func validateAssetGrid(data []byte, kind string) error {
	dimensions, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return errors.New("请使用有效的 JPEG、PNG、WebP 或 GIF 视角图图片")
	}
	columns, rows := assetGridDimensions(kind)
	if kind == personaStrip && dimensions.Width <= dimensions.Height {
		return errors.New("人物三视图需要横向一行四格原图")
	}
	if dimensions.Width < columns*256 || dimensions.Height < rows*256 {
		return errors.New("视角图分辨率过低，每个视角至少需要 256 × 256 像素")
	}
	if int64(dimensions.Width)*int64(dimensions.Height) > 40_000_000 {
		return errors.New("视角图超过 4000 万像素")
	}
	return nil
}

func fetchAssetGridOriginal(ctx context.Context, source string) ([]byte, error) {
	return fetchAssetGridWithClients(ctx, source, network.SafeClient(), network.SafeClientIPv6First())
}

// Some dual-stack CDNs accept IPv4 connections but stall while transferring the
// image. Retry the existing result over a separate IPv6-first connection instead
// of repeatedly downloading it over the same stalled IPv4 route. Both clients
// validate every DNS address and redirect; neither bypasses the public-IP guard.
func fetchAssetGridWithClients(ctx context.Context, source string, primary, alternate *http.Client) ([]byte, error) {
	u, err := url.Parse(source)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" || u.User != nil {
		return nil, errors.New("图片地址无效")
	}
	var data []byte
	for index, client := range []*http.Client{primary, alternate} {
		budget := 20 * time.Second
		if index == 1 {
			budget = 60 * time.Second
		}
		attempt, cancel := context.WithTimeout(ctx, budget)
		var retry bool
		data, retry, err = fetchAssetGridAttempt(attempt, source, client)
		cancel()
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		if err == nil || !retry {
			return data, err
		}
	}
	return nil, err
}

func fetchAssetGridAttempt(ctx context.Context, source string, client *http.Client) ([]byte, bool, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, source, nil)
	if err != nil {
		return nil, false, errors.New("图片地址无效")
	}
	for key, value := range media.RemoteMediaHeaders(source, "image/*") {
		req.Header.Set(key, value)
	}
	res, err := client.Do(req)
	if err != nil {
		return nil, true, errors.New("原图下载连接失败或超时，请继续补全以重试原图")
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, res.StatusCode >= 500 || res.StatusCode == 429,
			fmt.Errorf("远程图片下载失败（HTTP %d）", res.StatusCode)
	}
	if res.ContentLength > assetGridMaxBytes {
		return nil, false, originalImageSizeError{assetGridMaxBytes}
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, assetGridMaxBytes+1))
	if err != nil {
		return nil, true, errors.New("原图下载中断或超时，请继续补全以重试原图")
	}
	if len(data) > assetGridMaxBytes {
		return nil, false, originalImageSizeError{assetGridMaxBytes}
	}
	if len(data) == 0 {
		return nil, true, errors.New("原图为空")
	}
	return data, false, nil
}

func assetGridDigest(data []byte, kind string) string {
	hash := sha256.New()
	hash.Write([]byte("sales-grid-jpeg96-v1:" + kind + ":"))
	hash.Write(data)
	return hex.EncodeToString(hash.Sum(nil))
}

func assetGridDimensions(kind string) (columns, rows int) {
	if kind == personaStrip {
		return 4, 1
	}
	return 3, 3
}

func assetGridCell(bounds image.Rectangle, index int, kind string) image.Rectangle {
	columns, rows := assetGridDimensions(kind)
	row, column := index/columns, index%columns
	return image.Rect(bounds.Min.X+column*bounds.Dx()/columns, bounds.Min.Y+row*bounds.Dy()/rows,
		bounds.Min.X+(column+1)*bounds.Dx()/columns, bounds.Min.Y+(row+1)*bounds.Dy()/rows)
}

func splitAssetGrid(ctx context.Context, data []byte, kind, workspace string) ([]assetGridImage, error) {
	if len(assetGridViews[kind]) == 0 {
		return nil, errors.New("invalid grid kind")
	}
	if err := validateAssetGrid(data, kind); err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	root, err := openAssetGridRoot(workspace)
	if err != nil {
		return nil, err
	}
	defer root.Close()
	dir := path.Join("azhuo", "refs", "sales-grid", kind, assetGridDigest(data, kind))
	if err := root.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	files, err := root.OpenRoot(dir)
	if err != nil {
		return nil, err
	}
	defer files.Close()
	images := make([]assetGridImage, 0, len(assetGridViews[kind]))
	dimensions, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	bounds := image.Rect(0, 0, dimensions.Width, dimensions.Height)
	var decoded image.Image
	var cell *image.RGBA
	for index, view := range assetGridViews[kind] {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		filename := fmt.Sprintf("%02d-%s.jpg", index+1, view)
		if !validStoredGridCell(files, filename, assetGridCell(bounds, index, kind)) {
			// Completed retries need no full decode; partial retries decode only once.
			if decoded == nil {
				decoded, _, err = image.Decode(bytes.NewReader(data))
				if err != nil {
					return nil, err
				}
			}
			bounds := assetGridCell(decoded.Bounds(), index, kind)
			// Reuse the crop buffer instead of allocating nine full-size bitmaps.
			if cell == nil || cell.Bounds().Dx() != bounds.Dx() || cell.Bounds().Dy() != bounds.Dy() {
				cell = image.NewRGBA(image.Rect(0, 0, bounds.Dx(), bounds.Dy()))
			}
			draw.Draw(cell, cell.Bounds(), image.NewUniform(color.White), image.Point{}, draw.Src)
			draw.Draw(cell, cell.Bounds(), decoded, bounds.Min, draw.Over)
			if err := saveAssetGridCell(ctx, files, filename, cell); err != nil {
				return nil, err
			}
		}
		rel := storage.WorkspaceKey(path.Join(dir, filename), workspace)
		images = append(images, assetGridImage{View: view, URL: "/storage/" + rel})
	}
	return images, nil
}

func validStoredGridCell(files *os.Root, name string, expected image.Rectangle) bool {
	info, err := files.Lstat(name)
	if err != nil || !info.Mode().IsRegular() || info.Size() <= 0 {
		return false
	}
	file, err := files.Open(name)
	if err != nil {
		return false
	}
	defer file.Close()
	size, err := jpeg.DecodeConfig(file)
	if err != nil || size.Width != expected.Dx() || size.Height != expected.Dy() {
		return false
	}
	// A truncated JPEG can have a perfectly valid header and dimensions.
	var end [2]byte
	_, err = file.ReadAt(end[:], info.Size()-2)
	return err == nil && end == [2]byte{0xff, 0xd9}
}

// A workspace-rooted directory handle keeps symlinks in generated paths confined.
func openAssetGridRoot(workspace string) (*os.Root, error) {
	rootPath := storage.ResolveRoot()
	if strings.ContainsAny(workspace, "/\\") || storage.SafeWithin(rootPath, workspace) == "" {
		return nil, errors.New("invalid workspace")
	}
	if err := os.MkdirAll(rootPath, 0o755); err != nil {
		return nil, err
	}
	root, err := os.OpenRoot(rootPath)
	if err != nil {
		return nil, err
	}
	defer root.Close()
	if err := root.MkdirAll(workspace, 0o755); err != nil {
		return nil, err
	}
	info, err := root.Lstat(workspace)
	if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return nil, errors.New("invalid workspace storage directory")
	}
	return root.OpenRoot(workspace)
}

func saveAssetGridCell(ctx context.Context, root *os.Root, name string, cell image.Image) error {
	fileName := fmt.Sprintf(".%s-%d", name, time.Now().UnixNano())
	file, err := root.OpenFile(fileName, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return err
	}
	defer root.Remove(fileName)
	encodeErr := jpeg.Encode(file, cell, &jpeg.Options{Quality: 96})
	closeErr := file.Close()
	if encodeErr != nil {
		return encodeErr
	}
	if closeErr != nil {
		return closeErr
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	return root.Rename(fileName, name)
}
