package modelgw

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestTextImageEmbeddedPreparationSharedByEveryProtocol(t *testing.T) {
	original := textPNGFixture(2100, 1050, png.DefaultCompression)
	posts := make(chan map[string]any, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			if r.Header.Get("Authorization") != "" || r.Header.Get("x-api-key") != "" || r.Header.Get("x-goog-api-key") != "" {
				t.Error("model credentials leaked into image download")
			}
			w.Header().Set("Content-Type", "image/png")
			w.Write(original)
			return
		}
		var posted map[string]any
		if err := json.NewDecoder(r.Body).Decode(&posted); err != nil {
			t.Error(err)
		}
		posts <- posted
		switch {
		case strings.HasSuffix(r.URL.Path, ":generateContent"):
			io.WriteString(w, `{"candidates":[{"content":{"parts":[{"text":"ok"}]},"finishReason":"STOP"}]}`)
		case strings.HasSuffix(r.URL.Path, "/messages"):
			io.WriteString(w, `{"content":[{"type":"text","text":"ok"}],"stop_reason":"end_turn"}`)
		default:
			io.WriteString(w, `{"choices":[{"message":{"role":"assistant","content":"ok"},"finish_reason":"stop"}]}`)
		}
	}))
	defer server.Close()
	previous := textImageClient
	textImageClient = func() *http.Client { return server.Client() }
	t.Cleanup(func() { textImageClient = previous })
	for _, protocol := range []string{"openai", "gemini", "anthropic"} {
		for _, source := range []string{textImageDataURL("image/png", original), server.URL + "/original?token=private"} {
			payload := map[string]any{"model": "vision-test", "max_tokens": 128, "messages": []any{map[string]any{"role": "user", "content": []any{
				map[string]any{"type": "text", "text": "inspect"},
				map[string]any{"type": "image_url", "image_url": map[string]any{"url": source, "index": 3, "detail": "low"}},
			}}}}
			before, _ := json.Marshal(payload)
			status, _, err := CompleteText(context.Background(), TextRequest{BaseURL: server.URL, Protocol: protocol, APIKey: "private-model-key", Client: server.Client(), Payload: payload})
			if err != nil || status != 200 {
				t.Fatalf("%s: status=%d err=%v", protocol, status, err)
			}
			after, _ := json.Marshal(payload)
			if !bytes.Equal(before, after) {
				t.Fatal("original request/material was mutated")
			}
			posted := <-posts
			var mediaType, data string
			switch protocol {
			case "gemini":
				parts := textArray(textMap(textArray(posted["contents"])[0])["parts"])
				inline := textMap(textMap(parts[1])["inlineData"])
				mediaType, data = textString(inline["mimeType"]), textString(inline["data"])
			case "anthropic":
				parts := textArray(textMap(textArray(posted["messages"])[0])["content"])
				inline := textMap(textMap(parts[1])["source"])
				mediaType, data = textString(inline["media_type"]), textString(inline["data"])
			default:
				parts := textArray(textMap(textArray(posted["messages"])[0])["content"])
				inline := textMap(textMap(parts[1])["image_url"])
				if inline["index"] != nil || inline["detail"] != "low" {
					t.Fatal("OpenAI image metadata was not handled correctly", inline["index"], inline["detail"])
				}
				if !strings.HasPrefix(source, "data:") {
					if inline["url"] != source {
						t.Fatal("OpenAI remote URL was rewritten")
					}
					continue
				}
				head, body, _ := strings.Cut(textString(inline["url"]), ",")
				mediaType, data = strings.TrimSuffix(strings.TrimPrefix(head, "data:"), ";base64"), body
			}
			body, err := base64.StdEncoding.DecodeString(data)
			if err != nil || len(body) == 0 || len(body) > textImageByteLimit || mediaType != "image/jpeg" {
				t.Fatalf("%s unsafe image type=%s bytes=%d err=%v", protocol, mediaType, len(body), err)
			}
			config, _, err := image.DecodeConfig(bytes.NewReader(body))
			if err != nil || config.Width != 2048 || config.Height != 1024 {
				t.Fatalf("%s bad dimensions: %+v %v", protocol, config, err)
			}
		}
	}
}

