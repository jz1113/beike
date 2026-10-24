package generate

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestGeminiNanoBanana21OpenAICompatiblePayload(t *testing.T) {
	// Simulates the exact scenario where client sends 1152x1536 or 3072x4096 with quality=high (4K)
	adapted := buildImagePayloadWithAspect("gemini-nano-banana-2.1", "竖幅中华美食海报", "1152x1536", "3:4", "high", "", nil)
	if adapted.family != "gemini-nano" {
		t.Fatalf("expected gemini-nano family, got %s", adapted.family)
	}
	if _, hasSize := adapted.payload["size"]; hasSize {
		t.Fatalf("gemini-nano payload must omit size, got %#v", adapted.payload)
	}
	if _, hasN := adapted.payload["n"]; hasN {
		t.Fatalf("gemini-nano payload must omit n, got %#v", adapted.payload)
	}
	if _, hasQuality := adapted.payload["quality"]; hasQuality {
		t.Fatalf("gemini-nano payload must omit quality, got %#v", adapted.payload)
	}
	if adapted.payload["aspect_ratio"] != "3:4" || adapted.payload["aspectRatio"] != "3:4" {
		t.Fatalf("expected aspect_ratio=3:4, got %#v", adapted.payload)
	}
	if adapted.payload["image_size"] != "4K" || adapted.payload["imageSize"] != "4K" {
		t.Fatalf("expected image_size=4K, got %#v", adapted.payload)
	}
	if adapted.payload["response_format"] != "url" {
		t.Fatalf("expected response_format=url, got %#v", adapted.payload)
	}
	if adapted.size != "3584x4800" {
		t.Fatalf("expected official 4K 3:4 size 3584x4800, got %s", adapted.size)
	}
}

func TestGeminiNanoBananaExtendedAndAutoAspectRatios(t *testing.T) {
	// Nano Banana 2.1 supports all 14 official aspect ratios including 1:4, 4:1, 1:8, 8:1
	for _, ratio := range []string{"1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9"} {
		adapted := buildImagePayloadWithAspect("gemini-nano-banana-2.1", "测试", ratio, ratio, "medium", "", nil)
		if adapted.payload["aspect_ratio"] != ratio {
			t.Fatalf("expected %s for gemini-nano-banana-2.1, got %v", ratio, adapted.payload["aspect_ratio"])
		}
		if adapted.payload["image_size"] != "2K" {
			t.Fatalf("expected 2K for medium quality, got %v", adapted.payload["image_size"])
		}
	}

	// Auto / default / smart omits aspect_ratio so Gemini matches reference image or defaults to 1:1
	for _, autoToken := range []string{"auto", "default", "smart"} {
		adapted := buildImagePayloadWithAspect("gemini-nano-banana-2.1", "测试", autoToken, autoToken, "low", "", nil)
		if _, exists := adapted.payload["aspect_ratio"]; exists {
			t.Fatalf("auto token %q must omit aspect_ratio, got %#v", autoToken, adapted.payload)
		}
		if _, exists := adapted.payload["aspectRatio"]; exists {
			t.Fatalf("auto token %q must omit aspectRatio, got %#v", autoToken, adapted.payload)
		}
		if adapted.payload["image_size"] != "1K" {
			t.Fatalf("expected 1K for low quality, got %v", adapted.payload["image_size"])
		}
	}

	// 10-ratio models (nano-banana-pro, gemini-3.1-flash-lite-image) map extreme ratios to closest supported
	pro := buildImagePayloadWithAspect("nano-banana-pro", "测试", "1:8", "1:8", "high", "", nil)
	if pro.payload["aspect_ratio"] != "9:16" {
		t.Fatalf("expected 1:8 on nano-banana-pro to map to 9:16, got %v", pro.payload["aspect_ratio"])
	}
	if pro.payload["image_size"] != "4K" {
		t.Fatalf("expected 4K on nano-banana-pro, got %v", pro.payload["image_size"])
	}

	// Lite model forces 1K resolution per official doc
	lite := buildImagePayloadWithAspect("gemini-3.1-flash-lite-image", "测试", "16:9", "16:9", "high", "", nil)
	if lite.payload["image_size"] != "1K" || lite.size != "1376x768" {
		t.Fatalf("expected 1K (1376x768) on gemini-3.1-flash-lite-image, got %v (%s)", lite.payload["image_size"], lite.size)
	}

	// Legacy 2.5 flash image (nano-banana v1) omits image_size and uses 2.5 resolution table
	legacy := buildImagePayloadWithAspect("nano-banana", "测试", "3:4", "3:4", "high", "", nil)
	if _, exists := legacy.payload["image_size"]; exists {
		t.Fatalf("nano-banana v1 must omit image_size, got %#v", legacy.payload)
	}
	if legacy.size != "864x1184" {
		t.Fatalf("expected 864x1184 for nano-banana 3:4, got %s", legacy.size)
	}
}

