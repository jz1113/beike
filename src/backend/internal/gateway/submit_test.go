package gateway

import "testing"

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
