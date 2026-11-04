package generate

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"image/color"
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

func postGrokMedia(t *testing.T, handler http.Handler, base, key, mode, workspace string, images []string) *httptest.ResponseRecorder {
	t.Helper()
	body, err := json.Marshal(map[string]any{
		"model": "grok-imagine-video-1.5", "prompt": "保持商品、人物与场景参考顺序", "preserve_prompt": true,
		"ref_mode": mode, "images": images, "duration": 5, "resolution": "720P", "aspect_ratio": "9:16",
		"customBaseUrl": base, "customApiKey": "test-key", "clientTaskId": key,
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

func TestGrokSubmitsLocalImagesInlineAndPreservesReferenceOrder(t *testing.T) {
	for _, mode := range []string{"omni", "first_frame", "first_last_frame"} {
		t.Run(mode, func(t *testing.T) {
			root := t.TempDir()
			t.Setenv("AZHUO_CACHE_DIR", root)
			t.Setenv("STORAGE_ENABLED", "false")
			firstPath, first := writeViduReferencePNG(t, root, "local/first.png", color.RGBA{R: 180, A: 255})
			_, last := writeViduReferencePNG(t, root, "local/last.png", color.RGBA{B: 180, A: 255})
			firstData := "data:image/png;base64," + base64.StdEncoding.EncodeToString(first)
			lastData := "data:image/png;base64," + base64.StdEncoding.EncodeToString(last)
			refs := []string{" /storage/local/first.png "}
			if mode == "omni" {
				refs = append(refs, "https://cdn.example/product.jpg?signature=private", "/storage/local/last.png")
			} else if mode == "first_last_frame" {
				refs = append(refs, "/storage/local/last.png")
			}
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				var sent map[string]json.RawMessage
				if err := json.NewDecoder(r.Body).Decode(&sent); err != nil {
					t.Error(err)
				}
				var prompt string
				_ = json.Unmarshal(sent["prompt"], &prompt)
				if r.URL.Path != "/xai/v1/videos/generations" || prompt != "保持商品、人物与场景参考顺序" {
					t.Errorf("Grok request changed route or prompt: %s %s", r.URL.Path, prompt)
				}
				if mode == "omni" {
					var got []map[string]string
					_ = json.Unmarshal(sent["reference_images"], &got)
					want := []map[string]string{{"url": firstData}, {"url": refs[1]}, {"url": lastData}}
					if !reflect.DeepEqual(got, want) {
						t.Error("Grok reference images were not prepared in original order")
					}
				} else {
					var image, lastFrame map[string]string
					_ = json.Unmarshal(sent["image"], &image)
					_ = json.Unmarshal(sent["last_frame"], &lastFrame)
					if image["url"] != firstData || (mode == "first_last_frame" && lastFrame["url"] != lastData) {
						t.Error("Grok frame images were not prepared")
					}
				}
				_, _ = w.Write([]byte(`{"request_id":"grok-local-images"}`))
			}))
			defer server.Close()
			handler := Video(videoSubmissionTestConfig(t, server))
			response := postGrokMedia(t, handler, server.URL, "grok-local-images", mode, "local", refs)
			if response.Code != http.StatusOK || calls.Load() != 1 || !strings.Contains(response.Body.String(), `"taskId":"grok-local-images"`) {
				t.Fatalf("Grok local image submission failed: %d %s calls=%d", response.Code, response.Body.String(), calls.Load())
			}
			preserved, err := os.ReadFile(firstPath)
			if err != nil || !bytes.Equal(first, preserved) {
				t.Fatal("Grok preparation modified the saved source image", err)
			}
			if err := os.Remove(firstPath); err != nil {
				t.Fatal(err)
			}
			replayed := postGrokMedia(t, handler, server.URL, "grok-local-images", mode, "local", refs)
			if replayed.Code != http.StatusOK || calls.Load() != 1 || !strings.Contains(replayed.Body.String(), `"reused":true`) {
				t.Fatalf("Grok replay reread inputs or submitted another task: %d %s", replayed.Code, replayed.Body.String())
			}
		})
	}
}

