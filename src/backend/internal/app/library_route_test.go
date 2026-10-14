package app

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestLibraryPutRouteIsNative(t *testing.T) {
	handler := New(config.Config{AccessToken: "secret", NodeEnv: "development", Upstream: "http://127.0.0.1:1"})
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPut, "/api/catalog/assets/library", bytes.NewBufferString(`{}`))
	request.Header.Set("x-app-token", "secret")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
}
