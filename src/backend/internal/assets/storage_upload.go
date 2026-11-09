package assets

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	"beike.local/cloud/src/backend/internal/platform/storage"
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
)

var dataURLPattern = regexp.MustCompile(`^data:([^;]+);base64,(.+)$`)

const maxStorageUploadBytes = 32 << 20

func storageUploadHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := io.ReadAll(io.LimitReader(r.Body, maxStorageUploadBytes+1))
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "媒体上传至存储失败"})
			return
		}
		if len(raw) > maxStorageUploadBytes {
			httpx.WriteJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"success": false, "error": "上传内容超过 32 MB，请压缩文件后重试"})
			return
		}
		if urls, ok := uploadWithObjectStore(r.Context(), r.Header.Get("Content-Type"), r.Header.Get("x-storage-config"), raw); ok {
			first := ""
			if len(urls) > 0 {
				first = urls[0]
			}
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "url": first, "urls": urls, "count": len(urls)})
			return
		}
		urls, status, message := saveLocalUpload(httpx.WorkspaceFrom(r), r.Header.Get("Content-Type"), raw)
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
			httpx.WriteJSON(w, http.StatusForbidden, map[string]any{"success": false, "error": "需要管理员权限"})
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

func saveLocalUpload(workspace, contentType string, raw []byte) ([]string, int, string) {
	if strings.Contains(contentType, "multipart/form-data") {
		return saveMultipart(workspace, contentType, raw)
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
		path, err := writeDataURL(workspace, item, category)
		if err != nil {
			return nil, http.StatusInternalServerError, "无效的 data URL"
		}
		saved = append(saved, path)
	}
	return saved, 0, ""
}

func saveMultipart(workspace, contentType string, raw []byte) ([]string, int, string) {
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
			mimeType := sniffUploadContentType(file.Header.Get("Content-Type"), file.Filename, body)
			path, err := writeLocalBytes(workspace, body, mimeType, category, storedFilename(mimeType, file.Filename))
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

func writeDataURL(workspace, value, category string) (string, error) {
	mimeType, body, err := parseDataURL(value)
	if err != nil {
		return "", err
	}
	return writeLocalBytes(workspace, body, mimeType, category, "")
}

func parseDataURL(value string) (string, []byte, error) {
	trimmed := strings.TrimSpace(value)
	if match := dataURLPattern.FindStringSubmatch(trimmed); match != nil {
		if body, err := base64.StdEncoding.DecodeString(match[2]); err == nil {
			mimeType := strings.TrimSpace(strings.Split(match[1], ";")[0])
			return sniffUploadContentType(mimeType, "", body), body, nil
		}
	}
	if !strings.HasPrefix(strings.ToLower(trimmed), "data:") {
		return "", nil, os.ErrInvalid
	}
	comma := strings.IndexByte(trimmed, ',')
	if comma <= len("data:") {
		return "", nil, os.ErrInvalid
	}
	meta := trimmed[len("data:"):comma]
	parts := strings.Split(meta, ";")
	hasBase64 := false
	for _, part := range parts[1:] {
		if strings.EqualFold(strings.TrimSpace(part), "base64") {
			hasBase64 = true
			break
		}
	}
	if !hasBase64 {
		return "", nil, os.ErrInvalid
	}
	encoded := strings.Map(func(r rune) rune {
		if r == '\r' || r == '\n' || r == ' ' || r == '\t' {
			return -1
		}
		return r
	}, trimmed[comma+1:])
	if encoded == "" {
		return "", nil, os.ErrInvalid
	}
	body, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		body, err = base64.RawStdEncoding.DecodeString(strings.TrimRight(encoded, "="))
		if err != nil {
			return "", nil, err
		}
	}
	mimeType := strings.TrimSpace(parts[0])
	return sniffUploadContentType(mimeType, "", body), body, nil
}

func sniffUploadContentType(declared, filename string, body []byte) string {
	cleaned := strings.ToLower(strings.TrimSpace(strings.Split(declared, ";")[0]))
	if cleaned != "" && cleaned != "application/octet-stream" {
		return cleaned
	}
	if len(body) > 0 {
		detected := strings.ToLower(strings.TrimSpace(strings.Split(http.DetectContentType(body), ";")[0]))
		if detected != "" && detected != "application/octet-stream" && detected != "text/plain" {
			return detected
		}
	}
	if ext := localExtension("", filename); ext != "" {
		if guessed := mediaContentType("." + ext); guessed != "application/octet-stream" {
			return guessed
		}
	}
	if cleaned != "" {
		return cleaned
	}
	return "image/png"
}

func storedFilename(contentType, originalName string) string {
	return httpx.RequestID() + "." + localExtension(contentType, originalName)
}

func writeLocalBytes(workspace string, body []byte, contentType, category, filename string) (string, error) {
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
	relative := workspaceStorageKey(workspace, storageKey(category, filename))
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
	case "assets", "canvas-library":
		folder = "assets"
	case "refs", "refs/images", "refs/videos", "refs/audio":
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
	case "assets", "canvas-library":
		return "asset"
	case "refs", "refs/images", "refs/videos", "refs/audio":
		return "ref"
	default:
		return "gen_img"
	}
}

