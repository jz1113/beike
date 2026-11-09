package generate

import (
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

const seedanceCacheTestImage = "https://cdn.example/product.png"

func seedanceCacheTestRequest(t *testing.T, handler http.Handler, path, base, key, model, taskID string) *httptest.ResponseRecorder {
	t.Helper()
	body := map[string]any{"customBaseUrl": base, "customApiKey": key, "model": model}
	if taskID == "" {
		body["items"] = []map[string]string{{"url": seedanceCacheTestImage, "mediaType": "image"}}
	} else {
		body["prompt"], body["clientTaskId"] = "参考图片1展示商品", taskID
		body["images"] = []string{seedanceCacheTestImage}
		body["duration"], body["resolution"], body["aspect_ratio"], body["ref_mode"] = 5, "720P", "9:16", "omni"
	}
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest(http.MethodPost, path, strings.NewReader(string(raw)))
	r = r.WithContext(httpx.WithWorkspace(r.Context(), "local"))
	if taskID != "" {
		r.Header.Set("x-idempotency-key", taskID)
	}
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	return w
}

func seedanceCacheTestPassed(t *testing.T, response *httptest.ResponseRecorder) {
	t.Helper()
	var data struct {
		Success bool                         `json:"success"`
		Results []seedancePrecheckResultItem `json:"results"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &data); err != nil || response.Code != http.StatusOK || !data.Success || len(data.Results) != 1 || data.Results[0].Status != "passed" {
		t.Fatalf("expected passed precheck, got %d %s", response.Code, response.Body.String())
	}
}

func seedanceCacheTestBody(t *testing.T, r *http.Request) map[string]any {
	t.Helper()
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		t.Errorf("decode upstream request: %v", err)
	}
	return body
}

func seedanceCacheTestAsset(w http.ResponseWriter, id string) {
	_ = json.NewEncoder(w).Encode(map[string]any{"code": 0, "data": map[string]string{"assetId": id, "status": "Active"}})
}

func seedanceCacheTestSubmittedImage(body map[string]any) string {
	content, _ := body["content"].([]any)
	for _, raw := range content {
		item, _ := raw.(map[string]any)
		if item["type"] == "image_url" {
			node, _ := item["image_url"].(map[string]any)
			url, _ := node["url"].(string)
			return url
		}
	}
	return ""
}

func TestSeedanceAssetCacheSeparatesCredentialAndModelRoutes(t *testing.T) {
	for _, change := range []string{"credential", "model"} {
		t.Run(change, func(t *testing.T) {
			seedanceAssetCache = sync.Map{}
			const firstModel = "doubao-seedance-2.0-mini"
			secondModel, secondKey := firstModel, "test-key-b"
			if change == "model" {
				secondModel, secondKey = "doubao-seedance-2.5", "test-key-a"
			}
			var createCalls, submitCalls int
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				body := seedanceCacheTestBody(t, r)
				switch r.URL.Path {
				case "/seedance/v3/assets/create":
					createCalls++
					expectedKey := "test-key-a"
					if createCalls == 2 {
						expectedKey = secondKey
					}
					if r.Header.Get("Authorization") != "Bearer "+expectedKey || body["url"] != seedanceCacheTestImage {
						t.Error("asset registration used the wrong credentials or source")
					}
					seedanceCacheTestAsset(w, fmt.Sprintf("route-%d", createCalls))
				case "/seedance/v3/assets/query":
					id, _ := body["assetId"].(string)
					seedanceCacheTestAsset(w, id)
				case "/seedance/v3/contents/generations/tasks":
					submitCalls++
					if got := seedanceCacheTestSubmittedImage(body); got != "asset://route-2" {
						t.Errorf("generation reused another route's asset: %q", got)
					}
					_, _ = w.Write([]byte(`{"id":"route-video"}`))
				default:
					t.Errorf("unexpected upstream path: %s", r.URL.Path)
					http.NotFound(w, r)
				}
			}))
			defer server.Close()
			cfg := videoSubmissionTestConfig(t, server)
			seedanceCacheTestPassed(t, seedanceCacheTestRequest(t, SeedancePrecheck(cfg), "/api/generate/seedance/precheck", server.URL, "test-key-a", firstModel, ""))
			res := seedanceCacheTestRequest(t, Video(cfg), "/api/generate/video", server.URL, secondKey, secondModel, "different-"+change)
			if res.Code != http.StatusOK || !strings.Contains(res.Body.String(), `"taskId":"route-video"`) || createCalls != 2 || submitCalls != 1 {
				t.Fatalf("route isolation failed: status=%d create=%d submit=%d body=%s", res.Code, createCalls, submitCalls, res.Body.String())
			}
		})
	}
}

func TestSeedanceRecreatesMissingCachedAssetBeforeSingleGeneration(t *testing.T) {
	for _, failure := range []struct {
		name   string
		status int
		body   string
	}{
		{"http-404", http.StatusNotFound, `{"code":"1007","message":"The specified asset was not found"}`},
		{"string-code", http.StatusOK, `{"code":"1007","message":"The specified asset was not found"}`},
	} {
		t.Run(failure.name, func(t *testing.T) {
			seedanceAssetCache = sync.Map{}
			const model = "doubao-seedance-2.5"
			var createCalls, queryCalls, submitCalls int
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				body := seedanceCacheTestBody(t, r)
				switch r.URL.Path {
				case "/seedance/v3/assets/create":
					createCalls++
					if body["url"] != seedanceCacheTestImage {
						t.Error("re-registration lost the original image")
					}
					seedanceCacheTestAsset(w, fmt.Sprintf("asset-%d", createCalls))
				case "/seedance/v3/assets/query":
					queryCalls++
					if body["assetId"] == "asset-1" {
						w.WriteHeader(failure.status)
						_, _ = w.Write([]byte(failure.body))
						return
					}
					seedanceCacheTestAsset(w, "asset-2")
				case "/seedance/v3/contents/generations/tasks":
					submitCalls++
					if got := seedanceCacheTestSubmittedImage(body); got != "asset://asset-2" {
						t.Errorf("generation received a missing cached asset: %q", got)
					}
					_, _ = w.Write([]byte(`{"id":"refreshed-video"}`))
				default:
					t.Errorf("unexpected upstream path: %s", r.URL.Path)
					http.NotFound(w, r)
				}
			}))
			defer server.Close()
			cfg := videoSubmissionTestConfig(t, server)
			seedanceCacheTestPassed(t, seedanceCacheTestRequest(t, SeedancePrecheck(cfg), "/api/generate/seedance/precheck", server.URL, "test-key", model, ""))
			handler := Video(cfg)
			for range 2 {
				res := seedanceCacheTestRequest(t, handler, "/api/generate/video", server.URL, "test-key", model, "refresh-"+failure.name)
				if res.Code != http.StatusOK || !strings.Contains(res.Body.String(), `"taskId":"refreshed-video"`) {
					t.Fatalf("expected refreshed task receipt, got %d %s", res.Code, res.Body.String())
				}
			}
			if createCalls != 2 || queryCalls == 0 || submitCalls != 1 {
				t.Fatalf("expected one refresh and one paid submission despite receipt replay: create=%d query=%d submit=%d", createCalls, queryCalls, submitCalls)
			}
		})
	}
}

func TestSeedanceCachedAssetFailureDoesNotBypassSafetyOrAuthentication(t *testing.T) {
	for _, failure := range []struct {
		name   string
		status int
		body   string
	}{
		{"sensitive", http.StatusOK, `{"code":"1501","message":"Input material may contain sensitive content: imageUrls[0]","data":{"status":"Failed"}}`},
		{"authentication", http.StatusUnauthorized, `{"code":"401","message":"Invalid API key","data":{"status":"Active"}}`},
	} {
		t.Run(failure.name, func(t *testing.T) {
			seedanceAssetCache = sync.Map{}
			const model = "doubao-seedance-2.0-mini"
			var createCalls, queryCalls, submitCalls int
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				_ = seedanceCacheTestBody(t, r)
				switch r.URL.Path {
				case "/seedance/v3/assets/create":
					createCalls++
					seedanceCacheTestAsset(w, "reviewed-image")
				case "/seedance/v3/assets/query":
					queryCalls++
					w.WriteHeader(failure.status)
					_, _ = w.Write([]byte(failure.body))
				case "/seedance/v3/contents/generations/tasks":
					submitCalls++
					_, _ = w.Write([]byte(`{"id":"must-not-submit"}`))
				default:
					t.Errorf("unexpected upstream path: %s", r.URL.Path)
					http.NotFound(w, r)
				}
			}))
			defer server.Close()
			cfg := videoSubmissionTestConfig(t, server)
			seedanceCacheTestPassed(t, seedanceCacheTestRequest(t, SeedancePrecheck(cfg), "/api/generate/seedance/precheck", server.URL, "test-key", model, ""))
			res := seedanceCacheTestRequest(t, Video(cfg), "/api/generate/video", server.URL, "test-key", model, "reject-"+failure.name)
			if res.Code != http.StatusBadRequest || createCalls != 1 || queryCalls == 0 || submitCalls != 0 {
				t.Fatalf("cached failure must reject without registering again or generating: status=%d create=%d query=%d submit=%d body=%s", res.Code, createCalls, queryCalls, submitCalls, res.Body.String())
			}
		})
	}
}

func TestSeedanceAssetErrorsNeverBecomeActive(t *testing.T) {
	for _, item := range []struct {
		name, operation, body string
		status                int
		want                  error
	}{
		{"missing route or asset", "query", "404 page not found", 404, errSeedanceAssetUnavailable},
		{"unsupported query", "query", `{"message":"method not allowed"}`, 405, errSeedanceAssetQueryUnsupported},
		{"unimplemented query", "query", `{"code":501}`, 501, errSeedanceAssetQueryUnsupported},
		{"unauthorized Active", "query", `{"data":{"status":"Active"}}`, 401, nil},
		{"string sensitive code", "query", `{"code":"1501","data":{"status":"Active"}}`, 200, nil},
		{"nested access failure", "query", `{"code":0,"error":{"code":"403","message":"asset was not found"},"data":{"status":"EXPIRED"}}`, 200, nil},
		{"server error Active", "query", `{"data":{"status":"Active"}}`, 500, nil},
		{"create string failure Active", "create", `{"code":"1501","data":{"assetId":"invalid","status":"Active"}}`, 200, nil},
		{"create invalid auth response", "create", "Unauthorized", 401, nil},
	} {
		t.Run(item.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/seedance/v3/assets/"+item.operation {
					t.Errorf("unexpected path: %s", r.URL.Path)
				}
				w.WriteHeader(item.status)
				_, _ = w.Write([]byte(item.body))
			}))
			t.Cleanup(server.Close)
			previous := gateway.ModelHTTP
			gateway.ModelHTTP = func() *http.Client { return server.Client() }
			t.Cleanup(func() { gateway.ModelHTTP = previous })
			scope := seedanceAssetScope{base: server.URL, apiKey: "test-key", model: "doubao-seedance-2.5"}
			ctx, cancel := context.WithTimeout(t.Context(), 200*time.Millisecond)
			defer cancel()
			var uri string
			var err error
			if item.operation == "create" {
				uri, err = registerSeedanceAsset(ctx, scope, "https://cdn.example/image.png", "Image")
			} else {
				uri, err = ensureSeedanceAssetActive(ctx, scope, "old-asset", "Image")
			}
			if uri != "" || err == nil {
				t.Fatalf("error response became usable: uri=%q err=%v", uri, err)
			}
			if item.want != nil && !errors.Is(err, item.want) {
				t.Fatalf("wrong error classification: got=%v want=%v", err, item.want)
			}
			if item.want == nil && errors.Is(err, errSeedanceAssetUnavailable) {
				t.Fatalf("authorization or compliance error would trigger asset recreation: %v", err)
			}
		})
	}
}
