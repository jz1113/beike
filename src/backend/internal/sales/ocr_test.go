package sales

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/png"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func originalFixture(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", root)
	t.Setenv("AZHUO_DATA_DIR", t.TempDir())
	if err := os.MkdirAll(filepath.Join(root, "local"), 0700); err != nil {
		t.Fatal(err)
	}
	var data bytes.Buffer
	if err := png.Encode(&data, image.NewRGBA(image.Rect(0, 0, 8, 8))); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "local", "test.png"), data.Bytes(), 0600); err != nil {
		t.Fatal(err)
	}
	return root
}
func requestOCR(handler http.HandlerFunc, source string, force bool, workspace string) *httptest.ResponseRecorder {
	body, _ := json.Marshal(map[string]any{"imageUrl": source, "force": force})
	r := httptest.NewRequest(http.MethodPost, "/api/sales/ocr", bytes.NewReader(body))
	r = r.WithContext(httpx.WithWorkspace(r.Context(), workspace))
	w := httptest.NewRecorder()
	handler(w, r)
	return w
}
func TestOCRCacheForceAndWorkspace(t *testing.T) {
	originalFixture(t)
	calls := 0
	handler := ocrHandler(config.Config{}, func(ctx context.Context, data []byte) (ocrResult, error) {
		calls++
		return ocrResult{Engine: engineRevision, Width: 8, Height: 8, Text: "棉 61.7%", Lines: []ocrLine{}}, nil
	})
	first := requestOCR(handler, "/storage/local/test.png", false, "local")
	if first.Code != 200 || !strings.Contains(first.Body.String(), `"cached":false`) {
		t.Fatal(first.Code, first.Body.String())
	}
	second := requestOCR(handler, "/storage/local/test.png", false, "local")
	if second.Code != 200 || !strings.Contains(second.Body.String(), `"cached":true`) || calls != 1 {
		t.Fatal(second.Code, second.Body.String(), calls)
	}
	requestOCR(handler, "/storage/local/test.png", true, "local")
	if calls != 2 {
		t.Fatal("force did not bypass cache")
	}
	denied := requestOCR(handler, "/storage/local/test.png", false, strings.Repeat("a", 64))
	if denied.Code != 400 || calls != 2 {
		t.Fatal("workspace could read another workspace image", denied.Code)
	}
	a := ocrCachePath(config.Config{}, "one", []byte("same"))
	b := ocrCachePath(config.Config{}, "two", []byte("same"))
	if a == b {
		t.Fatal("cache not isolated")
	}
}
func TestOriginalRejectsUnsafeSourcesAndInvalidImages(t *testing.T) {
	root := originalFixture(t)
	for _, source := range []string{"file:///etc/passwd", "/etc/passwd", "data:image/png;base64,AAA", "http://127.0.0.1:1/test.png", "/storage/local/../secret.png", "/storage/" + strings.Repeat("b", 64) + "/image.png"} {
		if _, err := readOriginal(context.Background(), source, "local"); err == nil {
			t.Errorf("accepted %s", source)
		}
	}
	if err := os.WriteFile(filepath.Join(root, "local", "not.png"), []byte("not image"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := readOriginal(context.Background(), "/storage/local/not.png", "local"); err == nil {
		t.Fatal("accepted invalid image")
	}
	outside := filepath.Join(t.TempDir(), "outside.png")
	if err := os.WriteFile(outside, []byte("outside"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(root, "local", "escape.png")); err == nil {
		if _, err := readOriginal(context.Background(), "/storage/local/escape.png", "local"); err == nil {
			t.Fatal("accepted escaped symlink")
		}
	}
}
func TestOCRFailureAndCancellation(t *testing.T) {
	originalFixture(t)
	missing := ocrHandler(config.Config{}, func(context.Context, []byte) (ocrResult, error) { return ocrResult{}, errRuntimeMissing })
	if response := requestOCR(missing, "/storage/local/test.png", false, "local"); response.Code != 503 {
		t.Fatal(response.Code)
	}
	ctx, cancel := context.WithCancel(context.Background())
	handler := ocrHandler(config.Config{}, func(ctx context.Context, _ []byte) (ocrResult, error) {
		cancel()
		<-ctx.Done()
		return ocrResult{}, ctx.Err()
	})
	r := httptest.NewRequest(http.MethodPost, "/api/sales/ocr", strings.NewReader(`{"imageUrl":"/storage/local/test.png"}`)).WithContext(ctx)
	w := httptest.NewRecorder()
	handler(w, r)
	if w.Code != 504 {
		t.Fatal(w.Code, w.Body.String())
	}
	// The semaphore must be released after failure/cancellation.
	if len(ocrSlot) != 0 {
		t.Fatal("OCR slot leaked")
	}
}
func TestOCRBusyAndMalformedRequest(t *testing.T) {
	handler := ocrHandler(config.Config{}, nil)
	for _, body := range []string{`{}`, `null`, `{"imageUrl":42}`, `{"imageUrl":"/storage/a"} {}`} {
		w := httptest.NewRecorder()
		handler(w, httptest.NewRequest(http.MethodPost, "/api/sales/ocr", strings.NewReader(body)))
		if w.Code != 400 {
			t.Fatal(body, w.Code)
		}
	}
	ocrSlot <- struct{}{}
	defer func() { <-ocrSlot }()
	if response := requestOCR(handler, "https://example.com/image.png", false, "local"); response.Code != 429 {
		t.Fatal(response.Code)
	}
}
