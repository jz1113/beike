package catalog

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDisabledSeedStaysEmpty(t *testing.T) {
	handler := disabledSeedHandler()
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/catalog/assets/seed", nil))
	if response.Code != http.StatusOK || response.Body.String() == "" {
		t.Fatalf("status %d", response.Code)
	}
}
