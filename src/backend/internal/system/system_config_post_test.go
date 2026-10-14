package system

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestSystemConfigPostRequiresCredentials(t *testing.T) {
	handler := systemConfigPostHandler(config.Config{})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/system/config", bytes.NewBufferString(`{"type":"wanbang"}`)))
	if response.Code != http.StatusBadRequest || !bytes.Contains(response.Body.Bytes(), []byte("万邦 API Key")) {
		t.Fatalf("wanbang %d %s", response.Code, response.Body.String())
	}
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/system/config", bytes.NewBufferString(`{}`)))
	if response.Code != http.StatusBadRequest || !bytes.Contains(response.Body.Bytes(), []byte("缺少 AI API Key")) {
		t.Fatalf("ai %d %s", response.Code, response.Body.String())
	}
}

func TestProbeWanbangReadsQuota(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("key") != "key" || r.URL.Query().Get("secret") != "secret" {
			t.Errorf("query %s", r.URL.RawQuery)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"error_code":"0000","api_info":"today:2 max:100 expires:2026-12-31"}`))
	}))
	defer server.Close()
	ok, quota, message := probeWanbang(context.Background(), server.Client(), "key", "secret", []string{server.URL + "/taobao/item_get/?num_iid=1"})
	if !ok || !strings.Contains(quota, "每日上限: 100") || message != "" {
		t.Fatalf("ok %v quota %s message %s", ok, quota, message)
	}
}

func TestProbeMediaCatalogSeesModel(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer key" {
			t.Errorf("auth %s", r.Header.Get("Authorization"))
		}
		_, _ = w.Write([]byte(`{"data":[{"id":"gpt-image-2"}]}`))
	}))
	defer server.Close()
	status, body := probeMediaCatalog(context.Background(), server.Client(), server.URL, "key", "gpt-image-2")
	if status != http.StatusOK || body["modelVisible"] != true {
		t.Fatalf("status %d body %#v", status, body)
	}
}
