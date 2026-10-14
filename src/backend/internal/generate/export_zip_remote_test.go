package generate

import (
	"archive/zip"
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestExportRemoteRefusalMatchesNode(t *testing.T) {
	cfg := config.Config{Root: filepath.Join("..", "..", "..", "..")}
	if err := exportRemoteRefusal(cfg, "http://127.0.0.1/a.jpg"); err == nil || err.Error() != "Host not allowed" {
		t.Fatal(err)
	}
	if err := exportRemoteRefusal(cfg, "https://user:pass@img.alicdn.com/a.jpg"); err == nil || err.Error() != "地址不得包含账号或密码" {
		t.Fatal(err)
	}
	if err := exportRemoteRefusal(cfg, "ftp://img.alicdn.com/a.jpg"); err == nil || err.Error() != "Only http(s) URLs allowed" {
		t.Fatal(err)
	}
}

func TestMatrixWritesDisallowedHost(t *testing.T) {
	png := "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
	payload := `{"offlineMatrix":true,"batchTitle":"批次","products":[{"skuId":"sku1","promptAssetGroupName":"组","copywritingTitle":"封面","images":["data:image/png;base64,` + png + `","https://example.com/a.jpg"]}]}`
	response := httptest.NewRecorder()
	ExportZip(config.Config{Root: filepath.Join("..", "..", "..", ".."), Upstream: "http://127.0.0.1:1"}).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/export-zip", strings.NewReader(payload)))
	if response.Code != http.StatusOK {
		t.Fatalf("partial %d %s", response.Code, response.Body.String())
	}
	reader, err := zip.NewReader(bytes.NewReader(response.Body.Bytes()), int64(response.Body.Len()))
	if err != nil {
		t.Fatal(err)
	}
	note := ""
	for _, file := range reader.File {
		if !strings.HasSuffix(file.Name, "图2.error.txt") {
			continue
		}
		opened, err := file.Open()
		if err != nil {
			t.Fatal(err)
		}
		body, _ := io.ReadAll(opened)
		_ = opened.Close()
		note = string(body)
	}
	if !strings.Contains(note, "Host not allowed: example.com") {
		t.Fatalf("note %q", note)
	}
}
