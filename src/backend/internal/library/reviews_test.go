package library

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/database"
)

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
	cfg := config.Config{DatabaseURL: "file:" + path, Upstream: "http://127.0.0.1:1"}
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
