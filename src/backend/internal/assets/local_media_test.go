package assets

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestLocalMediaServesWorkspaceFileAndRejectsEscape(t *testing.T) {
	root := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", root)
	if err := os.MkdirAll(filepath.Join(root, "generated/images"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "generated/images/a.png"), []byte("png"), 0o644); err != nil {
		t.Fatal(err)
	}
	handler := storageHandler(config.Config{})
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/storage/generated/images/a.png", nil)
	request.Header.Set("Range", "bytes=0-1")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusPartialContent || response.Body.String() != "pn" || response.Header().Get("Content-Type") != "image/png" {
		t.Fatalf("status %d body %q type %s", response.Code, response.Body.String(), response.Header().Get("Content-Type"))
	}
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/storage/../secret", nil))
	if response.Code != http.StatusForbidden {
		t.Fatalf("escape %d", response.Code)
	}
}

func TestLocalAudioServesPlayableMimeAndByteRanges(t *testing.T) {
	root := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", root)
	if err := os.MkdirAll(filepath.Join(root, "generated/audio"), 0o755); err != nil {
		t.Fatal(err)
	}
	for extension, contentType := range map[string]string{
		"mp3": "audio/mpeg", "wav": "audio/wav", "m4a": "audio/mp4", "aac": "audio/aac",
		"ogg": "audio/ogg", "oga": "audio/ogg", "opus": "audio/ogg", "flac": "audio/flac",
	} {
		t.Run(extension, func(t *testing.T) {
			if err := os.WriteFile(filepath.Join(root, "generated/audio/sample."+extension), []byte("audio"), 0o644); err != nil {
				t.Fatal(err)
			}
			response := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodGet, "/storage/generated/audio/sample."+extension, nil)
			request.Header.Set("Range", "bytes=1-3")
			storageHandler(config.Config{}).ServeHTTP(response, request)
			if response.Code != http.StatusPartialContent || response.Body.String() != "udi" || response.Header().Get("Content-Type") != contentType {
				t.Fatalf("status %d body %q type %s", response.Code, response.Body.String(), response.Header().Get("Content-Type"))
			}
			if response.Header().Get("Content-Range") != "bytes 1-3/5" || response.Header().Get("Accept-Ranges") != "bytes" {
				t.Fatalf("audio byte ranges unavailable: %v", response.Header())
			}
		})
	}
}