func TestTextOpenAIRemoteImagesKeepURLsWithoutLocalDownloads(t *testing.T) {
	previous := textImageClient
	textImageClient = func() *http.Client {
		t.Error("OpenAI remote images must not use the local image downloader")
		return &http.Client{Transport: textImageTestTransport(func(*http.Request) (*http.Response, error) {
			return nil, errors.New("unexpected local image fetch")
		})}
	}
	t.Cleanup(func() { textImageClient = previous })
	posts := make(chan map[string]any, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/v1/chat/completions" {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		body, err := io.ReadAll(r.Body)
		if err != nil || len(body) > 16<<10 {
			t.Errorf("remote image request inflated: bytes=%d err=%v", len(body), err)
		}
		var posted map[string]any
		if err := json.Unmarshal(body, &posted); err != nil {
			t.Error(err)
		}
		posts <- posted
		io.WriteString(w, `{"choices":[{"message":{"role":"assistant","content":"ok"},"finish_reason":"stop"}]}`)
	}))
	defer server.Close()
	sources := []string{
		"https://example.com/white.jpg",
		"https://cdn.example.test/original.png?Expires=123&Signature=private%2Btoken&x-image-process=resize,w_2400",
	}
	parts := []any{map[string]any{"type": "text", "text": "inspect all images"}}
	for i := 0; i < 16; i++ {
		parts = append(parts, map[string]any{"type": "image_url", "image_url": map[string]any{"url": sources[i%len(sources)], "index": i + 1, "detail": "high"}})
	}
	payload := map[string]any{"model": "vision-test", "messages": []any{map[string]any{"role": "user", "content": parts}}}
	before, _ := json.Marshal(payload)
	status, _, err := CompleteText(context.Background(), TextRequest{BaseURL: server.URL, Protocol: "openai", Payload: payload})
	if err != nil || status != 200 {
		t.Fatalf("remote URLs unexpectedly fetched: status=%d err=%v", status, err)
	}
	after, _ := json.Marshal(payload)
	if !bytes.Equal(before, after) {
		t.Fatal("original request was mutated")
	}
	posted := <-posts
	out := textArray(textMap(textArray(posted["messages"])[0])["content"])
	if len(out) != len(parts) {
		t.Fatalf("remote images were dropped: parts=%d want=%d", len(out), len(parts))
	}
	for i, part := range out[1:] {
		image := textMap(textMap(part)["image_url"])
		if image["url"] != sources[i%len(sources)] || image["detail"] != "high" || image["index"] != nil {
			t.Fatalf("remote image %d changed: %v", i, image)
		}
	}
}