func localExtension(contentType, name string) string {
	lower := strings.ToLower(contentType)
	switch {
	case strings.Contains(lower, "jpeg"), strings.Contains(lower, "jpg"):
		return "jpg"
	case strings.Contains(lower, "png"):
		return "png"
	case strings.Contains(lower, "webp"):
		return "webp"
	case strings.Contains(lower, "gif"):
		return "gif"
	case strings.Contains(lower, "avif"):
		return "avif"
	case strings.Contains(lower, "svg"):
		return "svg"
	case strings.Contains(lower, "bmp"):
		return "bmp"
	case strings.Contains(lower, "heic"):
		return "heic"
	case strings.Contains(lower, "heif"):
		return "heif"
	case strings.Contains(lower, "quicktime"):
		return "mov"
	case strings.Contains(lower, "webm"):
		return "webm"
	case strings.Contains(lower, "mp4"):
		return "mp4"
	case strings.Contains(lower, "mpeg"), strings.Contains(lower, "mp3"):
		return "mp3"
	case strings.Contains(lower, "wav"):
		return "wav"
	case strings.Contains(lower, "ogg"):
		return "ogg"
	case strings.Contains(lower, "aac"):
		return "aac"
	case strings.Contains(lower, "flac"):
		return "flac"
	}
	if dot := strings.LastIndex(name, "."); dot >= 0 && dot < len(name)-1 {
		ext := strings.ToLower(strings.TrimSpace(name[dot+1:]))
		if isSafeUploadExt(ext) {
			return ext
		}
	}
	return "png"
}

func isSafeUploadExt(ext string) bool {
	if len(ext) == 0 || len(ext) > 8 {
		return false
	}
	for i := 0; i < len(ext); i++ {
		c := ext[i]
		if !((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) {
			return false
		}
	}
	return true
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

func clearDerivedStorageHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !storageAdmin(cfg, r) {
			httpx.WriteJSON(w, http.StatusForbidden, map[string]any{"success": false, "error": "清理服务缓存需要管理员令牌"})
			return
		}
		cacheRoot := strings.TrimSpace(os.Getenv("AZHUO_CACHE_DIR"))
		if cacheRoot == "" {
			if dataDir := cfg.DataDir(); dataDir != "" {
				cacheRoot = filepath.Join(dataDir, "storage")
			}
		}
		derivedDir := ""
		if cacheRoot != "" {
			derivedDir = filepath.Join(cacheRoot, "derived")
		}
		clearedBytes, clearedFiles := clearDerivedDirectory(derivedDir)
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"success": true, "clearedBytes": clearedBytes, "clearedFileCount": clearedFiles,
			"message": "已清理派生磁盘缓存",
		})
	}
}

func clearDerivedDirectory(dir string) (int, int) {
	if dir == "" {
		return 0, 0
	}
	bytes, files := dirStats(dir)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return bytes, files
	}
	removeDirectoryContents(dir)
	return bytes, files
}

func removeDirectoryContents(dir string) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	for _, entry := range entries {
		full := filepath.Join(dir, entry.Name())
		info, err := os.Lstat(full)
		if err != nil {
			continue
		}
		if info.IsDir() {
			removeDirectoryContents(full)
			_ = os.Remove(full)
			continue
		}
		_ = os.Remove(full)
	}
}

func storageStatsHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		dataDir := cfg.DataDir()
		cacheRoot := strings.TrimSpace(os.Getenv("AZHUO_CACHE_DIR"))
		if cacheRoot == "" && dataDir != "" {
			cacheRoot = filepath.Join(dataDir, "storage")
		}
		dbPath := cfg.SQLiteFile()
		if dbPath == "" && dataDir != "" {
			dbPath = filepath.Join(dataDir, "azhuo.db")
		}
		storageDir := cacheRoot
		if storageDir == "" && dataDir != "" {
			storageDir = filepath.Join(dataDir, "storage")
		}
		derivedDir := ""
		if storageDir != "" {
			derivedDir = filepath.Join(storageDir, "derived")
		}
		dbBytes := 0
		dbReadable := false
		if info, err := os.Stat(dbPath); err == nil && !info.IsDir() {
			dbBytes = int(info.Size())
			dbReadable = true
		}
		counts := database.RecordCounts{}
		if dbReadable {
			if loaded, err := database.CountRecords(dbPath, httpx.WorkspaceFrom(r)); err == nil {
				counts = loaded
			}
		}
		storageBytes, storageFiles := dirStats(storageDir)
		derivedBytes, derivedFiles := dirStats(derivedDir)
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"success":        true,
			"imageTaskCount": counts.ImageTaskCount, "productCount": counts.ProductCount,
			"sceneCount": counts.SceneCount, "outfitCount": counts.OutfitCount,
			"actionCount": counts.ActionCount, "personaCount": counts.PersonaCount,
			"styleRecipeCount": counts.StyleRecipeCount, "assistantThreadCount": counts.AssistantThreadCount,
			"promptRecordCount": counts.PromptRecordCount,
			"promptAssetsTotal": counts.SceneCount + counts.OutfitCount + counts.ActionCount + counts.PersonaCount,
			"dbBytes":           dbBytes, "dbPath": dbPath, "dbReadable": dbReadable,
			"storageDirBytes": storageBytes, "storageFileCount": storageFiles,
			"derivedDirBytes": derivedBytes, "derivedFileCount": derivedFiles,
			"cacheRoot": cacheRoot, "dataDir": dataDir,
		})
	}
}

func dirStats(dir string) (int, int) {
	if dir == "" {
		return 0, 0
	}
	bytes := 0
	files := 0
	_ = filepath.WalkDir(dir, func(path string, entry os.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return nil
		}
		info, statErr := entry.Info()
		if statErr != nil {
			return nil
		}
		files++
		bytes += int(info.Size())
		return nil
	})
	return bytes, files
}
