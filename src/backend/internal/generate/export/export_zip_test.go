package export

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"github.com/xuri/excelize/v2"
)

func TestExportZipPacksDataURL(t *testing.T) {
	payload := `{"folderName":"图集","images":["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="],"copywritingTitle":"标题"}`
	request := httptest.NewRequest(http.MethodPost, "/api/generate/export-zip", bytes.NewBufferString(payload))
	response := httptest.NewRecorder()
	ExportZip(config.Config{Upstream: "http://127.0.0.1:1"}).ServeHTTP(response, request)
	if response.Code != http.StatusOK || response.Header().Get("Content-Type") != "application/zip" {
		t.Fatalf("status %d type %s body %s", response.Code, response.Header().Get("Content-Type"), response.Body.String())
	}
	reader, err := zip.NewReader(bytes.NewReader(response.Body.Bytes()), int64(response.Body.Len()))
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, file := range reader.File {
		if !stringsHas(file.Name, "1.png") {
			continue
		}
		opened, err := file.Open()
		if err != nil {
			t.Fatal(err)
		}
		body, _ := io.ReadAll(opened)
		_ = opened.Close()
		if len(body) < 8 || string(body[:8]) != "\x89PNG\r\n\x1a\n" {
			t.Fatalf("body %q", body)
		}
		found = true
	}
	if !found {
		t.Fatal("zip 里没有图片")
	}
	var manifest *zip.File
	for _, file := range reader.File {
		if file.Name == "图集/采集清单.xlsx" {
			manifest = file
		}
	}
	if manifest == nil {
		t.Fatal("zip 里没有采集清单")
	}
	opened, err := manifest.Open()
	if err != nil {
		t.Fatal(err)
	}
	sheet, err := excelize.OpenReader(opened)
	_ = opened.Close()
	if err != nil {
		t.Fatal(err)
	}
	name, _ := sheet.GetCellValue("采集清单", "A2")
	title, _ := sheet.GetCellValue("采集清单", "B2")
	_ = sheet.Close()
	if name != "图集" || title != "标题" {
		t.Fatalf("manifest %q %q", name, title)
	}
	empty := httptest.NewRecorder()
	ExportZip(config.Config{}).ServeHTTP(empty, httptest.NewRequest(http.MethodPost, "/api/generate/export-zip", bytes.NewBufferString(`{"images":[]}`)))
	if empty.Code != http.StatusBadRequest || !bytes.Contains(empty.Body.Bytes(), []byte("没有可打包的图片或视频素材")) {
		t.Fatalf("empty %d %s", empty.Code, empty.Body.String())
	}
}

