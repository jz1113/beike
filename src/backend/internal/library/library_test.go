package library

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestLibraryFilteredListStaysProxied(t *testing.T) {
	handler := libraryGetHandler(config.Config{Upstream: "http://127.0.0.1:1"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/catalog/assets/library?type=scene&category=chinese_style", nil))
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("category status %d body %s", response.Code, response.Body.String())
	}
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/catalog/assets/library?type=full_prompt", nil))
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("prompt list status %d body %s", response.Code, response.Body.String())
	}
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/catalog/assets/library?type=all&export=1", nil))
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("export status %d body %s", response.Code, response.Body.String())
	}
}

func TestLibraryPostProxiesOtherActions(t *testing.T) {
	handler := libraryPostHandler(config.Config{Upstream: "http://127.0.0.1:1"})
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/catalog/assets/library", bytes.NewBufferString(`{"action":"create"}`))
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
	response = httptest.NewRecorder()
	request = httptest.NewRequest(http.MethodPost, "/api/catalog/assets/library", bytes.NewBufferString(`{"action":"bulk-import","items":[]}`))
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("bulk status %d body %s", response.Code, response.Body.String())
	}
	response = httptest.NewRecorder()
	request = httptest.NewRequest(http.MethodPost, "/api/catalog/assets/library", bytes.NewBufferString(`{"action":"bulk-import","items":[],"productCategories":[{"id":"jewelry"}]}`))
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("backup status %d body %s", response.Code, response.Body.String())
	}
	response = httptest.NewRecorder()
	request = httptest.NewRequest(http.MethodPost, "/api/catalog/assets/library", bytes.NewBufferString(`{"assetType":"full_prompt","data":{"productSubcategory":"nope"}}`))
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest || !bytes.Contains(response.Body.Bytes(), []byte("商品二级类目无效")) {
		t.Fatalf("subcategory status %d body %s", response.Code, response.Body.String())
	}
	response = httptest.NewRecorder()
	request = httptest.NewRequest(http.MethodPost, "/api/catalog/assets/library", bytes.NewBufferString(`{"assetType":"persona","data":{}}`))
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("persona status %d body %s", response.Code, response.Body.String())
	}
	response = httptest.NewRecorder()
	request = httptest.NewRequest(http.MethodPost, "/api/catalog/assets/library", bytes.NewBufferString(`{"assetType":"video","data":{}}`))
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest || !bytes.Contains(response.Body.Bytes(), []byte("不支持的资产类型: video")) {
		t.Fatalf("video status %d body %s", response.Code, response.Body.String())
	}
	response = httptest.NewRecorder()
	request = httptest.NewRequest(http.MethodPost, "/api/catalog/assets/library", bytes.NewBufferString(`{"action":"reorder-product-categories","ids":["a","a"]}`))
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
}

func TestLibraryAllListStaysProxied(t *testing.T) {
	handler := libraryGetHandler(config.Config{Upstream: "http://127.0.0.1:1"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/catalog/assets/library?type=scene", nil))
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("list status %d body %s", response.Code, response.Body.String())
	}
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/catalog/assets/library?type=all", nil))
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("all status %d body %s", response.Code, response.Body.String())
	}
}
func TestLibraryClearStaysProxied(t *testing.T) {
	handler := libraryDeleteHandler(config.Config{Upstream: "http://127.0.0.1:1"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodDelete, "/api/catalog/assets/library?action=clear-database", nil))
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
}
