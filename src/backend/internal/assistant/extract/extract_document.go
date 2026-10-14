package extract

import (
	"bytes"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"regexp"
	"strings"
	"unicode/utf16"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

const (
	documentMaxBytes = 15 * 1024 * 1024
	documentReadMax  = documentMaxBytes + 1024*1024
	documentMaxChars = 80000
)

var (
	documentExt = regexp.MustCompile(`\.([a-z0-9]+)$`)
	textExts    = map[string]bool{"txt": true, "md": true, "csv": true, "json": true}
	binaryExts  = map[string]bool{"xls": true}
	allowedExts = map[string]bool{
		"pdf": true, "docx": true, "pptx": true, "txt": true, "md": true, "csv": true,
		"json": true, "doc": true, "ppt": true, "xlsx": true, "xls": true,
	}
)

func ExtractDocument(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = cfg
		body, err := io.ReadAll(io.LimitReader(r.Body, documentReadMax+1))
		if err != nil || len(body) > documentReadMax {
			httpx.WriteJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"success": false, "error": "文件过大或内容为空，请控制在 15MB 以内"})
			return
		}
		if len(body) == 0 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "文件过大或内容为空，请控制在 15MB 以内"})
			return
		}
		file, ok := documentFile(r.Header.Get("Content-Type"), body)
		if !ok {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "缺少文件 file"})
			return
		}
		if len(file.data) > documentMaxBytes {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "文件过大，请控制在 15MB 以内"})
			return
		}
		name := file.name
		if name == "" {
			name = "document"
		}
		ext := documentExtension(name)
		if !allowedExts[ext] {
			shown := ext
			if shown == "" {
				shown = "?"
			}
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "不支持的格式 ." + shown + "，请上传 pdf / docx / pptx / xlsx / txt / md / csv / json"})
			return
		}
		if ext == "doc" || ext == "ppt" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "暂不支持旧版 ." + ext + "，请另存为 ." + ext + "x 后上传"})
			return
		}
		var text string
		var truncated bool
		if ext == "docx" || ext == "pptx" || ext == "xlsx" || ext == "pdf" {
			var extracted string
			var status int
			var message string
			switch ext {
			case "xlsx":
				extracted, status, message = spreadsheetText(file.data)
			case "pdf":
				extracted, status, message = pdfText(file.data)
			default:
				extracted, status, message = officeText(ext, file.data)
			}
			if message != "" {
				httpx.WriteJSON(w, status, map[string]any{"success": false, "error": message})
				return
			}
			text, truncated = truncateDocument(extracted)
		} else if ext == "xls" && (!isOLEFile(file.data) || oleObviouslyBroken(file.data)) {
			httpx.WriteJSON(w, http.StatusUnprocessableEntity, map[string]any{"success": false, "error": "旧版 .xls 解析失败，请另存为 .xlsx 后再上传"})
			return
		} else if binaryExts[ext] {
			extracted, status, message := xlsText(file.data)
			if message != "" {
				httpx.WriteJSON(w, status, map[string]any{"success": false, "error": message})
				return
			}
			text, truncated = truncateDocument(extracted)
		} else {
			text, truncated = truncateDocument(strings.ToValidUTF8(string(file.data), "\uFFFD"))
		}
		if text == "" {
			httpx.WriteJSON(w, http.StatusUnprocessableEntity, map[string]any{"success": false, "error": "未能从文件中提取到可读文本"})
			return
		}
		mimeType := file.mime
		if mimeType == "" {
			mimeType = "application/" + ext
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"success": true, "text": text, "name": name, "mime": mimeType, "size": len(file.data), "truncated": truncated,
		})
	})
}

type uploadedDocument struct {
	name string
	mime string
	data []byte
}

func documentFile(contentType string, body []byte) (uploadedDocument, bool) {
	mediaType, params, err := mime.ParseMediaType(contentType)
	if err != nil || !strings.HasPrefix(mediaType, "multipart/") || params["boundary"] == "" {
		return uploadedDocument{}, false
	}
	reader := multipart.NewReader(bytes.NewReader(body), params["boundary"])
	for {
		part, err := reader.NextPart()
		if err != nil {
			return uploadedDocument{}, false
		}
		if part.FormName() != "file" {
			continue
		}
		data, err := io.ReadAll(io.LimitReader(part, documentMaxBytes+1))
		if err != nil {
			return uploadedDocument{}, false
		}
		return uploadedDocument{name: part.FileName(), mime: part.Header.Get("Content-Type"), data: data}, true
	}
}

func isOLEFile(data []byte) bool {
	return len(data) >= 4 && data[0] == 0xD0 && data[1] == 0xCF && data[2] == 0x11 && data[3] == 0xE0
}

func documentExtension(name string) string {
	match := documentExt.FindStringSubmatch(strings.ToLower(name))
	if match == nil {
		return ""
	}
	return match[1]
}

func truncateDocument(text string) (string, bool) {
	cleaned := strings.TrimSpace(strings.ReplaceAll(text, "\x00", ""))
	units := utf16.Encode([]rune(cleaned))
	if len(units) <= documentMaxChars {
		return cleaned, false
	}
	return "【已截断：原文约 " + itoa(len(units)) + " 字，仅保留前 80000 字】\n\n" + string(utf16.Decode(units[:documentMaxChars])), true
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
