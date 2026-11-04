package assets

import (
	"bytes"
	"image"
	"image/jpeg"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestLocalThumbnailPreservesOriginal(t *testing.T) {
	root := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", root)
	dir := filepath.Join(root, "generated/images")
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	var original bytes.Buffer
	if err := jpeg.Encode(&original, image.NewRGBA(image.Rect(0, 0, 800, 400)), nil); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "scene.jpg"), original.Bytes(), 0600); err != nil {
		t.Fatal(err)
	}
	handler := storageHandler(config.Config{})
	for _, query := range []string{"?thumb=1&w=320", "?thumb=1&w=96", ""} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/storage/generated/images/scene.jpg"+query, nil))
		if query == "" {
			if !bytes.Equal(response.Body.Bytes(), original.Bytes()) {
				t.Fatal("preview returned thumbnail instead of original")
			}
			continue
		}
		want := 320
		if query == "?thumb=1&w=96" {
			want = 96
		}
		cfg, _, err := image.DecodeConfig(response.Body)
		if err != nil || response.Code != 200 || cfg.Width != want || cfg.Height != want/2 {
			t.Fatalf("thumbnail %s: %+v %v", query, cfg, err)
		}
	}
}
