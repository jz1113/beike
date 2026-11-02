package gateway

import (
	"context"
	"io"
	"net/http"
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
