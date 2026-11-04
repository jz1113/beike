package generate

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"

	"beike.local/cloud/src/backend/internal/httpx"
)

func writeViduReferencePNG(t *testing.T, root, rel string, shade color.RGBA) (string, []byte) {
	t.Helper()
	frame := image.NewRGBA(image.Rect(0, 0, 128, 128))
	for y := range 128 {
		for x := range 128 {
			frame.SetRGBA(x, y, shade)
		}
	}
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, frame); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(root, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, encoded.Bytes(), 0600); err != nil {
		t.Fatal(err)
	}
	return path, encoded.Bytes()
}

func postViduImages(t *testing.T, handler http.Handler, base, key, model, mode, workspace string, images []string) *httptest.ResponseRecorder {
	t.Helper()
	body, err := json.Marshal(map[string]any{
		"model": model, "prompt": "按图片1、图片2顺序展示商品", "preserve_prompt": true,
		"ref_mode": mode, "images": images, "duration": 5, "resolution": "720P", "aspect_ratio": "9:16", "audio": false,
		"customBaseUrl": base, "customApiKey": "test-api-key", "clientTaskId": key,
	})
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/generate/video", bytes.NewReader(body))
	req = req.WithContext(httpx.WithWorkspace(req.Context(), workspace))
	req.Header.Set("x-idempotency-key", key)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, req)
	return response
}

func TestViduQ4SubmitsLocalImagesAsInlineReferencesInOriginalOrder(t *testing.T) {
	root := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", root)
	t.Setenv("STORAGE_ENABLED", "false")
	path, original := writeViduReferencePNG(t, root, "local/images/product.png", color.RGBA{R: 180, A: 255})
	_, inline := writeViduReferencePNG(t, root, "local/images/inline.png", color.RGBA{B: 180, A: 255})
	localData := "data:image/png;base64," + base64.StdEncoding.EncodeToString(original)
	inlineData := "data:image/png;base64," + base64.StdEncoding.EncodeToString(inline)
	refs := []string{" /storage/local/images/product.png ", "https://cdn.example/front.jpg?signature=private-image", inlineData, "//cdn.example/back.webp"}
	want := []string{localData, "https://cdn.example/front.jpg?signature=private-image", inlineData, "https://cdn.example/back.webp"}
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.URL.Path != "/vidu/v2/reference2video" {
			t.Errorf("wrong Vidu reference endpoint: %s", r.URL.Path)
		}
		var sent struct {
			Model  string   `json:"model"`
			Prompt string   `json:"prompt"`
			Images []string `json:"images"`
		}
		if err := json.NewDecoder(r.Body).Decode(&sent); err != nil {
			t.Error(err)
		}
		if sent.Model != "viduq4-preview" || sent.Prompt != "按图片1、图片2顺序展示商品" || !reflect.DeepEqual(sent.Images, want) {
			t.Errorf("Vidu did not receive prepared images in prompt order: model=%s images=%v", sent.Model, sent.Images)
		}
		_, _ = w.Write([]byte(`{"task_id":"vidu-local-images"}`))
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	response := postViduImages(t, Video(cfg), server.URL, "vidu-local-images", "viduq4-preview", "omni", "local", refs)
	if response.Code != http.StatusOK || calls.Load() != 1 || !strings.Contains(response.Body.String(), `"taskId":"vidu-local-images"`) {
		t.Fatalf("local Vidu image submission failed: %d %s calls=%d", response.Code, response.Body.String(), calls.Load())
	}
	preserved, err := os.ReadFile(path)
	if err != nil || !bytes.Equal(preserved, original) {
		t.Fatal("Vidu preparation changed the saved source image", err)
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	// Replaying an accepted receipt must not reread a source or submit another paid task.
	repeated := postViduImages(t, Video(cfg), server.URL, "vidu-local-images", "viduq4-preview", "omni", "local", refs)
	if repeated.Code != http.StatusOK || calls.Load() != 1 || !strings.Contains(repeated.Body.String(), `"taskId":"vidu-local-images"`) || !strings.Contains(repeated.Body.String(), `"reused":true`) {
		t.Fatalf("Vidu replay reread the image or submitted again: %d %s calls=%d", repeated.Code, repeated.Body.String(), calls.Load())
	}
}

func TestViduFrameModesPrepareEachLocalImage(t *testing.T) {
	for _, item := range []struct {
		name, model, mode, endpoint string
		count                       int
	}{
		{"first frame", "viduq4-preview", "first_frame", "/vidu/v2/img2video", 1},
		{"first and last frames", "viduq3-pro", "first_last_frame", "/vidu/v2/start-end2video", 2},
	} {
		t.Run(item.name, func(t *testing.T) {
			root := t.TempDir()
			t.Setenv("AZHUO_CACHE_DIR", root)
			_, first := writeViduReferencePNG(t, root, "local/first.png", color.RGBA{R: 150, A: 255})
			_, last := writeViduReferencePNG(t, root, "local/last.png", color.RGBA{G: 150, A: 255})
			refs := []string{"/storage/local/first.png", "/storage/local/last.png"}[:item.count]
			want := []string{"data:image/png;base64," + base64.StdEncoding.EncodeToString(first), "data:image/png;base64," + base64.StdEncoding.EncodeToString(last)}[:item.count]
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				var sent map[string]json.RawMessage
				if err := json.NewDecoder(r.Body).Decode(&sent); err != nil {
					t.Error(err)
				}
				var images []string
				if err := json.Unmarshal(sent["images"], &images); err != nil {
					t.Error(err)
				}
				if r.URL.Path != item.endpoint || !reflect.DeepEqual(images, want) || sent["aspect_ratio"] != nil {
					t.Errorf("Vidu frame request changed endpoint, frames or ratio: endpoint=%s images=%v", r.URL.Path, images)
				}
				_, _ = w.Write([]byte(`{"task_id":"vidu-frames"}`))
			}))
			defer server.Close()
			response := postViduImages(t, Video(videoSubmissionTestConfig(t, server)), server.URL, "vidu-frames", item.model, item.mode, "local", refs)
			if response.Code != http.StatusOK || calls.Load() != 1 {
				t.Fatalf("Vidu frame submission failed: %d %s calls=%d", response.Code, response.Body.String(), calls.Load())
			}
		})
	}
}

