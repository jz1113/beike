package network

import "testing"

func TestPrivateIPBlocksLocalAndMetadata(t *testing.T) {
	for _, ip := range []string{"127.0.0.1", "10.1.2.3", "192.168.1.1", "172.16.0.1", "169.254.169.254", "::1", "::ffff:127.0.0.1", "::ffff:7f00:1"} {
		if !PrivateIP(ip) {
			t.Fatalf("expected private %s", ip)
		}
	}
}

func TestPrivateIPAllowsPublic(t *testing.T) {
	for _, ip := range []string{"8.8.8.8", "1.1.1.1"} {
		if PrivateIP(ip) {
			t.Fatalf("expected public %s", ip)
		}
	}
}
