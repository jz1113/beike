package generate

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"unicode/utf8"

	"errors"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/storage"
)

const exportRequestLimit = 36 << 20

var errNotImage = errors.New("not image")

func ExportZip(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, exportRequestLimit+1))
		if err != nil || len(body) == 0 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "导出请求为空"})
			return
		}
		if len(body) > exportRequestLimit {
			httpx.WriteJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"success": false, "error": "导出请求超过 36 MB，请将内嵌媒体保存为链接后重试"})
			return
		}
		var payload map[string]any
		if json.Unmarshal(body, &payload) != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求格式不正确"})
			return
		}
		if metadataSize, ok := exportMetadataBytes(payload); ok && metadataSize > 4*1024*1024 {
			httpx.WriteJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"success": false, "error": "分卷文案超过 4 MB，请减少每卷条目数量"})
			return
		}
		if offlineMatrixNeedsUpstream(payload) {
			if shots, ok := matrixShotCount(payload); ok && shots > 500 {
				httpx.WriteJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"success": false, "error": "一次最多导出 500 个媒体文件，请分批导出"})
				return
			}
			name, files, message, status := buildTextMatrix(cfg, r, payload)
			if message != "" {
				httpx.WriteJSON(w, status, map[string]any{"success": false, "error": message})
				return
			}
			if files == nil {
				httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求格式不正确"})
				return
			}
			writeExportArchive(w, name, files)
			return
		}
		name, files, message, status := buildExportEntries(cfg, r, payload)
		if message != "" {
			httpx.WriteJSON(w, status, map[string]any{"success": false, "error": message})
			return
		}
		writeExportArchive(w, name, files)
	})
}

