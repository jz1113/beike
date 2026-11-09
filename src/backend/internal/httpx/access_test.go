package httpx

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestAuthorizedAndRequestToken(t *testing.T) {
	devCfg := config.Config{NodeEnv: "development", AccessToken: "secret-access", AdminToken: "secret-admin"}
	prodCfg := config.Config{NodeEnv: "production", AccessToken: "secret-access", AdminToken: "secret-admin"}

	reqHeader := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	reqHeader.Header.Set("x-app-token", "secret-access")
	if !Authorized(reqHeader, prodCfg) {
		t.Fatal("expected x-app-token to authorize in production")
	}

	reqBearer := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	reqBearer.Header.Set("Authorization", "Bearer secret-admin")
	if !Authorized(reqBearer, prodCfg) {
		t.Fatal("expected Bearer admin token to authorize in production")
	}

	reqCookie := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	reqCookie.AddCookie(&http.Cookie{Name: "app_token", Value: "secret-access"})
	if !Authorized(reqCookie, prodCfg) {
		t.Fatal("expected app_token cookie to authorize")
	}

	reqLocalFallback := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	reqLocalFallback.Header.Set("x-access-token", "azhuo-local-dev")
	if !Authorized(reqLocalFallback, devCfg) {
		t.Fatal("expected local dev fallback token to authorize in development")
	}
	if Authorized(reqLocalFallback, prodCfg) {
		t.Fatal("expected local dev fallback token to be rejected in production")
	}
}

func TestResolveWorkspaceAndContext(t *testing.T) {
	devCfg := config.Config{NodeEnv: "development"}
	prodCfg := config.Config{NodeEnv: "production"}

	reqDev := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	if ws, ok := ResolveWorkspace(reqDev, devCfg); !ok || ws != "local" {
		t.Fatalf("expected local workspace in dev, got %q (%v)", ws, ok)
	}

	reqProdShort := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	reqProdShort.Header.Set("x-workspace-token", "too-short")
	if _, ok := ResolveWorkspace(reqProdShort, prodCfg); ok {
		t.Fatal("expected short workspace token to be rejected in production")
	}

	validSecret := strings.Repeat("w", 32)
	reqProdValid := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	reqProdValid.Header.Set("x-workspace-token", validSecret)
	ws, ok := ResolveWorkspace(reqProdValid, prodCfg)
	if !ok || len(ws) != 64 {
		t.Fatalf("expected 64-char sha256 workspace id, got %q (%v)", ws, ok)
	}

	reqWithCtx := reqProdValid.WithContext(WithWorkspace(reqProdValid.Context(), ws))
	if got := WorkspaceFrom(reqWithCtx); got != ws {
		t.Fatalf("expected WorkspaceFrom to return %q, got %q", ws, got)
	}
}