func TestTextOpenAIInlinesOctetStreamAndKeepsImageURLs(t *testing.T) {
	var jpegBody bytes.Buffer
	if err := jpeg.Encode(&jpegBody, image.NewRGBA(image.Rect(0, 0, 2, 2)), nil); err != nil {
		t.Fatal(err)
	}
	octetURL := "https://img.alicdn.com/person.c70.octet-stream?Expires=1&Signature=secret-token"
	plainURL := "https://cdn.example.test/white.jpg?Signature=keep-remote"
	previous := textImageClient
	gets := 0
	textImageClient = func() *http.Client {
		return &http.Client{Transport: textImageTestTransport(func(r *http.Request) (*http.Response, error) {
			gets++
			if !strings.HasSuffix(r.URL.Path, ".octet-stream") {
				t.Errorf("fetched ordinary image %s", r.URL.Path)
			}
			if r.Header.Get("Authorization") != "" || r.Header.Get("Referer") != "https://www.taobao.com/" {
				t.Errorf("headers referer=%s", r.Header.Get("Referer"))
			}
			return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": {"application/octet-stream"}}, Body: io.NopCloser(bytes.NewReader(jpegBody.Bytes()))}, nil
		})}
	}
	t.Cleanup(func() { textImageClient = previous })
	posts := make(chan map[string]any, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var posted map[string]any
		if err := json.NewDecoder(r.Body).Decode(&posted); err != nil {
			t.Error(err)
		}
		posts <- posted
		io.WriteString(w, `{"choices":[{"message":{"role":"assistant","content":"ok"},"finish_reason":"stop"}]}`)
	}))
	defer server.Close()
	payload := map[string]any{"model": "vision-test", "messages": []any{map[string]any{"role": "user", "content": []any{
		map[string]any{"type": "image_url", "image_url": map[string]any{"url": octetURL, "index": 2, "detail": "low"}},
		map[string]any{"type": "image_url", "image_url": map[string]any{"url": plainURL, "index": 3, "detail": "high"}},
	}}}}
	before, _ := json.Marshal(payload)
	status, _, err := CompleteText(context.Background(), TextRequest{BaseURL: server.URL, Protocol: "openai", APIKey: "private-model-key", Client: server.Client(), Payload: payload})
	if err != nil || status != 200 || gets != 1 {
		t.Fatalf("status=%d gets=%d err=%v", status, gets, err)
	}
	after, _ := json.Marshal(payload)
	if !bytes.Equal(before, after) {
		t.Fatal("original request was mutated")
	}
	posted := <-posts
	encoded, _ := json.Marshal(posted)
	if strings.Contains(string(encoded), "secret-token") || strings.Contains(string(encoded), "private-model-key") {
		t.Fatal("secret leaked into the vision request")
	}
	parts := textArray(textMap(textArray(posted["messages"])[0])["content"])
	first := textMap(textMap(parts[0])["image_url"])
	second := textMap(textMap(parts[1])["image_url"])
	if !strings.HasPrefix(textString(first["url"]), "data:image/jpeg;base64,") || first["detail"] != "low" || first["index"] != nil {
		t.Fatalf("octet-stream image %#v", first)
	}
	if second["url"] != plainURL || second["detail"] != "high" {
		t.Fatalf("ordinary image changed %#v", second)
	}
	htmlURL := "https://img.alicdn.com/bad.octet-stream"
	textImageClient = func() *http.Client {
		return &http.Client{Transport: textImageTestTransport(func(r *http.Request) (*http.Response, error) {
			return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": {"image/png"}}, Body: io.NopCloser(strings.NewReader("<html>not-an-image</html>"))}, nil
		})}
	}
	_, _, err = CompleteText(context.Background(), TextRequest{BaseURL: server.URL, Protocol: "openai", Client: server.Client(), Payload: map[string]any{
		"model": "vision-test", "messages": []any{map[string]any{"role": "user", "content": []any{
			map[string]any{"type": "image_url", "image_url": map[string]any{"url": htmlURL, "index": 4}},
		}}},
	}})
	requireTextImageKind(t, err, "mismatch")
	var indexed *IndexedImageError
	if !errors.As(err, &indexed) || indexed.Index != 4 || strings.Contains(err.Error(), "bad.octet-stream") {
		t.Fatalf("html disguised as octet-stream: %v", err)
	}
}

func TestTextImageFailuresAbortEveryProtocolWithIndex(t *testing.T) {
	visits := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		visits++
		t.Error("invalid image was silently dropped or forwarded")
	}))
	defer server.Close()
	bad := textImageDataURL("image/png", textPNGFixture(2, 2, png.DefaultCompression)[:33])
	for _, protocol := range []string{"openai", "gemini", "anthropic"} {
		payload := map[string]any{"model": "vision-test", "max_tokens": 128, "messages": []any{map[string]any{"role": "user", "content": []any{
			map[string]any{"type": "image_url", "image_url": map[string]any{"url": textTestPNG, "index": 2}},
			map[string]any{"type": "image_url", "image_url": map[string]any{"url": bad, "index": 7}},
		}}}}
		status, result, err := CompleteText(context.Background(), TextRequest{BaseURL: server.URL, Protocol: protocol, Payload: payload})
		var indexed *IndexedImageError
		if status != 0 || result != nil || !errors.As(err, &indexed) || indexed.Index != 7 {
			t.Fatalf("%s lost failure: status=%d err=%v", protocol, status, err)
		}
		requireTextImageKind(t, err, "invalid")
	}
	if visits != 0 {
		t.Fatalf("upstream requests=%d", visits)
	}
}
