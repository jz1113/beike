package catalog

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestStyleCreateRequiresName(t *testing.T) {
	handler := styleRecipesPostHandler(config.Config{Upstream: "http://127.0.0.1:1"})
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/catalog/styles", bytes.NewBufferString(`{"name":""}`))
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
}