func TestExportZipNotesPartialFailure(t *testing.T) {
	png := base64.StdEncoding.EncodeToString([]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'})
	payload := `{"folderName":"图集","images":["data:image/png","data:image/png;base64,` + png + `"]}`
	response := httptest.NewRecorder()
	ExportZip(config.Config{Upstream: "http://127.0.0.1:1"}).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/export-zip", strings.NewReader(payload)))
	if response.Code != http.StatusOK {
		t.Fatalf("partial %d %s", response.Code, response.Body.String())
	}
	reader, err := zip.NewReader(bytes.NewReader(response.Body.Bytes()), int64(response.Body.Len()))
	if err != nil {
		t.Fatal(err)
	}
	names := map[string]string{}
	for _, file := range reader.File {
		opened, err := file.Open()
		if err != nil {
			t.Fatal(err)
		}
		body, _ := io.ReadAll(opened)
		_ = opened.Close()
		names[file.Name] = string(body)
	}
	if !strings.Contains(names["图集/1.jpg.error.txt"], "媒体数据格式无效") || names["图集/2.png"] == "" || names["导出结果.txt"] != "下载成功：1 项\n下载失败：1 项" || !strings.Contains(names["export-summary.json"], `"partial": true`) {
		t.Fatalf("files %#v", names)
	}
}

func TestExportRefererOrder(t *testing.T) {
	if exportReferer("img.alicdn.com") != "https://item.taobao.com/" {
		t.Fatal(exportReferer("img.alicdn.com"))
	}
	plans := exportHeaderPlans("api.comfly.org")
	if len(plans) != 2 || plans[0] != "" || plans[1] != "https://api.aiproxy.vip/" {
		t.Fatalf("plans %#v", plans)
	}
	if exportReferer("example.com") != "" {
		t.Fatal(exportReferer("example.com"))
	}
}

func TestRemoteExportFailureText(t *testing.T) {
	if remoteStatusRetries(http.StatusNotFound) || !remoteStatusRetries(http.StatusServiceUnavailable) || !remoteStatusRetries(http.StatusTooManyRequests) {
		t.Fatal("retry rule mismatch")
	}
	if mediaBodyAllowed("text/html", "https://img.alicdn.com/a.jpg", []byte("<html>no</html>")) {
		t.Fatal("html page was accepted")
	}
	if matrixFailureReason("https://img.alicdn.com/a.jpg", errors.New("下载失败（HTTP 404）")) != "下载失败（HTTP 404）" {
		t.Fatal("status text was replaced")
	}
}

func TestExportZipReportsFailedMedia(t *testing.T) {
	response := httptest.NewRecorder()
	ExportZip(config.Config{Upstream: "http://127.0.0.1:1"}).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/export-zip", strings.NewReader(`{"images":["data:image/png"]}`)))
	if response.Code != http.StatusBadGateway || !strings.Contains(response.Body.String(), "所有媒体文件均未能下载，请检查文件地址后重试") {
		t.Fatalf("failed %d %s", response.Code, response.Body.String())
	}
}

func TestMatrixPacksStoredImage(t *testing.T) {
	root := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", root)
	png, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "shot.png"), png, 0o600); err != nil {
		t.Fatal(err)
	}
	payload := `{"offlineMatrix":true,"batchTitle":"批次","products":[{"skuId":"sku1","promptAssetGroupName":"组","copywritingTitle":"封面","images":[{"url":"/storage/shot.png","originalUrl":"https://cdn.example.com/a.png"}]}]}`
	response := httptest.NewRecorder()
	ExportZip(config.Config{Upstream: "http://127.0.0.1:1"}).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/export-zip", strings.NewReader(payload)))
	if response.Code != http.StatusOK {
		t.Fatalf("stored %d %s", response.Code, response.Body.String())
	}
	reader, err := zip.NewReader(bytes.NewReader(response.Body.Bytes()), int64(response.Body.Len()))
	if err != nil {
		t.Fatal(err)
	}
	foundImage := false
	foundLink := false
	for _, file := range reader.File {
		if file.Name == "组---sku1-封面/图1.png" {
			foundImage = true
		}
		if file.Name != "生成成果清单.xlsx" {
			continue
		}
		opened, err := file.Open()
		if err != nil {
			t.Fatal(err)
		}
		sheet, err := excelize.OpenReader(opened)
		_ = opened.Close()
		if err != nil {
			t.Fatal(err)
		}
		link, err := sheet.GetCellValue("生成成果清单", "D2")
		_ = sheet.Close()
		if err != nil {
			t.Fatal(err)
		}
		foundLink = link == "https://cdn.example.com/a.png"
	}
	if !foundImage || !foundLink {
		t.Fatalf("image %v link %v", foundImage, foundLink)
	}
}

func TestMatrixPacksInlineImage(t *testing.T) {
	png := "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
	payload := `{"offlineMatrix":true,"batchTitle":"批次","products":[{"skuId":"sku1","promptAssetGroupName":"组","copywritingTitle":"封面","images":["data:image/png;base64,` + png + `"]}]}`
	response := httptest.NewRecorder()
	ExportZip(config.Config{Upstream: "http://127.0.0.1:1"}).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/export-zip", strings.NewReader(payload)))
	if response.Code != http.StatusOK {
		t.Fatalf("inline %d %s", response.Code, response.Body.String())
	}
	reader, err := zip.NewReader(bytes.NewReader(response.Body.Bytes()), int64(response.Body.Len()))
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, file := range reader.File {
		if file.Name != "组---sku1-封面/图1.png" {
			continue
		}
		found = true
	}
	if !found {
		t.Fatal("zip 里没有内嵌镜头")
	}
	remote := httptest.NewRecorder()
	ExportZip(config.Config{Root: filepath.Join("..", "..", "..", "..", ".."), Upstream: "http://127.0.0.1:1"}).ServeHTTP(remote, httptest.NewRequest(http.MethodPost, "/api/generate/export-zip", strings.NewReader(`{"offlineMatrix":true,"products":[{"images":["https://example.com/a.jpg"]}]}`)))
	if remote.Code != http.StatusBadGateway || !strings.Contains(remote.Body.String(), "所有媒体文件均未能下载，请检查文件地址后重试") || strings.Contains(remote.Body.String(), "上游 API 未就绪") {
		t.Fatalf("remote %d %s", remote.Code, remote.Body.String())
	}
}

