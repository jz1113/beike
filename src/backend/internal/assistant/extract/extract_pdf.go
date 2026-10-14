package extract

import (
	"bytes"
	"strings"

	"github.com/ledongthuc/pdf"
)

const pdfPageLimit = 200

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
