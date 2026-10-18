package assets

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/storage"
)

var dataURLPattern = regexp.MustCompile(`^data:([^;]+);base64,(.+)$`)

func storageUploadHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := io.ReadAll(io.LimitReader(r.Body, 32<<20))
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "媒体上传至存储失败"})
			return
		}
		if urls, ok := uploadWithObjectStore(r.Context(), r.Header.Get("Content-Type"), raw); ok {
			first := ""
			if len(urls) > 0 {
				first = urls[0]
			}
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "url": first, "urls": urls, "count": len(urls)})
			return
		}
		urls, status, message := saveLocalUpload(r.Header.Get("Content-Type"), raw)
		if status != 0 {
			httpx.WriteJSON(w, status, map[string]any{"success": false, "error": message})
			return
		}
		first := ""
		if len(urls) > 0 {
			first = urls[0]
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "url": first, "urls": urls, "count": len(urls)})
	}
}

func storageTestHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !storageAdmin(cfg, r) {
			httpx.WriteJSON(w, http.StatusUnauthorized, map[string]any{"success": false, "error": "需要管理员权限"})
			return
		}
		raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if err != nil || (len(bytes.TrimSpace(raw)) > 0 && !json.Valid(raw)) {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "message": "测试异常: 请求数据格式异常"})
			return
		}
		resolved := probeObjectConfig(storageConfigFromTest(raw))
		if resolved == nil {
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": false, "message": "配置不完整，请填写 Access Key ID、Secret 和 存储桶名称"})
			return
		}
		testURL, err := storage.ProbeObjectStore(r.Context(), *resolved)
		if err != nil {
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": false, "message": fmt.Sprintf("连接失败: %v", err)})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "message": "🎉 存储桶连接与写入权限验证成功！", "testUrl": testURL})
	}
}

func saveLocalUpload(contentType string, raw []byte) ([]string, int, string) {
	if strings.Contains(contentType, "multipart/form-data") {
		return saveMultipart(contentType, raw)
	}
	var payload map[string]any
	if len(bytes.TrimSpace(raw)) > 0 && json.Unmarshal(raw, &payload) != nil {
		return nil, http.StatusInternalServerError, "请求数据格式异常"
	}
	category, _ := payload["category"].(string)
	urls := []string{}
	if text, ok := payload["dataUrl"].(string); ok && text != "" {
		urls = append(urls, text)
	}
	if list, ok := payload["dataUrls"].([]any); ok {
		for _, item := range list {
			if text, ok := item.(string); ok && text != "" {
				urls = append(urls, text)
			}
		}
	}
	if len(urls) == 0 {
		return nil, http.StatusBadRequest, "缺少待上传的 dataUrl 或 dataUrls"
	}
	saved := []string{}
	for _, item := range urls {
		path, err := writeDataURL(item, category)
		if err != nil {
			return nil, http.StatusInternalServerError, "无效的 data URL"
		}
		saved = append(saved, path)
	}
	return saved, 0, ""
}

func saveMultipart(contentType string, raw []byte) ([]string, int, string) {
	_, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		return nil, http.StatusBadRequest, "未接收到待上传的文件"
	}
	reader := multipart.NewReader(bytes.NewReader(raw), params["boundary"])
	form, err := reader.ReadForm(32 << 20)
	if err != nil {
		return nil, http.StatusBadRequest, "未接收到待上传的文件"
	}
	defer form.RemoveAll()
	category := "generated/images"
	if values := form.Value["category"]; len(values) > 0 && values[0] != "" {
		category = values[0]
	}
	if len(form.File) == 0 {
		return nil, http.StatusBadRequest, "未接收到待上传的文件"
	}
	saved := []string{}
	for _, files := range form.File {
		for _, file := range files {
			opened, err := file.Open()
			if err != nil {
				return nil, http.StatusInternalServerError, "媒体上传至存储失败"
			}
			body, err := io.ReadAll(opened)
			opened.Close()
			if err != nil {
				return nil, http.StatusInternalServerError, "媒体上传至存储失败"
			}
			mimeType := file.Header.Get("Content-Type")
			path, err := writeLocalBytes(body, mimeType, category, storedFilename(mimeType, file.Filename))
			if err != nil {
				return nil, http.StatusInternalServerError, "媒体上传至存储失败"
			}
			saved = append(saved, path)
		}
	}
	if len(saved) == 0 {
		return nil, http.StatusBadRequest, "未接收到待上传的文件"
	}
	return saved, 0, ""
}