func writeExportArchive(w http.ResponseWriter, name string, files map[string][]byte) {
	archive := &bytes.Buffer{}
	writer := zip.NewWriter(archive)
	for path, content := range files {
		entry, err := writer.Create(path)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "导出 ZIP 压缩包失败"})
			return
		}
		if _, err := entry.Write(content); err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "导出 ZIP 压缩包失败"})
			return
		}
	}
	if err := writer.Close(); err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "导出 ZIP 压缩包失败"})
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="`+url.QueryEscape(name)+`.zip"; filename*=UTF-8''`+url.QueryEscape(name+".zip"))
	w.Header().Set("Content-Length", itoa(archive.Len()))
	w.Header().Set("Access-Control-Expose-Headers", "Content-Disposition, Content-Length")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(archive.Bytes())
}

func buildExportEntries(cfg config.Config, r *http.Request, payload map[string]any) (string, map[string][]byte, string, int) {
	files := map[string][]byte{}
	products, _ := payload["products"].([]any)
	if len(products) > 0 {
		title, _ := payload["batchTitle"].(string)
		root := sanitizeExportName(title, "全渠道批量采集成果")
		seen := map[string]struct{}{}
		count := 0
		var items []matrixSummaryItem
		var manifest []exportManifestRow
		for index, item := range products {
			product, ok := item.(map[string]any)
			if !ok {
				continue
			}
			current, _ := product["currentName"].(string)
			if current == "" {
				current = itoa(index + 1)
			}
			folder := sanitizeExportName(current, itoa(index+1))
			base := folder
			for suffix := 2; ; suffix++ {
				if _, exists := seen[strings.ToLower(folder)]; !exists {
					break
				}
				folder = base + "_" + itoa(suffix)
			}
			seen[strings.ToLower(folder)] = struct{}{}
			copy := copywritingText(product)
			if copy != "" {
				files[root+"/"+folder+"/小红书种草文案.txt"] = []byte(copy)
			}
			added, batch, message, status := addMedia(cfg, r, files, root+"/"+folder, mediaList(product["images"]), videoList(product))
			if message != "" {
				return "", nil, message, status
			}
			count += added
			items = append(items, batch...)
			manifest = append(manifest, exportManifestRow{
				name: folder, title: manifestTitle(product), link: exportString(product, "sourceUrl"), cover: manifestCover(product),
			})
		}
		if count == 0 {
			message, status := exportNothingPacked(len(items))
			return "", nil, message, status
		}
		if count > 500 {
			return "", nil, "一次最多导出 500 个媒体文件，请分批导出", http.StatusRequestEntityTooLarge
		}
		writeExportReport(files, items, count)
		if sheet, err := exportManifest(manifest); err == nil {
			files[root+"/采集清单.xlsx"] = sheet
		}
		return root, files, "", 0
	}
	name, _ := payload["folderName"].(string)
	if name == "" {
		name, _ = payload["currentName"].(string)
	}
	root := sanitizeExportName(name, "1")
	copy := copywritingText(payload)
	if copy != "" {
		files[root+"/小红书种草文案.txt"] = []byte(copy)
	}
	added, items, message, status := addMedia(cfg, r, files, root, mediaList(payload["images"]), videoList(payload))
	if message != "" {
		return "", nil, message, status
	}
	if added == 0 {
		message, status = exportNothingPacked(len(items))
		return "", nil, message, status
	}
	if added > 500 {
		return "", nil, "一次最多导出 500 个媒体文件，请分批导出", http.StatusRequestEntityTooLarge
	}
	writeExportReport(files, items, added)
	if sheet, err := exportManifest([]exportManifestRow{{
		name: root, title: manifestTitle(payload), link: exportString(payload, "sourceUrl"), cover: manifestCover(payload),
	}}); err == nil {
		files[root+"/采集清单.xlsx"] = sheet
	}
	return root, files, "", 0
}

func addMedia(cfg config.Config, r *http.Request, files map[string][]byte, folder string, images []string, videos []string) (int, []matrixSummaryItem, string, int) {
	count := 0
	var items []matrixSummaryItem
	record := func(number int, raw string, video bool) {
		body, ext, err := readExportMedia(cfg, r, raw, video)
		requested := itoa(number) + "." + exportMediaExt(raw, video)
		if err == nil && len(body) > 0 && !video {
			if sniffed, ok := sniffedImageExt(body); ok {
				ext = sniffed
			} else {
				err = errNotImage
			}
		}
		if err != nil || len(body) == 0 {
			note := requested + ".error.txt"
			reason := matrixFailureReason(raw, err)
			if err == errNotImage {
				reason = "下载内容不是有效图片或视频文件"
			}
			files[folder+"/"+note] = []byte(reason + "\n原始URL: " + matrixFailureSource(raw))
			items = append(items, matrixSummaryItem{Filename: note, Status: "failure", Error: reason})
			return
		}
		name := itoa(number) + "." + ext
		files[folder+"/"+name] = body
		items = append(items, matrixSummaryItem{Filename: name, Status: "success"})
		count++
	}
	for index, raw := range images {
		record(index+1, raw, false)
	}
	for index, raw := range videos {
		record(len(images)+index+1, raw, true)
	}
	return count, items, "", 0
}

func exportMediaExt(raw string, video bool) string {
	if comma := strings.Index(raw, ","); strings.HasPrefix(raw, "data:") && comma > 0 {
		mimeType := strings.ToLower(raw[:comma])
		switch {
		case strings.Contains(mimeType, "png"):
			return "png"
		case strings.Contains(mimeType, "webp"):
			return "webp"
		case strings.Contains(mimeType, "gif"):
			return "gif"
		case strings.Contains(mimeType, "quicktime"):
			return "mov"
		case strings.Contains(mimeType, "webm"):
			return "webm"
		case strings.Contains(mimeType, "mp4"):
			return "mp4"
		}
	}
	if video {
		return "mp4"
	}
	return "jpg"
}

func writeExportReport(files map[string][]byte, items []matrixSummaryItem, succeeded int) {
	failed := len(items) - succeeded
	files["导出结果.txt"] = []byte("下载成功：" + itoa(succeeded) + " 项\n下载失败：" + itoa(failed) + " 项")
	if failed == 0 {
		return
	}
	summary, err := json.MarshalIndent(matrixSummary{Total: len(items), Succeeded: succeeded, Failed: failed, Items: items, Partial: true}, "", "  ")
	if err != nil {
		return
	}
	files["export-summary.json"] = summary
}

func exportNothingPacked(attempted int) (string, int) {
	if attempted == 0 {
		return "没有可打包的图片或视频素材", http.StatusBadRequest
	}
	return "所有媒体文件均未能下载，请检查文件地址后重试", http.StatusBadGateway
}

func readExportMedia(cfg config.Config, r *http.Request, raw string, video bool) ([]byte, string, error) {
	if strings.HasPrefix(raw, "blob:") {
		return nil, "", errors.New("浏览器临时媒体需要先保存到媒体库再打包")
	}
	if strings.HasPrefix(raw, "data:") {
		comma := strings.Index(raw, ",")
		if comma < 0 {
			return nil, "", os.ErrInvalid
		}
		body, err := base64.StdEncoding.DecodeString(raw[comma+1:])
		if err != nil {
			return nil, "", err
		}
		ext := "jpg"
		if strings.Contains(raw[:comma], "png") {
			ext = "png"
		}
		if video {
			ext = "mp4"
		}
		return body, ext, nil
	}
	if strings.HasPrefix(raw, "/storage/") {
		rel := strings.TrimPrefix(raw, "/storage/")
		path := storage.StoredFile(rel)
		if path == "" {
			path = storage.SafeWithin(storage.ResolveRoot(), rel)
		}
		body, err := os.ReadFile(path)
		if err != nil {
			return nil, "", err
		}
		return body, exportExt(rel, video), nil
	}
	return fetchRemoteExport(cfg, r, raw, video)
}

func mediaList(value any) []string {
	items, _ := value.([]any)
	out := []string{}
	for _, item := range items {
		switch typed := item.(type) {
		case string:
			if strings.TrimSpace(typed) != "" {
				out = append(out, strings.TrimSpace(typed))
			}
		case map[string]any:
			if text, ok := typed["url"].(string); ok && strings.TrimSpace(text) != "" {
				out = append(out, strings.TrimSpace(text))
			}
		}
	}
	return out
}

func videoList(payload map[string]any) []string {
	out := []string{}
	if list, ok := payload["videos"].([]any); ok {
		for _, item := range list {
			if text, ok := item.(string); ok && strings.TrimSpace(text) != "" {
				out = append(out, strings.TrimSpace(text))
			}
		}
	}
	for _, key := range []string{"video", "videoUrl"} {
		if text, ok := payload[key].(string); ok && strings.TrimSpace(text) != "" {
			out = append(out, strings.TrimSpace(text))
		}
	}
	return out
}

func copywritingText(payload map[string]any) string {
	title, _ := payload["copywritingTitle"].(string)
	if title == "" {
		title, _ = payload["title"].(string)
	}
	content, _ := payload["copywritingContent"].(string)
	lines := []string{}
	if strings.TrimSpace(title) != "" {
		lines = append(lines, "【小红书种草标题】：\n"+strings.TrimSpace(title)+"\n")
	}
	if strings.TrimSpace(content) != "" {
		lines = append(lines, "【小红书买家秀正文】：\n"+strings.TrimSpace(content)+"\n")
	}
	return strings.Join(lines, "\n")
}

var exportUnsafe = regexp.MustCompile(`[\x00-\x1f\\/:*?"<>|]+`)

func sanitizeExportName(name, fallback string) string {
	name = strings.TrimSpace(exportUnsafe.ReplaceAllString(name, "_"))
	name = strings.Trim(name, ". ")
	if name == "" {
		return fallback
	}
	for len(name) > 0 && utf8.RuneCountInString(name) > 0 && len([]byte(name)) > 200 {
		_, size := utf8.DecodeLastRuneInString(name)
		name = name[:len(name)-size]
	}
	return strings.Trim(name, ". ")
}

func exportExt(path string, video bool) string {
	lower := strings.ToLower(path)
	for _, ext := range []string{"png", "webp", "gif", "jpg", "jpeg", "mp4", "mov", "webm"} {
		if strings.HasSuffix(lower, "."+ext) {
			if ext == "jpeg" {
				return "jpg"
			}
			return ext
		}
	}
	if video {
		return "mp4"
	}
	return "jpg"
}

func itoa(value int) string {
	if value == 0 {
		return "0"
	}
	digits := []byte{}
	for value > 0 {
		digits = append([]byte{byte('0' + value%10)}, digits...)
		value /= 10
	}
	return string(digits)
}