func TestGrokRejectsUnreadableImagesBeforeUpstreamWithoutLeakingPaths(t *testing.T) {
	for _, ref := range []string{"/storage/workspace-b/private.png", "/storage/workspace-a/missing.png", "/storage/workspace-a/%252e%252e/workspace-b/private.png", "blob:https://example.com/private", "file:///private/reference.png"} {
		t.Run(ref, func(t *testing.T) {
			root := t.TempDir()
			t.Setenv("AZHUO_CACHE_DIR", root)
			writeViduReferencePNG(t, root, "workspace-b/private.png", color.RGBA{R: 150, A: 255})
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				_, _ = w.Write([]byte(`{"request_id":"unexpected"}`))
			}))
			defer server.Close()
			response := postGrokMedia(t, Video(videoSubmissionTestConfig(t, server)), server.URL, "grok-rejected", "omni", "workspace-a", []string{ref})
			if response.Code != http.StatusBadRequest || calls.Load() != 0 || !strings.Contains(response.Body.String(), `"submissionRejected":true`) {
				t.Fatalf("invalid image reached upstream: %d %s calls=%d", response.Code, response.Body.String(), calls.Load())
			}
			if strings.Contains(response.Body.String(), root) || strings.Contains(response.Body.String(), "private.png") {
				t.Fatal("Grok image error exposed a filesystem or private asset path")
			}
		})
	}
}

func TestGrokPreparesLocalMP4WithoutObjectStorage(t *testing.T) {
	root := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", root)
	path := filepath.Join(root, "workspace-a", "clip.mp4")
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		t.Fatal(err)
	}
	clip := []byte{0, 0, 0, 20, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm', 0, 0, 0, 0, 'i', 's', 'o', 'm'}
	if err := os.WriteFile(path, clip, 0600); err != nil {
		t.Fatal(err)
	}
	body := map[string]any{"video": map[string]string{"url": "/storage/workspace-a/clip.mp4"}}
	if err := prepareGrokMedia(context.Background(), body, "workspace-a", true); err != nil {
		t.Fatal(err)
	}
	want := "data:video/mp4;base64," + base64.StdEncoding.EncodeToString(clip)
	if body["video"].(map[string]string)["url"] != want {
		t.Fatal("Grok local MP4 was not inlined")
	}
	preserved, err := os.ReadFile(path)
	if err != nil || !bytes.Equal(clip, preserved) {
		t.Fatal("Grok preparation modified the saved source video", err)
	}
	for _, ref := range []string{"https://cdn.example/clip.mp4?signature=private", want} {
		body = map[string]any{"video": map[string]any{"url": ref}}
		if err := prepareGrokMedia(context.Background(), body, "workspace-a", true); err != nil || body["video"].(map[string]any)["url"] != ref {
			t.Fatal("Grok changed a remote or inline video reference", err)
		}
	}
	body = map[string]any{"image": map[string]string{"file_id": "image-file"}, "video": map[string]string{"file_id": "video-file"}}
	if err := prepareGrokMedia(context.Background(), body, "workspace-a", true); err != nil {
		t.Fatal("provider file references must remain intact", err)
	}
}

func TestGrokLocalVideoRejectsOtherWorkspacesAndInvalidFormats(t *testing.T) {
	root := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", root)
	for name, body := range map[string][]byte{"private.mp4": []byte("not an mp4"), "private.mov": []byte("not an mp4")} {
		path := filepath.Join(root, "workspace-a", name)
		if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, body, 0600); err != nil {
			t.Fatal(err)
		}
	}
	for _, ref := range []string{"/storage/workspace-b/private.mp4", "/storage/workspace-a/private.mp4", "/storage/workspace-a/private.mov", "/storage/workspace-a/missing.mp4", "file:///private/clip.mp4", "blob:https://example.com/private"} {
		body := map[string]any{"video": map[string]string{"url": ref}}
		err := prepareGrokMedia(context.Background(), body, "workspace-a", true)
		if err == nil {
			t.Fatalf("invalid Grok video reference accepted: %s", ref)
		}
		if strings.Contains(err.Error(), root) || strings.Contains(err.Error(), "private.mp4") {
			t.Fatal("Grok video error exposed a filesystem or private asset path")
		}
	}
}