func TestGeminiNativeGenerateContentProtocolAndThoughtFiltering(t *testing.T) {
	var capturedPath, capturedKey string
	var capturedBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedPath = r.URL.Path
		capturedKey = r.Header.Get("x-goog-api-key")
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &capturedBody)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"candidates": [{
				"finishReason": "STOP",
				"content": {
					"parts": [
						{"text": "thinking...", "thought": true},
						{"inlineData": {"mimeType": "image/png", "data": "dGhvdWdodC1pbWFnZQ=="}, "thought": true},
						{"inlineData": {"mimeType": "image/jpeg", "data": "ZmluYWwtaW1hZ2U="}}
					]
				}
			}],
			"usageMetadata": {"promptTokenCount": 20, "candidatesTokenCount": 2520, "totalTokenCount": 2540}
		}`))
	}))
	defer server.Close()
	previous := ModelHTTP
	ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { ModelHTTP = previous })

	handler := Image(config.Config{Upstream: "http://127.0.0.1:1", DatabaseURL: "file:" + imageTaskDatabase(t), NodeEnv: "development"})
	response := httptest.NewRecorder()
	reqBody := `{"prompt":"中华美食海报","model":"gemini-nano-banana-2.1","size":"1152x1536","aspectRatio":"3:4","quality":"high","customProtocol":"gemini","customApiKey":"gem-secret","customBaseUrl":"` + server.URL + `"}`
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/image", strings.NewReader(reqBody)))

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", response.Code, response.Body.String())
	}
	if capturedPath != "/v1beta/models/gemini-nano-banana-2.1:generateContent" || capturedKey != "gem-secret" {
		t.Fatalf("unexpected path %s or key %s", capturedPath, capturedKey)
	}
	genCfg, _ := capturedBody["generationConfig"].(map[string]any)
	imgCfg, _ := genCfg["imageConfig"].(map[string]any)
	if imgCfg["aspectRatio"] != "3:4" || imgCfg["imageSize"] != "4K" {
		t.Fatalf("unexpected imageConfig %#v", imgCfg)
	}
	bodyStr := response.Body.String()
	if !strings.Contains(bodyStr, `"resultUrl":"data:image/jpeg;base64,ZmluYWwtaW1hZ2U="`) {
		t.Fatalf("expected final non-thought image URL, got %s", bodyStr)
	}
	if !strings.Contains(bodyStr, `"totalTokens":2540`) {
		t.Fatalf("expected usageMetadata to be normalized, got %s", bodyStr)
	}
}

func TestGeminiReferenceImageLimitRule(t *testing.T) {
	handler := Image(config.Config{Upstream: "http://127.0.0.1:1", NodeEnv: "development"})
	refs := make([]string, 15)
	for i := range refs {
		refs[i] = "https://example.com/" + Itoa(i+1) + ".jpg"
	}
	rawRefs, _ := json.Marshal(refs)
	response := httptest.NewRecorder()
	body := `{"prompt":"合拍","model":"gemini-nano-banana-2.1","customApiKey":"secret","images":` + string(rawRefs) + `}`
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/image", strings.NewReader(body)))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "最多支持 14 张参考图") {
		t.Fatalf("expected 14 reference limit rejection, got %d %s", response.Code, response.Body.String())
	}
}