func TestMatrixRemoteHostAllowlist(t *testing.T) {
	cfg := config.Config{Root: filepath.Join("..", "..", "..", "..", "..")}
	if err := exportRemoteRefusal(cfg, "https://img.alicdn.com/a.jpg"); err != nil {
		t.Fatal(err)
	}
	if err := exportRemoteRefusal(cfg, "https://example.com/a.jpg"); err == nil || err.Error() != "Host not allowed: example.com" {
		t.Fatal(err)
	}
	if err := exportRemoteRefusal(config.Config{Root: cfg.Root, NodeEnv: "production"}, "http://img.alicdn.com/a.jpg"); err == nil || err.Error() != "Only https URLs allowed in production" {
		t.Fatal(err)
	}
	if !matrixImageSource(cfg, "https://example.com/a.jpg") {
		t.Fatal("disallowed host should stay in the local export")
	}
}

func TestTextMatrixNeedsAnImage(t *testing.T) {
	payload := `{"offlineMatrix":true,"batchTitle":"批次","products":[{"skuId":"sku1","promptAssetGroupName":"组","title":"台灯","copywritingTitle":"封面","copywritingContent":"正文","category":"家居","images":[]}]}`
	response := httptest.NewRecorder()
	ExportZip(config.Config{Upstream: "http://127.0.0.1:1"}).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/export-zip", strings.NewReader(payload)))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "没有可打包的媒体素材") {
		t.Fatalf("empty shots %d %s", response.Code, response.Body.String())
	}
}

func TestMatrixKeepsPartialImageFailure(t *testing.T) {
	png := "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
	payload := `{"offlineMatrix":true,"batchTitle":"批次","products":[{"skuId":"sku1","promptAssetGroupName":"组","copywritingTitle":"封面","images":["data:image/png;base64,bm90cG5n","data:image/png;base64,` + png + `"]}]}`
	response := httptest.NewRecorder()
	ExportZip(config.Config{Upstream: "http://127.0.0.1:1"}).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/export-zip", strings.NewReader(payload)))
	if response.Code != http.StatusOK {
		t.Fatalf("partial %d %s", response.Code, response.Body.String())
	}
	reader, err := zip.NewReader(bytes.NewReader(response.Body.Bytes()), int64(response.Body.Len()))
	if err != nil {
		t.Fatal(err)
	}
	names := map[string]string{}
	for _, file := range reader.File {
		opened, err := file.Open()
		if err != nil {
			t.Fatal(err)
		}
		body, _ := io.ReadAll(opened)
		_ = opened.Close()
		names[file.Name] = string(body)
	}
	if !strings.Contains(names["组---sku1-封面/图1.error.txt"], "下载内容不是有效图片或视频文件") || names["组---sku1-封面/图2.png"] == "" || !strings.Contains(names["导出结果.txt"], "下载成功：1 项\n下载失败：1 项") {
		t.Fatalf("files %#v", names)
	}
}

func TestEmptyMatrixUsesLocalZip(t *testing.T) {
	payload := `{"offlineMatrix":true,"products":[],"folderName":"图集","images":["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="]}`
	response := httptest.NewRecorder()
	ExportZip(config.Config{Upstream: "http://127.0.0.1:1"}).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/export-zip", strings.NewReader(payload)))
	if response.Code != http.StatusOK || response.Header().Get("Content-Type") != "application/zip" {
		t.Fatalf("empty matrix %d %s", response.Code, response.Body.String())
	}
}

func TestExportZipLimitsMatrixAndCopy(t *testing.T) {
	handler := ExportZip(config.Config{Upstream: "http://127.0.0.1:1"})
	var products []string
	for range 126 {
		products = append(products, `{"images":["a","b","c","d"]}`)
	}
	matrix := httptest.NewRecorder()
	handler.ServeHTTP(matrix, httptest.NewRequest(http.MethodPost, "/api/generate/export-zip", strings.NewReader(`{"offlineMatrix":true,"products":[`+strings.Join(products, ",")+`]}`)))
	if matrix.Code != http.StatusRequestEntityTooLarge || !strings.Contains(matrix.Body.String(), "一次最多导出 500 个媒体文件，请分批导出") {
		t.Fatalf("matrix %d %s", matrix.Code, matrix.Body.String())
	}
	copy := httptest.NewRecorder()
	handler.ServeHTTP(copy, httptest.NewRequest(http.MethodPost, "/api/generate/export-zip", strings.NewReader(`{"copywritingContent":"`+strings.Repeat("a", 4*1024*1024+1)+`","images":["data:image/png;base64,YQ=="]}`)))
	if copy.Code != http.StatusRequestEntityTooLarge || !strings.Contains(copy.Body.String(), "分卷文案超过 4 MB，请减少每卷条目数量") {
		t.Fatalf("copy %d %s", copy.Code, copy.Body.String())
	}
}

func stringsHas(value, part string) bool {
	return len(value) >= len(part) && value[len(value)-len(part):] == part
}
