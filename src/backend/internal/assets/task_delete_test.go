package assets

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestClearAllTasksRequiresAdminInProduction(t *testing.T) {
	handler := assetTasksDeleteHandler(config.Config{NodeEnv: "production", AccessToken: "secret"})
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodDelete, "/api/assets/tasks", bytes.NewBufferString(`{"clearAll":true}`))
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodDelete, "/api/assets/tasks", nil))
	if response.Code != http.StatusBadRequest {
		t.Fatalf("missing status %d body %s", response.Code, response.Body.String())
	}
}
