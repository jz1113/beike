package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestHealthOmitsMediaSessionWithoutToken(t *testing.T) {
	handler := New(config.Config{AccessToken: "secret", Upstream: "http://127.0.0.1:1"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/health", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("status %d", response.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["success"] != true || body["ok"] != true || body["mediaSession"] != nil {
		t.Fatalf("body %#v", body)
	}
	if response.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("health 响应必须禁止缓存")
	}
}

func TestSystemConfigPostRequiresToken(t *testing.T) {
	handler := New(config.Config{Upstream: "http://127.0.0.1:1"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/system/config", nil))
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
	handler = New(config.Config{AccessToken: "secret", NodeEnv: "development"})
	request := httptest.NewRequest(http.MethodPost, "/api/system/config", strings.NewReader(`{}`))
	request.Header.Set("x-app-token", "secret")
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "缺少 AI API Key") {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
}

func TestNativeSystemRouteRequiresToken(t *testing.T) {
	handler := New(config.Config{AccessToken: "secret", NodeEnv: "development"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/system/models/pricing", nil))
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
}

func TestPetRoutesAreRegistered(t *testing.T) {
	handler := New(config.Config{AccessToken: "secret", NodeEnv: "development"})
	list := httptest.NewRequest(http.MethodGet, "/api/pets", nil)
	list.Header.Set("x-app-token", "secret")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, list)
	if response.Code != http.StatusOK || strings.Contains(response.Body.String(), "接口不存在") {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
	importRequest := httptest.NewRequest(http.MethodPost, "/api/pets/import", strings.NewReader(`{"commands":"not-a-command"}`))
	importRequest.Header.Set("x-app-token", "secret")
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, importRequest)
	if response.Code == http.StatusNotFound || strings.Contains(response.Body.String(), "接口不存在") {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
}

func TestUnknownAPIIsJSON(t *testing.T) {
	handler := New(config.Config{Upstream: "http://127.0.0.1:1"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/not-registered", nil))
	if response.Code != http.StatusNotFound {
		t.Fatalf("status %d", response.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["success"] != false || body["error"] != "接口不存在" {
		t.Fatalf("body %#v", body)
	}
}

func TestRetiredStudioRoutesAreNotServed(t *testing.T) {
	handler := New(config.Config{AccessToken: "secret", NodeEnv: "development"})
	for _, pattern := range []string{
		"GET /api/avatar/characters", "POST /api/avatar/characters", "DELETE /api/avatar/characters/example",
		"GET /api/avatar/voices", "POST /api/avatar/voices", "DELETE /api/avatar/voices/example",
		"GET /api/avatar/fonts", "GET /api/avatar/tasks", "GET /api/avatar/tasks/example",
		"DELETE /api/avatar/tasks/example", "POST /api/avatar/render",
		"POST /api/generate/ppt-outline", "POST /api/generate/ppt-detail",
		"POST /api/generate/ppt-slide", "POST /api/generate/ppt-narration",
	} {
		t.Run(pattern, func(t *testing.T) {
			method, path, _ := strings.Cut(pattern, " ")
			request := httptest.NewRequest(method, path, nil)
			request.Header.Set("x-app-token", "secret")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusNotFound || !strings.Contains(response.Body.String(), "接口不存在") {
				t.Fatalf("status %d body %s", response.Code, response.Body.String())
			}
		})
	}
}
