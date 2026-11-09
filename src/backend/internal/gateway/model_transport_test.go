package gateway

import (
	"context"
	"io"
	"net/http"
	"os"
	"regexp"
	"strings"
	"testing"
	"time"
)

type modelTransportProbe func(*http.Request) (*http.Response, error)

func (probe modelTransportProbe) RoundTrip(r *http.Request) (*http.Response, error) { return probe(r) }

func TestModelTransportPreservesHeadersPayloadStatusAndTimeout(t *testing.T) {
	previous := ModelHTTP
	defer func() { ModelHTTP = previous }()
	ModelHTTP = func() *http.Client {
		return &http.Client{Transport: modelTransportProbe(func(r *http.Request) (*http.Response, error) {
			if r.Method != http.MethodPost || r.URL.Path != "/submit" || r.Header.Get("Authorization") != "Explicit token" || r.Header.Get("Cookie") != "" || r.Host != "provider.test" {
				t.Errorf("request changed: %+v", r)
			}
			if r.Header.Get("x-route") != "native" || r.Header.Get("Content-Type") != "application/json" {
				t.Error("lost caller headers")
			}
			body, _ := io.ReadAll(r.Body)
			if string(body) != `{"model":"test"}` {
				t.Errorf("payload %s", body)
			}
			if deadline, ok := r.Context().Deadline(); !ok || time.Until(deadline) > time.Second {
				t.Error("timeout missing")
			}
			return &http.Response{StatusCode: 429, Body: io.NopCloser(strings.NewReader(`{"error":"busy"}`)), Header: http.Header{}}, nil
		})}
	}
	status, raw, err := PostModelHeaders(context.Background(), http.MethodPost, "https://provider.test/submit", "fallback", map[string]any{"model": "test"}, time.Second, map[string]string{"Host": "evil.test", "Cookie": "secret", "Authorization": "Explicit token", "x-route": "native"})
	if err != nil || status != 429 || string(raw) != `{"error":"busy"}` {
		t.Fatalf("response %d %s %v", status, raw, err)
	}
}

func TestImageCatalogMatchesSource(t *testing.T) {
	source, err := os.ReadFile("../../../../src/shared/domain/models/model-catalog/approvedImage.ts")
	if err != nil {
		t.Fatal(err)
	}
	found := regexp.MustCompile(`id: '([^']+)'`).FindAllStringSubmatch(string(source), -1)
	if len(found) != len(imageModelIDs) {
		t.Fatalf("source ids %d go ids %d", len(found), len(imageModelIDs))
	}
	for i, match := range found {
		if match[1] != imageModelIDs[i] {
			t.Fatalf("id %d source %s go %s", i, match[1], imageModelIDs[i])
		}
	}
}

func TestImageAliasIsApproved(t *testing.T) {
	if !IsApprovedImage("qwen-image-3") || !IsApprovedImage("vendor/gpt-image-2") || IsApprovedImage("not-a-model") {
		t.Fatal("image approval mismatch")
	}
}

func TestVideoCatalogMatchesSource(t *testing.T) {
	source, err := os.ReadFile("../../../../src/shared/domain/models/model-catalog/approvedVideo.ts")
	if err != nil {
		t.Fatal(err)
	}
	found := regexp.MustCompile(`id: '([^']+)'`).FindAllStringSubmatch(string(source), -1)
	if len(found) != len(videoModelIDs) {
		t.Fatalf("source ids %d go ids %d", len(found), len(videoModelIDs))
	}
	for i, match := range found {
		if match[1] != videoModelIDs[i] {
			t.Fatalf("id %d source %s go %s", i, match[1], videoModelIDs[i])
		}
	}
	if !IsApprovedVideo("doubao-seedance-2.0-mini") || IsApprovedVideo("gpt-image-2") {
		t.Fatal("video approval mismatch")
	}
}

func TestCanTryAnotherEndpoint(t *testing.T) {
	for _, status := range []int{404, 405, 415} {
		if !CanTryAnotherEndpoint(status) {
			t.Fatalf("status %d should switch endpoint", status)
		}
	}
	for _, status := range []int{0, 200, 408, 429, 500, 502, 503} {
		if CanTryAnotherEndpoint(status) {
			t.Fatalf("status %d must not resubmit", status)
		}
	}
}

func TestChatCompletionsURL(t *testing.T) {
	if got := ChatCompletionsURL("http://127.0.0.1:9"); got != "http://127.0.0.1:9/v1/chat/completions" {
		t.Fatalf("local %s", got)
	}
	if got := ChatCompletionsURL("https://api.openai.com/v1"); got != "https://api.openai.com/v1/chat/completions" {
		t.Fatalf("openai %s", got)
	}
	if got := ChatCompletionsURL("https://maas.qianwenaiapi.com"); got != "https://maas.qianwenaiapi.com/compatible-mode/v1/chat/completions" {
		t.Fatalf("qianwen %s", got)
	}
	if got := ModelsURL("https://dashscope.aliyuncs.com/api/v1"); got != "https://dashscope.aliyuncs.com/compatible-mode/v1/models" {
		t.Fatalf("models %s", got)
	}
	if got := ChatCompletionsURL("https://maas.qianwenaiapi.com/compatible-mode/v1"); got != "https://maas.qianwenaiapi.com/compatible-mode/v1/chat/completions" {
		t.Fatalf("already %s", got)
	}
	if DashScopeRoot("https://maas.qianwenaiapi.com/compatible-mode/v1") != "https://maas.qianwenaiapi.com" {
		t.Fatalf("root %s", DashScopeRoot("https://maas.qianwenaiapi.com/compatible-mode/v1"))
	}
	if IsDashScopeGateway("https://evil-dashscope.example.com") || !IsDashScopeGateway("https://dashscope-intl.aliyuncs.com") {
		t.Fatal("host detection")
	}
}
