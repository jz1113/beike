package export

import (
	"encoding/json"
	"fmt"
	"net/http"
	"path"
	"strconv"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

// The library and history send named mixed media through the legacy images field.
func serveNamedMediaExport(cfg config.Config, w http.ResponseWriter, r *http.Request, payload map[string]any) bool {
	entries, _ := payload["images"].([]any)
	products, _ := payload["products"].([]any)
	if len(products) > 0 || payload["offlineMatrix"] == true {
		return false
	}
	named := false
	for _, entry := range entries {
		item, _ := entry.(map[string]any)
		if _, ok := item["filename"].(string); ok {
			named = true
			break
		}
	}
	if !named {
		return false
	}
	if len(entries) > 500 {
		httpx.WriteJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"success": false, "error": "一次最多导出 500 个媒体文件，请分批导出"})
		return true
	}
	root := sanitizeExportName(exportString(payload, "folderName"), "素材")
	files := map[string][]byte{}
	used := map[string]bool{}
	summary := matrixSummary{Total: len(entries)}
	totalBytes := 0
	for index, entry := range entries {
		item, _ := entry.(map[string]any)
		raw := strings.TrimSpace(exportString(item, "url"))
		name := sanitizeExportName(exportString(item, "filename"), strconv.Itoa(index+1))
		body, _, err := readExportMedia(cfg, r, raw, true)
		ext := ""
		if err == nil {
			ext, err = namedMediaExtension(body, raw, name)
		}
		limit := 25 << 20
		if strings.Contains("|mp4|mov|webm|mkv|m4v|", "|"+ext+"|") {
			limit = 200 << 20
		} else if strings.Contains("|mp3|wav|m4a|aac|ogg|opus|flac|", "|"+ext+"|") {
			limit = 100 << 20
		}
		if err == nil && len(body) > limit {
			err = fmt.Errorf("媒体文件超过 %d MB 导出上限", limit>>20)
		}
		if err != nil || len(body) == 0 {
			reason := matrixFailureReason(raw, err)
			if err == errNotImage {
				reason = "下载内容不是有效图片、视频或音频文件"
			}
			note := uniqueNamedExport(name+".error.txt", used)
			files[root+"/"+note] = []byte(reason + "\n原始URL: " + matrixFailureSource(raw))
			summary.Items = append(summary.Items, matrixSummaryItem{Filename: note, Status: "failure", Error: reason})
			summary.Failed++
			continue
		}
		totalBytes += len(body)
		if totalBytes > 512<<20 {
			httpx.WriteJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"success": false, "error": "媒体总大小超过 512 MB，请分批导出"})
			return true
		}
		name = strings.TrimSuffix(name, path.Ext(name)) + "." + ext
		name = uniqueNamedExport(name, used)
		files[root+"/"+name] = body
		summary.Items = append(summary.Items, matrixSummaryItem{Filename: name, Status: "success"})
		summary.Succeeded++
	}
	if summary.Succeeded == 0 {
		httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"success": false, "error": "所有媒体文件均未能下载，请检查文件地址后重试"})
		return true
	}
	summary.Partial = summary.Failed > 0
	writeExportReport(files, summary.Items, summary.Succeeded)
	encoded, _ := json.MarshalIndent(summary, "", "  ")
	files["export-summary.json"] = encoded
	for key, value := range map[string]int{"X-Export-Total": summary.Total, "X-Export-Succeeded": summary.Succeeded, "X-Export-Failed": summary.Failed} {
		w.Header().Set(key, strconv.Itoa(value))
	}
	w.Header().Set("X-Export-Partial", strconv.FormatBool(summary.Partial))
	writeExportArchive(w, root, files)
	return true
}

func uniqueNamedExport(name string, used map[string]bool) string {
	base, ext := strings.TrimSuffix(name, path.Ext(name)), path.Ext(name)
	for number, candidate := 1, name; ; number++ {
		if !used[strings.ToLower(candidate)] {
			used[strings.ToLower(candidate)] = true
			return candidate
		}
		candidate = fmt.Sprintf("%s_%d%s", base, number+1, ext)
	}
}

func namedMediaExtension(body []byte, raw, filename string) (string, error) {
	if len(body) == 0 || !mediaBodyAllowed("", raw, body) {
		return "", errNotImage
	}
	if ext, ok := sniffedImageExt(body); ok {
		return ext, nil
	}
	ext := strings.ToLower(strings.TrimPrefix(path.Ext(filename), "."))
	switch http.DetectContentType(body) {
	case "video/mp4":
		if ext == "m4a" || ext == "mov" {
			return ext, nil
		}
		return "mp4", nil
	case "video/webm":
		return "webm", nil
	case "image/bmp":
		return "bmp", nil
	case "audio/mpeg":
		return "mp3", nil
	case "audio/wave", "audio/wav", "audio/x-wav":
		return "wav", nil
	case "application/ogg", "audio/ogg":
		return "ogg", nil
	case "application/pdf":
		return "pdf", nil
	case "text/plain; charset=utf-8":
		if ext == "txt" || ext == "md" {
			return ext, nil
		}
	case "application/octet-stream":
		if strings.HasPrefix(string(body), "fLaC") {
			return "flac", nil
		}
		if len(body) >= 12 && string(body[4:8]) == "ftyp" {
			for brand, extension := range map[string]string{"M4A ": "m4a", "avif": "avif", "avis": "avif", "heic": "heic", "qt  ": "mov"} {
				if string(body[8:12]) == brand {
					return extension, nil
				}
			}
		}
		if len(body) > 2 && body[0] == 0xff && (body[1] == 0xf1 || body[1] == 0xf9) {
			return "aac", nil
		}
	}
	if strings.Contains(string(body[:min(len(body), 512)]), "<svg") {
		return "svg", nil
	}
	return "", errNotImage
}
