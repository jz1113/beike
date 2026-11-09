package library

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func TestLibraryFilteredListStaysProxied(t *testing.T) {
	handler := libraryGetHandler(config.Config{})
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
	handler := libraryPostHandler(config.Config{})
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
	handler := libraryGetHandler(config.Config{})
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
	handler := libraryDeleteHandler(config.Config{})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodDelete, "/api/catalog/assets/library?action=clear-database", nil))
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
}

func TestSourceCheckPostRejectsBadBody(t *testing.T) {
	handler := sourceCheckPostHandler(config.Config{})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/catalog/assets/source-check", bytes.NewBufferString(`{"urls":"nope"}`)))
	if response.Code != http.StatusBadRequest || !bytes.Contains(response.Body.Bytes(), []byte("每次最多查重 200 条链接")) {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
}

func TestNoteSourceKeyAndUnsupportedHost(t *testing.T) {
	if noteSourceKey("https://www.xiaohongshu.com/explore/661234567890abcdef123456") != "xhs:661234567890abcdef123456" {
		t.Fatal("key")
	}
	item := checkOneSource(context.Background(), nil, "local", "https://example.com/a", nil)
	if item.State != "error" || item.Reason == nil || !strings.Contains(*item.Reason, "只支持小红书") {
		t.Fatalf("item %#v", item)
	}
	if expanded := expandShortLink(context.Background(), "http://127.0.0.1/secret", []string{"xhslink.com"}); expanded != "http://127.0.0.1/secret" {
		t.Fatalf("expanded %s", expanded)
	}
}

func TestReviewRejectAndRestore(t *testing.T) {
	path := filepath.Join(t.TempDir(), "reviews.db")
	db, err := database.OpenWrite(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "DeconstructReview" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "albumName" TEXT NOT NULL,
		"payload" TEXT NOT NULL, "status" TEXT NOT NULL, "createdAt" TEXT NOT NULL
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "DeconstructReview" ("id","workspaceId","albumName","payload","status","createdAt") VALUES
		('new','local','新图集','{}','pending','2026-02-01T00:00:00.000Z'),
		('other','elsewhere','别人的','{}','pending','2026-02-01T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{DatabaseURL: "file:" + path}
	if status := postReview(t, cfg, `{"id":"new","action":"reject"}`); status != http.StatusOK {
		t.Fatalf("reject status %d", status)
	}
	if status := postReview(t, cfg, `{"id":"new","action":"restore"}`); status != http.StatusOK {
		t.Fatalf("restore status %d", status)
	}
	var reviewStatus string
	if err := db.QueryRow(`SELECT "status" FROM "DeconstructReview" WHERE "id" = 'new'`).Scan(&reviewStatus); err != nil {
		t.Fatal(err)
	}
	if reviewStatus != "pending" {
		t.Fatalf("status %s", reviewStatus)
	}
	var otherStatus string
	if err := db.QueryRow(`SELECT "status" FROM "DeconstructReview" WHERE "id" = 'other'`).Scan(&otherStatus); err != nil {
		t.Fatal(err)
	}
	if otherStatus != "pending" {
		t.Fatalf("other status %s", otherStatus)
	}
	if status := postReview(t, cfg, `{"id":"new","action":"drop"}`); status != http.StatusBadRequest {
		t.Fatalf("invalid status %d", status)
	}
	if status := postReview(t, cfg, `{"id":"new","action":"approve"}`); status != http.StatusInternalServerError {
		t.Fatalf("approve status %d", status)
	}
	if status := postReview(t, cfg, `{"id":"missing","action":"replace"}`); status != http.StatusNotFound {
		t.Fatalf("replace status %d", status)
	}
	_ = db.Close()
}

func postReview(t *testing.T, cfg config.Config, body string) int {
	t.Helper()
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/catalog/assets/reviews", bytes.NewBufferString(body))
	deconstructReviewsPostHandler(cfg).ServeHTTP(response, request)
	return response.Code
}
