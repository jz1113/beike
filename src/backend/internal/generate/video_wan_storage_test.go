package generate

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/storage"
)

const wanOSSStorageJSON = `{"provider":"oss","enabled":true,"persistResults":false,"endpoint":"oss-cn-beijing.aliyuncs.com","bucketName":"reference-bucket","accessKeyId":"test-key","secretAccessKey":"test-secret","apiPrefix":"\u4e0a\u4f20/"}`

type wanReferenceObjectStore struct {
	referenceObjectStore
	calls int
}

func (s *wanReferenceObjectStore) Put(ctx context.Context, cfg storage.ObjectConfig, key, contentType string, body []byte) error {
	s.calls++
	return s.referenceObjectStore.Put(ctx, cfg, key, contentType, body)
}

func setupWanStorage(t *testing.T, store *wanReferenceObjectStore, source string) string {
	t.Helper()
	root := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", root)
	t.Setenv("STORAGE_PROVIDER", "oss")
	t.Setenv("STORAGE_ENABLED", "true")
	t.Setenv("STORAGE_PERSIST_RESULTS", "false")
	for _, key := range []string{"S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "S3_BUCKET_NAME", "S3_BUCKET", "R2_BUCKET_NAME", "S3_PUBLIC_DOMAIN", "R2_PUBLIC_DOMAIN"} {
		t.Setenv(key, "")
	}
	t.Setenv("S3_REGION", "cn-beijing")
	if source == "environment" {
		for key, value := range map[string]string{
			"S3_ENDPOINT": "oss-cn-beijing.aliyuncs.com", "S3_BUCKET_NAME": "reference-bucket",
			"S3_ACCESS_KEY_ID": "test-key", "S3_SECRET_ACCESS_KEY": "test-secret", "STORAGE_API_PREFIX": "上传/",
		} {
			t.Setenv(key, value)
		}
	}
	previous := storage.Objects
	storage.Objects = store
	t.Cleanup(func() { storage.Objects = previous })
	return root
}

func writeWanVideo(t *testing.T, root, rel string) string {
	t.Helper()
	path := filepath.Join(root, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("depth-video"), 0600); err != nil {
		t.Fatal(err)
	}
	return path
}

func postWanVideo(t *testing.T, handler http.Handler, base, key, ref, workspace, source string) *httptest.ResponseRecorder {
	t.Helper()
	payload := map[string]any{
		"model": "wan3.0-video", "prompt": "按分镜展示当前商品", "ref_mode": "omni",
		"duration": 14, "resolution": "480P", "aspect_ratio": "9:16", "audio": false, "watermark": false,
		"images": []string{"https://cdn.example/product.jpg"}, "videos": []string{ref},
		"customBaseUrl": base, "customApiKey": "test-api-key", "clientTaskId": key,
	}
	if source == "body" {
		payload["storageConfig"] = json.RawMessage(wanOSSStorageJSON)
	}
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/generate/video", bytes.NewReader(body))
	req = req.WithContext(httpx.WithWorkspace(req.Context(), workspace))
	req.Header.Set("x-idempotency-key", key)
	if source == "header" {
		req.Header.Set("x-storage-config", wanOSSStorageJSON)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, req)
	return response
}

