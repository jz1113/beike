package generate

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
)

func TestCopywritingLocalFallback(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "")
	t.Setenv("AI_API_KEY", "")
	handler := Copywriting(config.Config{NodeEnv: "development"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/copywriting", strings.NewReader(`{"productTitle":"翡翠手镯"}`)))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"fromFallback":true`) || !strings.Contains(response.Body.String(), "翡翠手镯商品资料") {
		t.Fatalf("fallback %d %s", response.Code, response.Body.String())
	}
	duplicate := httptest.NewRecorder()
	handler.ServeHTTP(duplicate, httptest.NewRequest(http.MethodPost, "/api/generate/copywriting", strings.NewReader(`{"productTitle":"翡翠手镯","existingTitles":["翡翠手镯商品资料"]}`)))
	if !strings.Contains(duplicate.Body.String(), "商品细节关于翡翠手镯") {
		t.Fatalf("duplicate %s", duplicate.Body.String())
	}
}

func TestCopywritingWithKeyUsesModel(t *testing.T) {
	var seenAuth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenAuth = r.Header.Get("Authorization")
		input, _ := io.ReadAll(r.Body)
		for _, want := range []string{"圆领", "窗边", "image_url", "https://example.com/result.jpg"} {
			if !strings.Contains(string(input), want) {
				t.Errorf("missing copy evidence %q", want)
			}
		}
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"title\":\"窗边的条纹针织衫\",\"content\":\"细条纹延伸至袖口。\",\"tags\":[]}"}}]}`))
	}))
	defer server.Close()
	previous := gateway.ModelHTTP
	gateway.ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { gateway.ModelHTTP = previous })
	handler := Copywriting(config.Config{NodeEnv: "development"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/copywriting", strings.NewReader(`{"productTitle":"针织衫","productProps":{"领型":"圆领"},"shotPrompts":["窗边"],"imageUrls":["https://example.com/result.jpg"],"customApiKey":"secret","customBaseUrl":"`+server.URL+`"}`)))
	if response.Code != http.StatusOK || strings.Contains(response.Body.String(), "fromFallback") || !strings.Contains(response.Body.String(), "细条纹延伸至袖口。") || seenAuth != "Bearer secret" {
		t.Fatalf("model %d auth %s body %s", response.Code, seenAuth, response.Body.String())
	}
}
