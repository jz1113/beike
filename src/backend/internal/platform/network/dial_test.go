package network

import (
	"net"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestSafeClientReusesTransport(t *testing.T) {
	for name, newClient := range map[string]func() *http.Client{"default": SafeClient, "ipv6-first": SafeClientIPv6First} {
		t.Run(name, func(t *testing.T) {
			first, second := newClient(), newClient()
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
		})
	}
	if SafeClient().Transport == SafeClientIPv6First().Transport {
		t.Fatal("IPv6 retry must not reuse an existing IPv4 connection")
	}
}

func TestSafeClientRejectsPrivateHost(t *testing.T) {
	for name, newClient := range map[string]func() *http.Client{"default": SafeClient, "ipv6-first": SafeClientIPv6First} {
		t.Run(name, func(t *testing.T) {
			client := newClient()
			client.Timeout = 2 * time.Second
			for _, target := range []string{"http://127.0.0.1:1/", "http://[::1]:1/", "http://169.254.169.254/", "http://localhost:1/"} {
				if _, err := client.Get(target); err == nil || !strings.Contains(err.Error(), "Host not allowed") {
					t.Fatalf("private address must be refused before dial: %s: %v", target, err)
				}
				parsed, err := url.Parse(target)
				if err != nil {
					t.Fatal(err)
				}
				if err := client.CheckRedirect(&http.Request{URL: parsed}, nil); err == nil {
					t.Fatalf("redirect to private address must be refused: %s", target)
				}
			}
		})
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

func TestDialableIPsIPv6FirstKeepsIPv4Fallback(t *testing.T) {
	v4a, v4b := net.ParseIP("8.8.8.8"), net.ParseIP("1.1.1.1")
	v6a, v6b := net.ParseIP("2606:4700:4700::1111"), net.ParseIP("2001:4860:4860::8888")
	for _, tc := range []struct {
		name    string
		records []net.IPAddr
		want    []net.IP
	}{
		{"dual stack", []net.IPAddr{{IP: v4a}, {IP: v6a}, {IP: v4b}, {IP: v6b}}, []net.IP{v6a, v6b, v4a, v4b}},
		{"IPv4 only", []net.IPAddr{{IP: v4a}, {IP: v4b}}, []net.IP{v4a, v4b}},
		{"IPv6 only", []net.IPAddr{{IP: v6a}, {IP: v6b}}, []net.IP{v6a, v6b}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := dialableIPsWithPreference(tc.records, true)
			if err != nil || len(got) != len(tc.want) {
				t.Fatalf("addresses %v, error %v", got, err)
			}
			for index := range got {
				if !got[index].Equal(tc.want[index]) {
					t.Fatalf("address %d = %v, want %v", index, got[index], tc.want[index])
				}
			}
		})
	}
}

func TestDialableIPsValidatesEveryRecordBeforeReturningTargets(t *testing.T) {
	public := []net.IPAddr{{IP: net.ParseIP("8.8.8.8")}, {IP: net.ParseIP("2606:4700:4700::1111")}}
	for _, ipv6First := range []bool{false, true} {
		for _, invalid := range []string{"10.1.2.3", "::1", "fc00::1", "::ffff:127.0.0.1", "invalid"} {
			records := append(append([]net.IPAddr{}, public...), net.IPAddr{IP: net.ParseIP(invalid)})
			if targets, err := dialableIPsWithPreference(records, ipv6First); err == nil || len(targets) != 0 {
				t.Fatalf("ipv6First=%v: %s must reject the whole answer, targets=%v err=%v", ipv6First, invalid, targets, err)
			}
		}
	}
}
