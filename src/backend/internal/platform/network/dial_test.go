package network

import (
	"net/http"
	"testing"
	"time"
)

func TestSafeClientReusesTransport(t *testing.T) {
	first := SafeClient()
	second := SafeClient()
	if first.Transport != second.Transport {
		t.Fatal("outbound client must share one transport")
	}
	transport, ok := first.Transport.(*http.Transport)
	if !ok {
		t.Fatal("expected http.Transport")
	}
	if transport.IdleConnTimeout < time.Minute {
		t.Fatalf("idle connections must expire, got %s", transport.IdleConnTimeout)
	}
	if transport.MaxIdleConnsPerHost < 1 || transport.MaxIdleConnsPerHost > 8 {
		t.Fatalf("per-host idle limit out of range: %d", transport.MaxIdleConnsPerHost)
	}
}

func TestSafeClientRejectsPrivateHost(t *testing.T) {
	client := SafeClient()
	client.Timeout = 2 * time.Second
	if _, err := client.Get("http://127.0.0.1:1/"); err == nil {
		t.Fatal("private address must be refused before dial")
	}
}
