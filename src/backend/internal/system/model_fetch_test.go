package system

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestModelFetchUsesApprovedFallback(t *testing.T) {
	status, body := fetchModelCatalog(context.Background(), config.Config{Root: repoRoot(t)}, httptest.NewRequest(http.MethodPost, "/", nil), map[string]any{}, nil)
	models, _ := body["models"].([]catalogModel)
	if status != http.StatusOK || body["isFallback"] != true || !containsModel(models, "gpt-image-2") {
		t.Fatalf("status %d count %v", status, body["count"])
	}
	status, body = fetchModelCatalog(context.Background(), config.Config{Root: repoRoot(t)}, httptest.NewRequest(http.MethodPost, "/", nil), map[string]any{"provider": "openai"}, nil)
	if status != http.StatusBadRequest {
		t.Fatalf("openai %d %#v", status, body["error"])
	}
}

func TestModelFetchKeepsAllGatewayModels(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/models" || r.Header.Get("Authorization") != "Bearer key" {
			t.Errorf("request %s", r.URL.String())
		}
		_, _ = w.Write([]byte(`{"data":[{"id":"gpt-image-2"},{"id":"not-approved"}]}`))
	}))
	defer server.Close()
	status, body := fetchModelCatalog(context.Background(), config.Config{Root: repoRoot(t)}, httptest.NewRequest(http.MethodPost, "/", nil), map[string]any{"baseUrl": server.URL, "apiKey": "key"}, server.Client())
	models, _ := body["models"].([]catalogModel)
	if status != http.StatusOK || len(models) != 2 || !containsModel(models, "gpt-image-2") || !containsModel(models, "not-approved") {
		t.Fatalf("status %d models %#v", status, body["models"])
	}
}

func containsModel(models []catalogModel, id string) bool {
	for _, model := range models {
		if model.ID == id {
			return true
		}
	}
	return false
}
