package generate

import (
	"context"
	"encoding/json"
	"fmt"
	"image/color"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
)

func seedanceSourceTestGateway(t *testing.T, handler http.HandlerFunc) config.Config {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	cfg := videoSubmissionTestConfig(t, server)
	target, _ := url.Parse(server.URL)
	client := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Hostname() != "ai.comfly.org" && r.URL.Hostname() != "other.example.test" {
			return nil, fmt.Errorf("unexpected test destination: %s", r.URL.Hostname())
		}
		local := r.Clone(r.Context())
		address := *r.URL
		address.Scheme, address.Host = target.Scheme, target.Host
		local.URL = &address
		return server.Client().Transport.RoundTrip(local)
	})}
	gateway.ModelHTTP = func() *http.Client { return client }
	return cfg
}

func seedanceSourceTestPrepare(base, model, ref, kind string) (string, error) {
	field := kind + "_url"
	body := map[string]any{"content": []map[string]any{{"type": field, field: map[string]string{"url": ref}}}}
	payload := map[string]json.RawMessage{"model": json.RawMessage(`"` + model + `"`)}
	err := prepareSeedanceMedia(context.Background(), "", base, "test-key", body, "local", false, nil, payload)
	content := body["content"].([]map[string]any)
	return content[0][field].(map[string]string)["url"], err
}

func TestSeedanceComfly25UsesReviewedSourceURLsAndKeepsExplicitAssets(t *testing.T) {
	for _, item := range []struct {
		name, base, model, kind, ref, want string
	}{
		{"image", "https://ai.comfly.org", "doubao-seedance-2.5", "image", "https://cdn.example/product.png", "https://cdn.example/product.png"},
		{"video", "https://ai.comfly.org", "doubao-seedance-2.5", "video", "https://cdn.example/action.mp4", "https://cdn.example/action.mp4"},
		{"explicit image asset", "https://ai.comfly.org", "doubao-seedance-2.5", "image", "asset://explicit", "asset://explicit"},
		{"explicit video asset", "https://ai.comfly.org", "doubao-seedance-2.5", "video", "asset://explicit", "asset://explicit"},
		{"mini", "https://ai.comfly.org", "doubao-seedance-2.0-mini", "image", "https://cdn.example/product.png", "asset://reviewed"},
		{"other gateway", "https://other.example.test", "doubao-seedance-2.5", "image", "https://cdn.example/product.png", "asset://reviewed"},
	} {
		t.Run(item.name, func(t *testing.T) {
			seedanceAssetCache = sync.Map{}
			var createCalls, queryCalls int
			seedanceSourceTestGateway(t, func(w http.ResponseWriter, r *http.Request) {
				body := seedanceCacheTestBody(t, r)
				switch r.URL.Path {
				case "/seedance/v3/assets/create":
					createCalls++
					if body["url"] != item.ref {
						t.Error("compliance registration lost the source URL")
					}
					seedanceCacheTestAsset(w, "reviewed")
				case "/seedance/v3/assets/query":
					queryCalls++
					id, _ := body["assetId"].(string)
					seedanceCacheTestAsset(w, id)
				default:
					t.Errorf("unexpected upstream path: %s", r.URL.Path)
					http.NotFound(w, r)
				}
			})
			for range 2 {
				got, err := seedanceSourceTestPrepare(item.base, item.model, item.ref, item.kind)
				if err != nil || got != item.want {
					t.Fatalf("unexpected prepared media: got=%q want=%q err=%v", got, item.want, err)
				}
			}
			wantCreates, wantQueries := 1, 1
			if strings.HasPrefix(item.ref, "asset://") {
				wantCreates, wantQueries = 0, 2
			}
			if createCalls != wantCreates || queryCalls != wantQueries {
				t.Fatalf("compliance check or cache reuse skipped: create=%d query=%d", createCalls, queryCalls)
			}
		})
	}
}

func TestSeedanceComfly25LocalMediaUploadsSignedSourceAfterPrecheck(t *testing.T) {
	for _, kind := range []string{"image", "video"} {
		t.Run(kind, func(t *testing.T) {
			seedanceAssetCache = sync.Map{}
			store := &wanReferenceObjectStore{}
			root := setupWanStorage(t, store, "environment")
			ref := "/storage/local/product.png"
			if kind == "image" {
				writeViduReferencePNG(t, root, "local/product.png", color.RGBA{R: 150, A: 255})
			} else {
				ref = "/storage/local/action.mp4"
				writeWanVideo(t, root, "local/action.mp4")
			}
			var registered []string
			cfg := seedanceSourceTestGateway(t, func(w http.ResponseWriter, r *http.Request) {
				body := seedanceCacheTestBody(t, r)
				if r.URL.Path == "/seedance/v3/assets/create" {
					source, _ := body["url"].(string)
					registered = append(registered, source)
					seedanceCacheTestAsset(w, "local-reviewed")
					return
				}
				if r.URL.Path != "/seedance/v3/assets/query" {
					t.Errorf("unexpected upstream path: %s", r.URL.Path)
				}
				seedanceCacheTestAsset(w, "local-reviewed")
			})
			const base, model = "https://ai.comfly.org", "doubao-seedance-2.5"
			scope := seedanceAssetScope{base: base, apiKey: "test-key", model: model, workspace: "local"}
			result := precheckSingleSeedanceAsset(context.Background(), cfg, scope, "local", false, resolveVideoStorageConfig(nil, nil), seedancePrecheckRequestItem{URL: ref, MediaType: kind}, 0)
			if result.Status != "passed" || result.AssetURI != "asset://local-reviewed" {
				t.Fatalf("local precheck did not populate its asset alias: %+v", result)
			}
			got, err := seedanceSourceTestPrepare(base, model, ref, kind)
			parsed, parseErr := url.Parse(got)
			if err != nil || parseErr != nil || parsed.Scheme != "https" || parsed.Host != "reference-bucket.oss-cn-beijing.aliyuncs.com" || parsed.Query().Get("x-oss-signature") == "" {
				t.Fatalf("generation must receive a signed HTTP source after precheck: got=%q err=%v", got, err)
			}
			if store.calls != 2 || len(registered) != 2 || got != registered[1] {
				t.Fatalf("cached local alias prevented fresh source upload: uploads=%d registrations=%d", store.calls, len(registered))
			}
		})
	}
}

func TestSeedanceComfly25SourceURLStillRejectsSensitiveMedia(t *testing.T) {
	seedanceAssetCache = sync.Map{}
	var calls int
	seedanceSourceTestGateway(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/seedance/v3/assets/create" {
			t.Errorf("unexpected upstream path: %s", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"code":"1501","message":"Input material may contain sensitive content: imageUrls[0]","data":{"status":"Failed"}}`))
	})
	_, err := seedanceSourceTestPrepare("https://ai.comfly.org", "doubao-seedance-2.5", seedanceCacheTestImage, "image")
	if err == nil || calls != 1 {
		t.Fatalf("source URL transport bypassed compliance rejection: err=%v calls=%d", err, calls)
	}
}
