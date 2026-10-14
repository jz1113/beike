package generate

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestLayerDecompositionRequiresGatewayKey(t *testing.T) {
	t.Setenv("ARK_LAYER_API_KEY", "")
	t.Setenv("AI_DRAWING_API_KEY", "")
	t.Setenv("AI_API_KEY", "")
	handler := LayerDecomposition(config.Config{Upstream: "http://127.0.0.1:1"})
	body := `{"model":"seedream-v5-pro/layer-decomposition","image":"data:image/png;base64,aGVsbG8=","size":"auto"}`
	missing := httptest.NewRecorder()
	handler.ServeHTTP(missing, httptest.NewRequest(http.MethodPost, "/api/generate/layer-decomposition", strings.NewReader(body)))
	if missing.Code != http.StatusBadRequest || !strings.Contains(missing.Body.String(), "请先配置聚合平台 API 密钥") {
		t.Fatalf("key %d %s", missing.Code, missing.Body.String())
	}
	t.Setenv("ARK_LAYER_API_KEY", "official")
	previous := ModelHTTP
	ModelHTTP = func() *http.Client {
		return &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
			body := `{"data":[{"url":"https://cdn.example.com/a.png","size":"100x80"},{"url":"https://cdn.example.com/b.png","size":"100x80"}]}`
			return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
		})}
	}
	t.Cleanup(func() { ModelHTTP = previous })
	official := httptest.NewRecorder()
	handler.ServeHTTP(official, httptest.NewRequest(http.MethodPost, "/api/generate/layer-decomposition", strings.NewReader(body)))
	if official.Code != http.StatusOK || !strings.Contains(official.Body.String(), "https://cdn.example.com/a.png") || !strings.Contains(official.Body.String(), `"temporaryUrls":true`) {
		t.Fatalf("official %d %s", official.Code, official.Body.String())
	}
}

func TestLayerDecompositionRejectsWrongModel(t *testing.T) {
	handler := LayerDecomposition(config.Config{Upstream: "http://127.0.0.1:1"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/layer-decomposition", strings.NewReader(`{"model":"other","image":"data:image/png;base64,aGVsbG8=","size":"auto"}`)))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "请选择支持图层拆分的模型") {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/layer-decomposition", strings.NewReader(`{"model":"seedream-v5-pro/layer-decomposition","image":"data:image/gif;base64,aGVsbG8="}`)))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "PNG/JPEG") {
		t.Fatalf("image %d body %s", response.Code, response.Body.String())
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) { return fn(request) }
