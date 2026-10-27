package poster

import (
	"encoding/base64"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/httpx"
)

func TestHeadlineImagesReadLocalUploadsWithoutHTTP(t *testing.T) {
	root := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", root)
	workspace := strings.Repeat("a", 64)
	if err := os.MkdirAll(filepath.Join(root, workspace), 0700); err != nil {
		t.Fatal(err)
	}
	raw, _ := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
	if err := os.WriteFile(filepath.Join(root, workspace, "原图.png"), raw, 0600); err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest(http.MethodPost, "http://localhost:3000/api/generate/headline-title", nil)
	r = r.WithContext(httpx.WithWorkspace(r.Context(), workspace))
	for _, source := range []string{"/storage/" + workspace + "/原图.png", "http://127.0.0.1:5173/storage/" + workspace + "/%E5%8E%9F%E5%9B%BE.png?exp=1"} {
		images, message := headlineImages(config.Config{}, r, []string{source})
		if message != "" || len(images) != 1 || !strings.HasPrefix(images[0], "data:image/png;base64,") {
			t.Fatalf("local upload was not embedded: %q %s", images, message)
		}
	}
	for _, source := range []string{"/storage/other/原图.png", "/storage/" + workspace + "/../原图.png", "/storage/" + workspace + "/missing.png"} {
		if _, message := headlineImages(config.Config{}, r, []string{source}); message == "" {
			t.Fatalf("invalid local source accepted: %s", source)
		}
	}
}

func TestHeadlineImagePreflightIncludesRetailHeaders(t *testing.T) {
	old := generate.ModelHTTP
	defer func() { generate.ModelHTTP = old }()
	generate.ModelHTTP = func() *http.Client {
		return &http.Client{Transport: headlineImageTransport(func(r *http.Request) (*http.Response, error) {
			if r.Header.Get("Referer") != "https://www.taobao.com/" || r.Header.Get("User-Agent") == "" {
				t.Error("retail image request omitted anti-hotlink headers")
			}
			return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader("image")), Header: make(http.Header)}, nil
		})}
	}
	source := "https://img.alicdn.com/product.png?signature=abc"
	images, message := headlineImages(config.Config{}, httptest.NewRequest(http.MethodPost, "/", nil), []string{source})
	if message != "" || len(images) != 1 || images[0] != source {
		t.Fatalf("remote image changed: %q %s", images, message)
	}
}

type headlineImageTransport func(*http.Request) (*http.Response, error)

func (f headlineImageTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
