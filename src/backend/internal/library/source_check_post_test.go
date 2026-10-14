package library

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestSourceCheckPostRejectsBadBody(t *testing.T) {
	handler := sourceCheckPostHandler(config.Config{})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/catalog/assets/source-check", bytes.NewBufferString(`{"urls":"nope"}`)))
	if response.Code != http.StatusBadRequest || !bytes.Contains(response.Body.Bytes(), []byte("每次最多查重 200 条链接")) {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
}

func TestNoteSourceKeyAndUnsupportedHost(t *testing.T) {
	if noteSourceKey("https://www.xiaohongshu.com/explore/661234567890abcdef123456") != "xhs:661234567890abcdef123456" {
		t.Fatal("key")
	}
	item := checkOneSource(context.Background(), nil, "local", "https://example.com/a", nil)
	if item.State != "error" || item.Reason == nil || !strings.Contains(*item.Reason, "只支持小红书") {
		t.Fatalf("item %#v", item)
	}
	if expanded := expandShortLink(context.Background(), "http://127.0.0.1/secret", []string{"xhslink.com"}); expanded != "http://127.0.0.1/secret" {
		t.Fatalf("expanded %s", expanded)
	}
}
