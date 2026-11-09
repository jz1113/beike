// Package sales provides product image text extraction for the sales workspace.
package sales

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/media"
	"beike.local/cloud/src/backend/internal/platform/network"
	"beike.local/cloud/src/backend/internal/platform/storage"
	_ "golang.org/x/image/webp"
)

const engineRevision = "rapidocr-1.4.4-tiles-v1"

var ocrSlot = make(chan struct{}, 1)

type ocrLine struct {
	Box        [4][2]float64 `json:"box"`
	Text       string        `json:"text"`
	Confidence float64       `json:"confidence"`
}
type ocrResult struct {
	Engine string    `json:"engine"`
	Width  int       `json:"width"`
	Height int       `json:"height"`
	Lines  []ocrLine `json:"lines"`
	Text   string    `json:"text"`
	Cached bool      `json:"cached"`
}
type recognizer func(context.Context, []byte) (ocrResult, error)

func OCR(cfg config.Config) http.HandlerFunc {
	return ocrHandler(cfg, func(ctx context.Context, data []byte) (ocrResult, error) { return runOCR(ctx, cfg, data) })
}

func ocrHandler(cfg config.Config, run recognizer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		fail := func(status int, message string) {
			httpx.WriteJSON(w, status, map[string]any{"success": false, "error": message})
		}
		var body struct {
			ImageURL string `json:"imageUrl"`
			Force    bool   `json:"force"`
		}
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10))
		if err := decoder.Decode(&body); err != nil || strings.TrimSpace(body.ImageURL) == "" || len(body.ImageURL) > 8192 {
			fail(400, "请选择一张可用商品图片")
			return
		}
		if err := decoder.Decode(new(any)); err != io.EOF {
			fail(400, "请求体必须是单个 JSON 对象")
			return
		}
		select {
		case ocrSlot <- struct{}{}:
			defer func() { <-ocrSlot }()
		default:
			fail(429, "文字识别正在进行，请稍后重试")
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 120*time.Second)
		defer cancel()
		workspace := httpx.WorkspaceFrom(r)
		data, err := readOriginal(ctx, body.ImageURL, workspace)
		if err != nil {
			fail(400, "原图读取失败："+err.Error())
			return
		}
		cachePath := ocrCachePath(cfg, workspace, data)
		if !body.Force {
			if cached, ok := readOCRCache(cachePath); ok {
				httpx.WriteJSON(w, 200, map[string]any{"success": true, "result": cached})
				return
			}
		}
		result, err := run(ctx, data)
		if err != nil {
			log.Printf("[sales-ocr] %v", err)
			switch {
			case errors.Is(err, errRuntimeMissing):
				fail(503, "文字识别环境尚未就绪，请先完成服务端 OCR 环境安装")
			case ctx.Err() != nil:
				fail(504, "文字识别已取消或超时，请裁剪图片后重试")
			default:
				fail(422, "文字识别失败，请确认原图有效，或裁剪图片后重试")
			}
			return
		}
		writeOCRCache(cachePath, result)
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "result": result})
	}
}

func ocrCachePath(cfg config.Config, workspace string, data []byte) string {
	scope := sha256.Sum256([]byte(workspace))
	hash := sha256.New()
	hash.Write([]byte(engineRevision))
	hash.Write(data)
	return filepath.Join(ocrDataDir(cfg), "ocr-cache", hex.EncodeToString(scope[:]), hex.EncodeToString(hash.Sum(nil))+".json")
}

func readOCRCache(file string) (ocrResult, bool) {
	var result ocrResult
	stat, err := os.Stat(file)
	if err != nil || stat.Size() > 4<<20 || time.Since(stat.ModTime()) > 7*24*time.Hour {
		return result, false
	}
	data, err := os.ReadFile(file)
	if err != nil || json.Unmarshal(data, &result) != nil || result.Engine != engineRevision || result.Lines == nil {
		return result, false
	}
	result.Cached = true
	return result, true
}

func writeOCRCache(file string, result ocrResult) {
	directory := filepath.Dir(file)
	if os.MkdirAll(directory, 0700) != nil {
		return
	}
	data, err := json.Marshal(result)
	if err != nil {
		return
	}
	// A failed cache write never prevents returning the successful recognition.
	temp, err := os.CreateTemp(directory, ".ocr-*")
	if err != nil {
		return
	}
	defer os.Remove(temp.Name())
	_, err = temp.Write(data)
	closeErr := temp.Close()
	if err != nil || closeErr != nil || os.Rename(temp.Name(), file) != nil {
		return
	}
	entries, _ := os.ReadDir(directory)
	type item struct {
		path     string
		modified time.Time
	}
	files := make([]item, 0, len(entries))
	for _, entry := range entries {
		if filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		if info, err := entry.Info(); err == nil {
			files = append(files, item{filepath.Join(directory, entry.Name()), info.ModTime()})
		}
	}
	sort.Slice(files, func(i, j int) bool { return files[i].modified.After(files[j].modified) })
	for index, entry := range files {
		if index >= 200 || time.Since(entry.modified) > 7*24*time.Hour {
			_ = os.Remove(entry.path)
		}
	}
}

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

var errRuntimeMissing = errors.New("OCR runtime missing; run pnpm setup:ocr")

func ocrDataDir(cfg config.Config) string {
	if dir := cfg.DataDir(); dir != "" {
		return dir
	}
	home, _ := os.UserHomeDir()
	switch runtime.GOOS {
	case "darwin":
		return filepath.Join(home, "Library", "Application Support", "com.azhuo.workbench")
	case "windows":
		return filepath.Join(os.Getenv("APPDATA"), "com.azhuo.workbench")
	default:
		return filepath.Join(home, ".local", "share", "com.azhuo.workbench")
	}
}

// limitedBuffer keeps third-party diagnostics and subprocess output bounded.
type limitedBuffer struct {
	bytes.Buffer
	limit int
}

func (b *limitedBuffer) Write(p []byte) (int, error) {
	if b.Len()+len(p) > b.limit {
		return 0, errors.New("OCR output limit exceeded")
	}
	return b.Buffer.Write(p)
}

func runOCR(ctx context.Context, cfg config.Config, data []byte) (ocrResult, error) {
	python := strings.TrimSpace(os.Getenv("OCR_PYTHON"))
	if python == "" {
		suffix := filepath.Join("bin", "python")
		if runtime.GOOS == "windows" {
			suffix = filepath.Join("Scripts", "python.exe")
		}
		python = filepath.Join(ocrDataDir(cfg), "ocr-runtime", suffix)
	}
	script := filepath.Join(cfg.Root, "tools", "scripts", "ocr", "recognize.py")
	if _, err := exec.LookPath(python); err != nil {
		return ocrResult{}, errRuntimeMissing
	}
	command := exec.CommandContext(ctx, python, script)
	command.Stdin = bytes.NewReader(data)
	output, diagnostics := &limitedBuffer{limit: 4 << 20}, &limitedBuffer{limit: 16 << 10}
	command.Stdout, command.Stderr = output, diagnostics
	if err := command.Run(); err != nil {
		if strings.Contains(diagnostics.String(), "ModuleNotFoundError") {
			return ocrResult{}, errRuntimeMissing
		}
		return ocrResult{}, fmt.Errorf("OCR: %w: %s", err, diagnostics.String())
	}
	var result ocrResult
	if err := json.Unmarshal(output.Bytes(), &result); err != nil {
		return result, err
	}
	if result.Engine != engineRevision || result.Width <= 0 || result.Height <= 0 || result.Lines == nil {
		return result, errors.New("invalid OCR response")
	}
	return result, nil
}
