package assistant

import (
	"archive/zip"
	"bytes"
	_ "embed"
	"encoding/binary"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"github.com/xuri/excelize/v2"
)

//go:embed testdata/ole.xls
var sampleOLE []byte

func TestExtractPlainDocument(t *testing.T) {
	handler := ExtractDocument(config.Config{Upstream: "http://127.0.0.1:1"})
	body, contentType := documentForm(t, "notes.txt", "text/plain", "第一行\n第二行")
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/assistant/extract-document", body)
	request.Header.Set("Content-Type", contentType)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "第一行") || !strings.Contains(response.Body.String(), `"truncated":false`) {
		t.Fatalf("text %d %s", response.Code, response.Body.String())
	}
	legacy, legacyType := documentForm(t, "old.doc", "application/msword", "binary")
	legacyResponse := httptest.NewRecorder()
	legacyRequest := httptest.NewRequest(http.MethodPost, "/api/assistant/extract-document", legacy)
	legacyRequest.Header.Set("Content-Type", legacyType)
	handler.ServeHTTP(legacyResponse, legacyRequest)
	if legacyResponse.Code != http.StatusBadRequest || !strings.Contains(legacyResponse.Body.String(), "暂不支持旧版 .doc") {
		t.Fatalf("doc %d %s", legacyResponse.Code, legacyResponse.Body.String())
	}
}

func TestExtractOfficeDocuments(t *testing.T) {
	handler := ExtractDocument(config.Config{Upstream: "http://127.0.0.1:1"})
	docx := officeZip(t, map[string]string{
		"word/document.xml": `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>你好世界</w:t></w:r></w:p></w:body></w:document>`,
	})
	body, contentType := documentBytes(t, "note.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", docx)
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/assistant/extract-document", body)
	request.Header.Set("Content-Type", contentType)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "你好世界") {
		t.Fatalf("docx %d %s", response.Code, response.Body.String())
	}
	pptx := officeZip(t, map[string]string{
		"ppt/slides/slide1.xml": `<p:sld><a:t>封面标题</a:t></p:sld>`,
	})
	slideBody, slideType := documentBytes(t, "deck.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation", pptx)
	slide := httptest.NewRecorder()
	slideRequest := httptest.NewRequest(http.MethodPost, "/api/assistant/extract-document", slideBody)
	slideRequest.Header.Set("Content-Type", slideType)
	handler.ServeHTTP(slide, slideRequest)
	if slide.Code != http.StatusOK || !strings.Contains(slide.Body.String(), "幻灯片 1") || !strings.Contains(slide.Body.String(), "封面标题") {
		t.Fatalf("pptx %d %s", slide.Code, slide.Body.String())
	}
	files := map[string]string{}
	for i := 0; i < 201; i++ {
		files["word/extra-"+itoa(i)+".xml"] = "x"
	}
	files["word/document.xml"] = `<w:document><w:p><w:t>不会读到</w:t></w:p></w:document>`
	crowded := officeZip(t, files)
	crowdedBody, crowdedType := documentBytes(t, "big.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", crowded)
	crowdedResponse := httptest.NewRecorder()
	crowdedRequest := httptest.NewRequest(http.MethodPost, "/api/assistant/extract-document", crowdedBody)
	crowdedRequest.Header.Set("Content-Type", crowdedType)
	handler.ServeHTTP(crowdedResponse, crowdedRequest)
	if crowdedResponse.Code != http.StatusRequestEntityTooLarge || !strings.Contains(crowdedResponse.Body.String(), "压缩包条目过多") {
		t.Fatalf("entries %d %s", crowdedResponse.Code, crowdedResponse.Body.String())
	}
}

func TestExtractSpreadsheet(t *testing.T) {
	book := excelize.NewFile()
	if err := book.SetCellValue("Sheet1", "A1", "价格"); err != nil {
		t.Fatal(err)
	}
	if err := book.SetCellValue("Sheet1", "B1", "12"); err != nil {
		t.Fatal(err)
	}
	buffer, err := book.WriteToBuffer()
	if err != nil {
		t.Fatal(err)
	}
	handler := ExtractDocument(config.Config{Upstream: "http://127.0.0.1:1"})
	body, contentType := documentBytes(t, "prices.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer.Bytes())
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/assistant/extract-document", body)
	request.Header.Set("Content-Type", contentType)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "工作表: Sheet1") || !strings.Contains(response.Body.String(), "价格,12") {
		t.Fatalf("xlsx %d %s", response.Code, response.Body.String())
	}
}

