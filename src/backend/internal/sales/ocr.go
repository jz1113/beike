// Package sales provides product image text extraction for the sales workspace.
package sales

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
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
