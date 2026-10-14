package assistant

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"io"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

const (
	officeMaxEntries = 200
	officeMaxDecoded = 50 * 1024 * 1024
	officeMaxSlides  = 200
)

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
