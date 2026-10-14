package system

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestMediaReviewListsWorkspaceFiles(t *testing.T) {
	root := t.TempDir()
	t.Setenv("AZHUO_DATA_DIR", root)
	dir := filepath.Join(root, "media-review", "local")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	body := []byte(`{"url":"https://cdn.example.com/a.png","source":{"assetType":"scene","ids":["1"]},"state":"retained-reference-check-required","queuedAt":"2026-01-02T00:00:00.000Z"}`)
	if err := os.WriteFile(filepath.Join(dir, "a.json"), body, 0o600); err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	mediaReviewHandler(config.Config{}).ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/system/media-review", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("status %d", response.Code)
	}
	var payload struct {
		Count int `json:"count"`
		Items []struct {
			URL string `json:"url"`
		} `json:"items"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload.Count != 1 || payload.Items[0].URL != "https://cdn.example.com/a.png" {
		t.Fatalf("payload %#v", payload)
	}
}