func TestViduRejectsUnavailableOrUnauthorizedImagesBeforeUpstream(t *testing.T) {
	for _, item := range []struct {
		name, ref, workspace, message string
	}{
		{"missing local image", "/storage/local/missing.png", "local", "不存在"},
		{"another workspace", "/storage/workspace-b/private.png", "workspace-a", "无权读取"},
		{"relative image", "/uploads/local.png", "local", "不支持"},
		{"browser blob", "blob:https://example.com/reference", "local", "不支持"},
		{"filesystem image", "file:///private/reference.png", "local", "不支持"},
		{"encoded traversal", "/storage/workspace-a/%252e%252e/workspace-b/private.png", "workspace-a", "不存在"},
	} {
		t.Run(item.name, func(t *testing.T) {
			root := t.TempDir()
			t.Setenv("AZHUO_CACHE_DIR", root)
			writeViduReferencePNG(t, root, "workspace-b/private.png", color.RGBA{R: 150, A: 255})
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				calls.Add(1)
				_, _ = w.Write([]byte(`{"task_id":"unexpected-vidu-task"}`))
			}))
			defer server.Close()
			response := postViduImages(t, Video(videoSubmissionTestConfig(t, server)), server.URL, "vidu-rejected", "viduq4-preview", "omni", item.workspace, []string{item.ref})
			if response.Code != http.StatusBadRequest || calls.Load() != 0 || !strings.Contains(response.Body.String(), `"submissionRejected":true`) || !strings.Contains(response.Body.String(), item.message) {
				t.Fatalf("invalid Vidu image reached upstream: %d %s calls=%d", response.Code, response.Body.String(), calls.Load())
			}
		})
	}
}

func TestViduImagePreparationChecksWholeUpstreamPayloadSize(t *testing.T) {
	body := map[string]any{
		"images": []string{"https://cdn.example/product.png"},
		"prompt": strings.Repeat("x", 20<<20),
	}
	if err := prepareViduImageReferences(context.Background(), body, "local", false); err == nil || !strings.Contains(err.Error(), "20MB") {
		t.Fatalf("oversized Vidu JSON must be rejected explicitly: %v", err)
	}
}
