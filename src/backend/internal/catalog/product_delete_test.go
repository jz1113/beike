package catalog

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestProductDeleteRequiresIDAndProxiesRemoteStorage(t *testing.T) {
	handler := productsDeleteHandler(config.Config{Upstream: "http://127.0.0.1:1"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodDelete, "/api/catalog/products", nil))
	if response.Code != http.StatusBadRequest {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
	t.Setenv("STORAGE_ENABLED", "true")
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodDelete, "/api/catalog/products?id=1", nil))
	if response.Code != http.StatusInternalServerError || !strings.Contains(response.Body.String(), "操作失败") {
		t.Fatalf("remote status %d body %s", response.Code, response.Body.String())
	}
}