func writeDataURL(value, category string) (string, error) {
	match := dataURLPattern.FindStringSubmatch(value)
	if match == nil {
		return "", os.ErrInvalid
	}
	body, err := base64.StdEncoding.DecodeString(match[2])
	if err != nil {
		return "", err
	}
	return writeLocalBytes(body, match[1], category, "")
}

func storedFilename(contentType, originalName string) string {
	return httpx.RequestID() + "." + localExtension(contentType, originalName)
}

func writeLocalBytes(body []byte, contentType, category, filename string) (string, error) {
	extension := localExtension(contentType, filename)
	if category == "" {
		category = "generated/images"
		if strings.Contains(contentType, "video") {
			category = "generated/videos"
		}
	}
	if filename == "" {
		filename = "azhuo_" + filePrefix(category) + "_" + time.Now().Format("20060102150405") + "_" + randomSuffix() + "." + extension
	}
	relative := workspaceStorageKey("local", storageKey(category, filename))
	absolute := filepath.Join(storage.ResolveRoot(), relative)
	if err := os.MkdirAll(filepath.Dir(absolute), 0o755); err != nil {
		return "", err
	}
	if err := os.WriteFile(absolute, body, 0o644); err != nil {
		return "", err
	}
	return "/storage/" + relative, nil
}

func storageKey(category, filename string) string {
	folder := "generated/images"
	switch category {
	case "products":
		folder = "products"
	case "external":
		folder = "external"
	case "generated/videos", "videos":
		folder = "generated/videos"
	case "assets":
		folder = "assets"
	case "refs":
		folder = "refs"
	}
	return "azhuo/" + folder + "/" + time.Now().Format("200601") + "/" + filename
}

func filePrefix(category string) string {
	switch category {
	case "products":
		return "prod"
	case "external":
		return "ext"
	case "generated/videos", "videos":
		return "gen_vid"
	case "assets":
		return "asset"
	case "refs":
		return "ref"
	default:
		return "gen_img"
	}
}

func localExtension(contentType, name string) string {
	switch {
	case strings.Contains(contentType, "jpeg"), strings.Contains(contentType, "jpg"):
		return "jpg"
	case strings.Contains(contentType, "webp"):
		return "webp"
	case strings.Contains(contentType, "mp4"):
		return "mp4"
	}
	if dot := strings.LastIndex(name, "."); dot >= 0 {
		return strings.ToLower(name[dot+1:])
	}
	return "png"
}

func workspaceStorageKey(workspace, rel string) string {
	clean := strings.TrimLeft(rel, "/")
	if clean == workspace || strings.HasPrefix(clean, workspace+"/") {
		return clean
	}
	return workspace + "/" + clean
}

func randomSuffix() string {
	return strings.ToLower(time.Now().Format("150405.000000"))
}

func storageConfigFromTest(raw []byte) map[string]any {
	var payload map[string]any
	if json.Unmarshal(raw, &payload) != nil || payload == nil {
		return nil
	}
	if config, ok := payload["config"].(map[string]any); ok {
		return config
	}
	return payload
}

func parseConfig(raw string) map[string]any {
	var config map[string]any
	if json.Unmarshal([]byte(raw), &config) != nil {
		return nil
	}
	return config
}

func storageAdmin(cfg config.Config, r *http.Request) bool {
	if !cfg.Production() {
		return true
	}
	admin := strings.TrimSpace(cfg.AdminToken)
	return httpx.TokenMatches(httpx.RequestToken(r), admin)
}
