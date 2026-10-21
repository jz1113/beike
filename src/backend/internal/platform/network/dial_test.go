package network

import (
	"net"
	"net/http"
	"strings"
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

func TestDialableIPsPreferIPv4AndRejectPrivate(t *testing.T) {
	v6 := net.ParseIP("240e:946:3000:8008::73")
	v4 := net.ParseIP("150.138.229.197")
	got, err := dialableIPs([]net.IPAddr{{IP: v6}, {IP: v4}})
	if err != nil || len(got) != 2 || !got[0].Equal(v4) || !got[1].Equal(v6) {
		t.Fatalf("order %#v err %v", got, err)
	}
	if _, err := dialableIPs([]net.IPAddr{{IP: v4}, {IP: net.ParseIP("10.1.2.3")}}); err == nil || !strings.Contains(err.Error(), "private") {
		t.Fatal(err)
	}
	if _, err := dialableIPs(nil); err == nil {
		t.Fatal("empty lookup must fail")
	}
}
