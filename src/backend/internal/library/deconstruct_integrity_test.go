package library

import (
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestIncompleteDownloadNeverReordersOrMixesFourImageGroups(t *testing.T) {
	png, _ := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/missing" {
			w.WriteHeader(404)
			return
		}
		_, _ = w.Write(png)
	}))
	defer server.Close()
	urls := []string{}
	for i := 0; i < 8; i++ {
		urls = append(urls, server.URL+"/ok")
	}
	urls[2] = server.URL + "/missing"
	prepared, originals, err := prepareDeconstructImages(config.Config{}, urls)
	if err == nil || len(prepared) > 0 || len(originals) > 0 {
		t.Fatal("failed image silently removed and later group shifted into its place")
	}
}

func TestReverseResultsMustMatchEveryOriginal(t *testing.T) {
	valid := []any{
		map[string]any{"image_index": float64(1), "reverse_prompt_zh": "镜头一"},
		map[string]any{"image_index": float64(2), "reverse_prompt_zh": "镜头二"},
	}
	if err := validateVisionImages(valid, 2); err != nil {
		t.Fatal(err)
	}
	if validateVisionImages(valid[:1], 2) == nil {
		t.Fatal("missing image description accepted")
	}
	valid[1].(map[string]any)["image_index"] = float64(1)
	if validateVisionImages(valid, 2) == nil {
		t.Fatal("duplicate image index accepted")
	}
}