func TestExtractOLESpreadsheet(t *testing.T) {
	handler := ExtractDocument(config.Config{Upstream: "http://127.0.0.1:1"})
	check := func(name string, data []byte, status int, fragment string) {
		t.Helper()
		body, contentType := documentBytes(t, name, "application/vnd.ms-excel", data)
		response := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodPost, "/api/assistant/extract-document", body)
		request.Header.Set("Content-Type", contentType)
		handler.ServeHTTP(response, request)
		if response.Code != status || !strings.Contains(response.Body.String(), fragment) {
			t.Fatalf("%s %d %s", name, response.Code, response.Body.String())
		}
	}
	check("empty.xls", nil, http.StatusUnprocessableEntity, "旧版 .xls 解析失败")
	check("short.xls", []byte{0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1}, http.StatusUnprocessableEntity, "旧版 .xls 解析失败")
	check("overflow.xls", oleFatOverflow(), http.StatusUnprocessableEntity, "旧版 .xls 解析失败")
	check("book.xls", sampleOLE, http.StatusOK, "Lorem")
}

func oleFatOverflow() []byte {
	data := make([]byte, 512)
	copy(data, []byte{0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1})
	binary.LittleEndian.PutUint16(data[26:28], 3)
	binary.LittleEndian.PutUint16(data[30:32], 9)
	binary.LittleEndian.PutUint32(data[44:48], 1)
	binary.LittleEndian.PutUint32(data[72:76], 10)
	return data
}

func TestExtractPDF(t *testing.T) {
	handler := ExtractDocument(config.Config{Upstream: "http://127.0.0.1:1"})
	body, contentType := documentBytes(t, "note.pdf", "application/pdf", simplePDF([]string{"CoverText"}))
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/assistant/extract-document", body)
	request.Header.Set("Content-Type", contentType)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "CoverText") {
		t.Fatalf("pdf %d %s", response.Code, response.Body.String())
	}
	tooMany, tooManyType := documentBytes(t, "many.pdf", "application/pdf", simplePDF(make([]string, 201)))
	tooManyResponse := httptest.NewRecorder()
	tooManyRequest := httptest.NewRequest(http.MethodPost, "/api/assistant/extract-document", tooMany)
	tooManyRequest.Header.Set("Content-Type", tooManyType)
	handler.ServeHTTP(tooManyResponse, tooManyRequest)
	if tooManyResponse.Code != http.StatusRequestEntityTooLarge || !strings.Contains(tooManyResponse.Body.String(), "PDF 页数过多") {
		t.Fatalf("pages %d %s", tooManyResponse.Code, tooManyResponse.Body.String())
	}
}

func simplePDF(pages []string) []byte {
	var buf bytes.Buffer
	offsets := []int{}
	add := func(object string) {
		offsets = append(offsets, buf.Len())
		buf.WriteString(object)
	}
	buf.WriteString("%PDF-1.4\n")
	kids := make([]string, len(pages))
	for i := range pages {
		kids[i] = fmt.Sprintf("%d 0 R", 4+i*2)
	}
	add(fmt.Sprintf("1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"))
	add(fmt.Sprintf("2 0 obj<</Type/Pages/Count %d/Kids[%s]>>endobj\n", len(pages), strings.Join(kids, " ")))
	add("3 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n")
	for i, text := range pages {
		if text == "" {
			text = "page"
		}
		stream := "BT /F1 12 Tf 72 720 Td (" + text + ") Tj ET"
		add(fmt.Sprintf("%d 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents %d 0 R/Resources<</Font<</F1 3 0 R>>>>>>endobj\n", 4+i*2, 5+i*2))
		add(fmt.Sprintf("%d 0 obj<</Length %d>>stream\n%s\nendstream\nendobj\n", 5+i*2, len(stream), stream))
	}
	xref := buf.Len()
	buf.WriteString(fmt.Sprintf("xref\n0 %d\n0000000000 65535 f \n", len(offsets)+1))
	for _, offset := range offsets {
		buf.WriteString(fmt.Sprintf("%010d 00000 n \n", offset))
	}
	buf.WriteString(fmt.Sprintf("trailer<</Size %d/Root 1 0 R>>\nstartxref\n%d\n%%%%EOF\n", len(offsets)+1, xref))
	return buf.Bytes()
}

func documentBytes(t *testing.T, name, mimeType string, content []byte) (*bytes.Buffer, string) {
	t.Helper()
	return documentForm(t, name, mimeType, string(content))
}

func officeZip(t *testing.T, files map[string]string) []byte {
	t.Helper()
	body := &bytes.Buffer{}
	writer := zip.NewWriter(body)
	names := make([]string, 0, len(files))
	for name := range files {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		entry, err := writer.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := entry.Write([]byte(files[name])); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return body.Bytes()
}

func documentForm(t *testing.T, name, mimeType, content string) (*bytes.Buffer, string) {
	t.Helper()
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreatePart(map[string][]string{
		"Content-Disposition": {`form-data; name="file"; filename="` + name + `"`},
		"Content-Type":        {mimeType},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write([]byte(content)); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return body, writer.FormDataContentType()
}
