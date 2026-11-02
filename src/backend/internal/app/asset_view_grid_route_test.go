package app

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestAssetViewGridRouteRequiresAuthAndValidInput(t *testing.T) {
	handler := New(config.Config{AccessToken: "secret", NodeEnv: "development"})
	for _, authenticated := range []bool{false, true} {
		request := httptest.NewRequest(http.MethodPost, "/api/sales/asset-view-grid", strings.NewReader(`{}`))
		want := http.StatusUnauthorized
		if authenticated {
			request.Header.Set("x-app-token", "secret")
			want = http.StatusBadRequest
		}
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != want {
			t.Fatalf("authenticated=%v status=%d want=%d body=%s", authenticated, response.Code, want, response.Body.String())
		}
	}
}
