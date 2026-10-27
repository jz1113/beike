package keywords

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestKeywordReviewStopsBeforeDispatchWhenReceiptStorageUnavailable(t *testing.T) {
	path := filepath.Join(t.TempDir(), "occupied")
	if err := os.WriteFile(path, []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("AZHUO_DATA_DIR", path)
	calls := 0
	result := guardKeywordSubmission(httptest.NewRequest(http.MethodPost, "/", nil), "local", "base", "key",
		map[string]any{"rows": []any{}}, func() (int, map[string]any) {
			calls++
			return 200, map[string]any{"success": true}
		})
	if calls != 0 || result.status != 503 || result.body["code"] != "local_progress_unavailable" {
		t.Fatalf("calls=%d result=%#v", calls, result)
	}
}

func TestClaimReceiptDoesNotProceedAfterStorageOrEncodingFailure(t *testing.T) {
	for _, tc := range []struct {
		name    string
		file    string
		receipt map[string]any
	}{
		{"missing-directory", filepath.Join(t.TempDir(), "missing", "receipt.json"), map[string]any{"fingerprint": "one"}},
		{"invalid-receipt", filepath.Join(t.TempDir(), "receipt.json"), map[string]any{"invalid": make(chan int)}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			result, stop := claimReceipt(tc.file, tc.receipt, "one", "one")
			if !stop || result.body["code"] != "local_progress_unavailable" {
				t.Fatalf("stop=%v result=%#v", stop, result)
			}
		})
	}
}

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
