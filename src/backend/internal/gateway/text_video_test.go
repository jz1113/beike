package gateway

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGeminiReceivesInlineVideoWithoutTools(t *testing.T) {
	data := base64.StdEncoding.EncodeToString([]byte("\x00\x00\x00\x18ftypisomvideo"))
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		parts := textArray(textMap(textArray(body["contents"])[0])["parts"])
		video := textMap(textMap(parts[1])["inlineData"])
		if video["mimeType"] != "video/mp4" || video["data"] != data || body["tools"] != nil {
			t.Error("native video bytes, MIME or direct request changed")
		}
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, "data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"视频分析完成\"}]},\"finishReason\":\"STOP\"}]}\n\n")
	}))
	defer server.Close()
	_, reply, err := StreamText(context.Background(), TextRequest{BaseURL: server.URL, Protocol: "gemini", Payload: map[string]any{
		"model": "gemini-3.8-flash", "messages": []any{map[string]any{"role": "user", "content": []any{
			map[string]any{"type": "text", "text": "分析视频"},
			map[string]any{"type": "video_url", "video_url": map[string]any{"url": "data:video/mp4;base64," + data}},
		}}},
	}}, nil)
	if err != nil || textString(textMap(textMap(textArray(reply["choices"])[0])["message"])["content"]) != "视频分析完成" {
		t.Fatalf("video completion: %v", err)
	}
}

func TestTextVideoRejectsInvalidSources(t *testing.T) {
	for _, source := range []string{"blob:local", "/storage/local/video.mp4", "https://example.com/video.mp4", "data:image/png;base64,AAAA", "data:video/mp4;base64,broken", "data:video/webm;base64," + base64.StdEncoding.EncodeToString([]byte("not a webm"))} {
		if _, _, err := textVideo(context.Background(), source); err == nil {
			t.Fatalf("invalid video source accepted: %s", source)
		}
	}
}

func TestTextUpstreamKeepsNestedErrorReasonAndRedactsKey(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, `{"error":{"message":"Invalid functionResponse for secret-token"}}`)
	}))
	defer server.Close()
	_, _, err := StreamText(context.Background(), TextRequest{BaseURL: server.URL, APIKey: "secret-token", Protocol: "gemini", Payload: map[string]any{"model": "gemini-3.8-flash", "messages": []any{map[string]any{"role": "user", "content": "你好"}}}}, nil)
	if err == nil || !strings.Contains(err.Error(), "Invalid functionResponse") || strings.Contains(err.Error(), "secret-token") {
		t.Fatalf("upstream reason or redaction lost: %v", err)
	}
}
