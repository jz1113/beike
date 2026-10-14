package assets

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestAssetPerformanceRejectsUnknownType(t *testing.T) {
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/catalog/assets/video/asset-1/performance", nil)
	request.SetPathValue("type", "video")
	request.SetPathValue("id", "asset-1")
	assetPerformanceHandler(config.Config{}).ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "资产类型不正确") {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
}
