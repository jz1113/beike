package generate

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/gateway"
)

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
