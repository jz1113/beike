package assets

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/storage"
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLocalUploadStoresDataURL(t *testing.T) {
	root := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", root)
	handler := storageUploadHandler(config.Config{})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/assets/storage/upload", bytes.NewBufferString(`{"dataUrl":"data:image/png;base64,aGVsbG8="}`)))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `/storage/local/azhuo/generated/images/`) {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
	matches, err := filepath.Glob(filepath.Join(root, "local", "azhuo", "generated", "images", "*", "*"))
	if err != nil || len(matches) != 1 {
		t.Fatalf("files %#v %v", matches, err)
	}
	body, err := os.ReadFile(matches[0])
	if err != nil || string(body) != "hello" {
		t.Fatalf("body %q %v", body, err)
	}
}

func TestUploadRejectsOversizedBodyBeforeSaving(t *testing.T) {
	root := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", root)
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodPost, "/api/assets/storage/upload", bytes.NewReader(make([]byte, maxStorageUploadBytes+1)))
	storageUploadHandler(config.Config{}).ServeHTTP(w, r)
	if w.Code != http.StatusRequestEntityTooLarge || !strings.Contains(w.Body.String(), "32 MB") {
		t.Fatalf("oversized upload: %d %s", w.Code, w.Body.String())
	}
	files, err := os.ReadDir(root)
	if err != nil || len(files) != 0 {
		t.Fatalf("rejected upload wrote files: %v %v", files, err)
	}
}

func TestStorageTestReportsIncompleteConfig(t *testing.T) {
	handler := storageTestHandler(config.Config{NodeEnv: "development"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/assets/storage/test", bytes.NewBufferString(`{}`)))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "配置不完整") {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
	handler = storageTestHandler(config.Config{NodeEnv: "production", AccessToken: "user", AdminToken: "admin"})
	request := httptest.NewRequest(http.MethodPost, "/api/assets/storage/test", bytes.NewBufferString(`{}`))
	request.Header.Set("x-app-token", "user")
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("admin status %d", response.Code)
	}
}

func TestStorageMigrateStopsWithoutCredentials(t *testing.T) {
	handler := storageMigrateHandler(config.Config{NodeEnv: "development"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/assets/storage/migrate", bytes.NewBufferString(`{}`)))
	if response.Code != http.StatusBadRequest || !bytes.Contains(response.Body.Bytes(), []byte("未配置有效的对象存储凭证")) {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
}

func TestRemoteUploadFallsBackLocally(t *testing.T) {
	t.Setenv("AZHUO_CACHE_DIR", t.TempDir())
	previous := storage.Objects
	storage.Objects = failObjectStore{}
	t.Cleanup(func() { storage.Objects = previous })
	handler := storageUploadHandler(config.Config{})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/assets/storage/upload", bytes.NewBufferString(`{"customConfig":{"persistResults":true,"accessKeyId":"k","secretAccessKey":"s","bucketName":"b"},"dataUrl":"data:image/png;base64,aGVsbG8="}`)))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `/storage/local/azhuo/generated/images/`) {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
}

type failObjectStore struct{}

func (failObjectStore) Put(context.Context, storage.ObjectConfig, string, string, []byte) error {
	return os.ErrClosed
}

func (failObjectStore) Delete(context.Context, storage.ObjectConfig, string) error { return nil }

func TestProductionUploadRemainsReadableOnlyInItsWorkspace(t *testing.T) {
	t.Setenv("AZHUO_CACHE_DIR", t.TempDir())
	cfg := config.Config{NodeEnv: "production", AccessToken: "access"}
	request := httptest.NewRequest(http.MethodPost, "/api/assets/storage/upload", strings.NewReader(`{"dataUrl":"data:image/png;base64,aGVsbG8="}`))
	request.Header.Set("x-app-token", "access")
	request.Header.Set("x-workspace-token", strings.Repeat("a", 64))
	workspace, ok := httpx.ResolveWorkspace(request, cfg)
	if !ok {
		t.Fatal("test workspace rejected")
	}
	request = request.WithContext(httpx.WithWorkspace(request.Context(), workspace))
	response := httptest.NewRecorder()
	storageUploadHandler(cfg).ServeHTTP(response, request)
	var data struct {
		URL string `json:"url"`
	}
	if json.Unmarshal(response.Body.Bytes(), &data) != nil || data.URL == "" {
		t.Fatal(response.Body.String())
	}
	for _, secret := range []string{strings.Repeat("a", 64), strings.Repeat("b", 64)} {
		read := httptest.NewRequest(http.MethodGet, data.URL, nil)
		read.Header.Set("x-app-token", "access")
		read.Header.Set("x-workspace-token", secret)
		result := httptest.NewRecorder()
		storageHandler(cfg).ServeHTTP(result, read)
		expected := http.StatusForbidden
		if secret == strings.Repeat("a", 64) {
			expected = http.StatusOK
		}
		if result.Code != expected {
			t.Fatalf("scoped read status=%d expected=%d: %s", result.Code, expected, result.Body.String())
		}
	}
}

func TestLocalUploadSupportsParameterizedDataURLAndGIFContentType(t *testing.T) {
	t.Setenv("AZHUO_CACHE_DIR", t.TempDir())
	cfg := config.Config{NodeEnv: "development"}
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/assets/storage/upload", strings.NewReader(`{"category":"canvas-library","dataUrl":"data:image/gif;charset=utf-8;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7\n"}`))
	storageUploadHandler(cfg).ServeHTTP(w, req)
	var data struct {
		URL string `json:"url"`
	}
	if w.Code != http.StatusOK || json.Unmarshal(w.Body.Bytes(), &data) != nil || !strings.HasSuffix(data.URL, ".gif") {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	readW := httptest.NewRecorder()
	readReq := httptest.NewRequest(http.MethodGet, data.URL, nil)
	storageHandler(cfg).ServeHTTP(readW, readReq)
	if readW.Code != http.StatusOK || readW.Header().Get("Content-Type") != "image/gif" {
		t.Fatalf("read gif status=%d content-type=%s", readW.Code, readW.Header().Get("Content-Type"))
	}
}

func TestClearDerivedStorageRemovesFiles(t *testing.T) {
	root := t.TempDir()
	nested := filepath.Join(root, "derived", "images")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(nested, "a.jpg"), []byte("1234"), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("AZHUO_CACHE_DIR", root)
	response := httptest.NewRecorder()
	clearDerivedStorageHandler(config.Config{}).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/system/local-storage/clear-derived", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["success"] != true || body["clearedFileCount"] != float64(1) || body["clearedBytes"] != float64(4) || body["message"] != "已清理派生磁盘缓存" {
		t.Fatalf("body %#v", body)
	}
	if _, err := os.Stat(filepath.Join(root, "derived")); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(filepath.Join(root, "derived"))
	if err != nil || len(entries) != 0 {
		t.Fatalf("derived entries %#v err %v", entries, err)
	}
}
