package assets

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/storage"
)

func TestLocalUploadStoresDataURL(t *testing.T) {
	root := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", root)
	handler := storageUploadHandler(config.Config{Upstream: "http://127.0.0.1:1"})
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
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("admin status %d", response.Code)
	}
}

func TestStorageMigrateStopsWithoutCredentials(t *testing.T) {
	handler := storageMigrateHandler(config.Config{NodeEnv: "development", Upstream: "http://127.0.0.1:1"})
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
	handler := storageUploadHandler(config.Config{Upstream: "http://127.0.0.1:1"})
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
