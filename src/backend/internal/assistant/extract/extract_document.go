package extract

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"errors"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode/utf16"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"github.com/ledongthuc/pdf"
	"github.com/richardlehane/mscfb"
)

const (
	documentMaxBytes = 15 * 1024 * 1024
	documentReadMax  = documentMaxBytes + 1024*1024
	documentMaxChars = 80000
	pdfPageLimit     = 200
	officeMaxEntries = 200
	officeMaxDecoded = 50 * 1024 * 1024
	officeMaxSlides  = 200
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

// Real OLE workbooks still go to Node. Only containers that cannot be a
// compound file, or that declare an illegal sector size or FAT overflow,
// match the Node .xls failure text.
func oleObviouslyBroken(data []byte) bool {
	if len(data) < 512 {
		return true
	}
	_, err := mscfb.New(bytes.NewReader(data))
	if err == nil {
		return false
	}
	var format mscfb.Error
	if !errors.As(err, &format) || format.Typ() != mscfb.ErrFormat {
		return false
	}
	message := format.Error()
	return strings.Contains(message, "bad signature") ||
		strings.Contains(message, "illegal sector size") ||
		strings.Contains(message, "overflow") ||
		strings.Contains(message, "exceeds")
}

func pdfText(data []byte) (string, int, string) {
	reader, err := pdf.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return "", 422, "文档解析失败，请检查格式后重试"
	}
	if reader.NumPage() > pdfPageLimit {
		return "", 413, "PDF 页数过多（>200）"
	}
	parts := make([]string, 0, reader.NumPage())
	for page := 1; page <= reader.NumPage(); page++ {
		text, err := reader.Page(page).GetPlainText(nil)
		if err != nil {
			return "", 422, "文档解析失败，请检查格式后重试"
		}
		text = strings.TrimSpace(text)
		if text != "" {
			parts = append(parts, text)
		}
	}
	return strings.Join(parts, "\n"), 0, ""
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

func inspectOfficeZip(data []byte) (int, string) {
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return 422, "文档解析失败，请检查格式后重试"
	}
	if len(reader.File) > officeMaxEntries {
		return 413, "压缩包条目过多（>200）"
	}
	var declared uint64
	for _, file := range reader.File {
		if file.FileInfo().IsDir() {
			continue
		}
		declared += file.UncompressedSize64
		if declared > officeMaxDecoded {
			return 413, "解压后体积过大"
		}
	}
	return 0, ""
}

func officeText(ext string, data []byte) (string, int, string) {
	if status, message := inspectOfficeZip(data); message != "" {
		return "", status, message
	}
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return "", 422, "文档解析失败，请检查格式后重试"
	}
	if ext == "pptx" {
		text, status, message := pptxText(reader)
		return text, status, message
	}
	text, status, message := docxText(reader)
	return text, status, message
}

func docxText(reader *zip.Reader) (string, int, string) {
	file := zipFile(reader, "word/document.xml")
	if file == nil {
		return "", 422, "文档解析失败，请检查格式后重试"
	}
	xmlBytes, status, message := readZipFile(file)
	if message != "" {
		return "", status, message
	}
	return wordParagraphs(xmlBytes), 0, ""
}

func pptxText(reader *zip.Reader) (string, int, string) {
	slides := []*zip.File{}
	for _, file := range reader.File {
		if regexp.MustCompile(`(?i)^ppt/slides/slide\d+\.xml$`).MatchString(file.Name) {
			slides = append(slides, file)
		}
	}
	sort.Slice(slides, func(i, j int) bool { return slideNumber(slides[i].Name) < slideNumber(slides[j].Name) })
	if len(slides) > officeMaxSlides {
		slides = slides[:officeMaxSlides]
	}
	parts := []string{}
	decoded := 0
	for _, file := range slides {
		xmlBytes, status, message := readZipFile(file)
		decoded += len(xmlBytes)
		if decoded > officeMaxDecoded {
			return "", 413, "解压后体积过大"
		}
		if message != "" {
			return "", status, message
		}
		text := stripOfficeTags(string(xmlBytes))
		if text == "" {
			continue
		}
		parts = append(parts, "--- 幻灯片 "+strconv.Itoa(slideNumber(file.Name))+" ---\n"+text)
	}
	return strings.Join(parts, "\n\n"), 0, ""
}

func wordParagraphs(xmlBytes []byte) string {
	decoder := xml.NewDecoder(bytes.NewReader(xmlBytes))
	paragraphs := []string{}
	var current strings.Builder
	inText := false
	for {
		token, err := decoder.Token()
		if err != nil {
			break
		}
		switch node := token.(type) {
		case xml.StartElement:
			switch node.Name.Local {
			case "t":
				inText = true
			case "tab":
				current.WriteByte('\t')
			case "br", "cr":
				current.WriteByte('\n')
			}
		case xml.EndElement:
			switch node.Name.Local {
			case "t":
				inText = false
			case "p":
				paragraphs = append(paragraphs, current.String())
				current.Reset()
			}
		case xml.CharData:
			if inText {
				current.Write(node)
			}
		}
	}
	if current.Len() > 0 {
		paragraphs = append(paragraphs, current.String())
	}
	kept := []string{}
	for _, paragraph := range paragraphs {
		if strings.TrimSpace(paragraph) != "" {
			kept = append(kept, paragraph)
		}
	}
	return strings.Join(kept, "\n")
}

func stripOfficeTags(xmlText string) string {
	without := regexp.MustCompile(`(?i)<a:t[^>]*>`).ReplaceAllString(xmlText, "")
	without = regexp.MustCompile(`(?i)</a:t>`).ReplaceAllString(without, " ")
	without = regexp.MustCompile(`<[^>]+>`).ReplaceAllString(without, " ")
	replacer := strings.NewReplacer("&amp;", "&", "&lt;", "<", "&gt;", ">", "&quot;", `"`, "&#39;", "'")
	without = replacer.Replace(without)
	return strings.TrimSpace(regexp.MustCompile(`\s+`).ReplaceAllString(without, " "))
}

func zipFile(reader *zip.Reader, name string) *zip.File {
	for _, file := range reader.File {
		if file.Name == name {
			return file
		}
	}
	return nil
}

func readZipFile(file *zip.File) ([]byte, int, string) {
	if file.UncompressedSize64 > officeMaxDecoded {
		return nil, 413, "解压后体积过大"
	}
	body, err := file.Open()
	if err != nil {
		return nil, 422, "文档解析失败，请检查格式后重试"
	}
	defer body.Close()
	data, err := io.ReadAll(io.LimitReader(body, officeMaxDecoded+1))
	if err != nil {
		return nil, 422, "文档解析失败，请检查格式后重试"
	}
	if len(data) > officeMaxDecoded {
		return nil, 413, "解压后体积过大"
	}
	return data, 0, ""
}

func slideNumber(name string) int {
	match := regexp.MustCompile(`(?i)slide(\d+)`).FindStringSubmatch(name)
	if match == nil {
		return 0
	}
	number, _ := strconv.Atoi(match[1])
	return number
}