func TestWanVideoUploadsLocalReferenceWithConfiguredOSS(t *testing.T) {
	for _, source := range []string{"header", "body", "environment"} {
		t.Run(source, func(t *testing.T) {
			store := &wanReferenceObjectStore{}
			root := setupWanStorage(t, store, source)
			localPath := writeWanVideo(t, root, "assets/depth.mp4")
			var calls atomic.Int32
			submitted := make(chan map[string]any, 2)
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				var body map[string]any
				if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
					t.Errorf("invalid upstream body: %v", err)
				}
				submitted <- body
				_, _ = w.Write([]byte(`{"output":{"task_id":"wan-depth-task"}}`))
			}))
			defer server.Close()
			handler := Video(videoSubmissionTestConfig(t, server))
			response := postWanVideo(t, handler, server.URL, "wan-depth", "/storage/assets/depth.mp4", "local", source)
			if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"taskId":"wan-depth-task"`) {
				t.Fatalf("OSS reference submission failed: %d %s", response.Code, response.Body.String())
			}
			body := <-submitted
			input, _ := body["input"].(map[string]any)
			media, _ := input["media"].([]any)
			if len(media) != 2 || input["prompt"] != "按分镜展示当前商品" {
				t.Fatal("reference media or prompt was lost")
			}
			video, _ := media[0].(map[string]any)
			image, _ := media[1].(map[string]any)
			videoURL, _ := video["url"].(string)
			parsed, err := url.Parse(videoURL)
			if err != nil || parsed.Host != "reference-bucket.oss-cn-beijing.aliyuncs.com" || parsed.Path != "/"+store.key || parsed.Query().Get("x-oss-signature") == "" || parsed.Query().Get("x-oss-expires") != "86400" {
				t.Fatal("upstream reference must use a 24-hour signed OSS URL")
			}
			if video["type"] != "reference_video" || image["type"] != "reference_image" || image["url"] != "https://cdn.example/product.jpg" {
				t.Fatal("reference media types or public image URL changed")
			}
			parameters, _ := body["parameters"].(map[string]any)
			if body["model"] != "wan3.0-video" || parameters["duration"] != float64(14) || parameters["resolution"] != "480P" || parameters["ratio"] != "9:16" || parameters["audio"] != false || parameters["watermark"] != false {
				t.Fatalf("generation parameters changed: %#v", parameters)
			}
			if store.calls != 1 || calls.Load() != 1 || !strings.HasPrefix(store.key, "上传/refs/") || store.contentType != "video/mp4" || string(store.body) != "depth-video" {
				t.Fatal("local video was not uploaded once with the configured prefix")
			}
			// The original file is no longer needed when replaying a stored receipt.
			if err := os.Remove(localPath); err != nil {
				t.Fatal(err)
			}
			repeated := postWanVideo(t, handler, server.URL, "wan-depth", "/storage/assets/depth.mp4", "local", source)
			if repeated.Code != http.StatusOK || !strings.Contains(repeated.Body.String(), `"taskId":"wan-depth-task"`) || !strings.Contains(repeated.Body.String(), `"reused":true`) || store.calls != 1 || calls.Load() != 1 {
				t.Fatalf("repeated request must reuse the receipt without upload or fingerprint conflict: %d %s", repeated.Code, repeated.Body.String())
			}
		})
	}
}

func TestWanVideoRejectsUnavailableOrUnauthorizedLocalReference(t *testing.T) {
	cases := []struct {
		name, source, ref, workspace, message string
		uploadError                           bool
		oversized                             bool
	}{
		{name: "missing configuration", ref: "/storage/assets/depth.mp4", workspace: "local", message: "未配置对象存储"},
		{name: "upload failed", source: "header", ref: "/storage/assets/depth.mp4", workspace: "local", message: "上传参考视频失败", uploadError: true},
		{name: "another workspace", source: "body", ref: "/storage/workspace-b/depth.mp4", workspace: "workspace-a", message: "无权读取"},
		{name: "path traversal", source: "header", ref: "/storage/workspace-a/../workspace-b/depth.mp4", workspace: "workspace-a"},
		{name: "encoded traversal", source: "header", ref: "/storage/workspace-a/%252e%252e/workspace-b/depth.mp4", workspace: "workspace-a"},
		{name: "oversized", source: "header", ref: "/storage/assets/depth.mp4", workspace: "local", message: "32MB", oversized: true},
	}
	for _, item := range cases {
		t.Run(item.name, func(t *testing.T) {
			store := &wanReferenceObjectStore{}
			if item.uploadError {
				store.err = errors.New("test upload failure")
			}
			root := setupWanStorage(t, store, "")
			path := writeWanVideo(t, root, "assets/depth.mp4")
			writeWanVideo(t, root, "workspace-b/depth.mp4")
			if item.oversized {
				if err := os.Truncate(path, (32<<20)+1); err != nil {
					t.Fatal(err)
				}
			}
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				calls.Add(1)
				_, _ = w.Write([]byte(`{"output":{"task_id":"unexpected-task"}}`))
			}))
			defer server.Close()
			response := postWanVideo(t, Video(videoSubmissionTestConfig(t, server)), server.URL, "wan-rejected", item.ref, item.workspace, item.source)
			if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), `"submissionRejected":true`) || !strings.Contains(response.Body.String(), item.message) || calls.Load() != 0 {
				t.Fatalf("invalid local reference must be rejected before upstream submission: %d %s calls=%d", response.Code, response.Body.String(), calls.Load())
			}
			wantUploads := 0
			if item.uploadError {
				wantUploads = 1
			}
			if store.calls != wantUploads {
				t.Fatalf("unexpected upload attempts: got %d want %d", store.calls, wantUploads)
			}
		})
	}
}
