package generate

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/storage"
)

func TestSeedancePrecheckUsesConfiguredOSSForLocalVideo(t *testing.T) {
	for _, source := range []string{"header", "body"} {
		t.Run(source, func(t *testing.T) {
			seedanceAssetCache = sync.Map{}
			root := t.TempDir()
			t.Setenv("AZHUO_CACHE_DIR", root)
			t.Setenv("STORAGE_PROVIDER", "oss")
			for _, key := range []string{"S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"} {
				t.Setenv(key, "")
			}
			if err := os.MkdirAll(filepath.Join(root, "assets"), 0700); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(root, "assets", "depth.mp4"), []byte("depth-video"), 0600); err != nil {
				t.Fatal(err)
			}
			store := &referenceObjectStore{}
			previous := storage.Objects
			storage.Objects = store
			t.Cleanup(func() { storage.Objects = previous })
			registeredURL := make(chan string, 1)
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var body struct {
					URL string `json:"url"`
				}
				_ = json.NewDecoder(r.Body).Decode(&body)
				registeredURL <- body.URL
				_, _ = w.Write([]byte(`{"code":0,"data":{"assetId":"depth-ready","status":"Active"}}`))
			}))
			defer server.Close()
			cfg := videoSubmissionTestConfig(t, server)
			storageJSON := json.RawMessage(`{"provider":"oss","enabled":true,"persistResults":false,"endpoint":"oss-cn-beijing.aliyuncs.com","bucketName":"reference-bucket","accessKeyId":"test-key","secretAccessKey":"test-secret","apiPrefix":"\u4e0a\u4f20/"}`)
			request := func(configured bool) seedancePrecheckResultItem {
				t.Helper()
				payload := map[string]any{
					"items":         []map[string]string{{"url": "/storage/assets/depth.mp4", "mediaType": "depth-video"}},
					"customBaseUrl": server.URL, "customApiKey": "test-api-key",
				}
				if configured && source == "body" {
					payload["storageConfig"] = storageJSON
				}
				raw, _ := json.Marshal(payload)
				req := httptest.NewRequest(http.MethodPost, "/api/generate/seedance/precheck", bytes.NewReader(raw))
				req = req.WithContext(httpx.WithWorkspace(req.Context(), "local"))
				if configured && source == "header" {
					req.Header.Set("x-storage-config", string(storageJSON))
				}
				res := httptest.NewRecorder()
				SeedancePrecheck(cfg).ServeHTTP(res, req)
				var parsed struct {
					Results []seedancePrecheckResultItem `json:"results"`
				}
				if err := json.Unmarshal(res.Body.Bytes(), &parsed); err != nil || res.Code != http.StatusOK || len(parsed.Results) != 1 {
					t.Fatalf("unexpected response: %d %s", res.Code, res.Body.String())
				}
				return parsed.Results[0]
			}
			if result := request(false); result.Status != "skipped" || !strings.Contains(result.Error, "未配置对象存储") {
				t.Fatalf("expected missing configuration before save: %+v", result)
			}
			if result := request(true); result.Status != "passed" || result.AssetURI != "asset://depth-ready" || result.Error != "" {
				t.Fatalf("saved OSS configuration did not recover precheck: %+v", result)
			}
			parsedURL, err := url.Parse(<-registeredURL)
			if err != nil || parsedURL.Host != "reference-bucket.oss-cn-beijing.aliyuncs.com" || parsedURL.Query().Get("x-oss-signature") == "" {
				t.Fatal("precheck did not register a signed OSS reference URL")
			}
			if !strings.HasPrefix(store.key, "上传/refs/") || string(store.body) != "depth-video" {
				t.Fatal("precheck did not upload the local video with the saved prefix")
			}
		})
	}
}
