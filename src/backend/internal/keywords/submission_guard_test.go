package keywords

import (
	"net/http"
	"testing"
)

func TestReplayWithoutFingerprintKeepsFailure(t *testing.T) {
	result := replayGuarded(guardedResult{
		status: http.StatusInternalServerError,
		body:   map[string]any{"success": false, "error": "词包审核失败"},
	}, "fingerprint")
	if result.status != http.StatusInternalServerError || result.body["error"] != "词包审核失败" {
		t.Fatalf("status %d body %#v", result.status, result.body)
	}
}

func TestReplayRejectsDifferentFingerprint(t *testing.T) {
	header := http.Header{}
	header.Set("x-request-fingerprint", "one")
	result := replayGuarded(guardedResult{
		status: http.StatusOK,
		body:   map[string]any{"success": true},
		header: header,
	}, "two")
	if result.status != http.StatusConflict {
		t.Fatalf("status %d", result.status)
	}
}
