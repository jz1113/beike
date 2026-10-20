package collect

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

type countedWanbangBody struct {
	reader io.Reader
	read   int
	closed bool
}

func (body *countedWanbangBody) Read(target []byte) (int, error) {
	count, err := body.reader.Read(target)
	body.read += count
	return count, err
}

func (body *countedWanbangBody) Close() error {
	body.closed = true
	return nil
}

func TestWanbangReadsAtMostEightMiBPlusOneAndClosesBody(t *testing.T) {
	body := &countedWanbangBody{reader: strings.NewReader(strings.Repeat("x", wanbangBodyLimit+1024))}
	calls := 0
	client := &http.Client{Transport: collectRoundTripper(func(r *http.Request) (*http.Response, error) {
		calls++
		return &http.Response{StatusCode: 200, Header: http.Header{}, Body: body, Request: r}, nil
	})}
	_, err := fetchWanbang(context.Background(), client, "https://example.com/local-mock-only")
	var failure wanbangBodyError
	if !errors.As(err, &failure) || failure.kind != "tooLarge" || body.read != wanbangBodyLimit+1 || !body.closed || calls != 1 {
		t.Fatalf("err=%v read=%d closed=%v calls=%d", err, body.read, body.closed, calls)
	}
}

func TestWanbangDeadlineDuringRetryDoesNotMakeAnotherRequest(t *testing.T) {
	calls := 0
	client := &http.Client{Transport: collectRoundTripper(func(r *http.Request) (*http.Response, error) {
		calls++
		return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(`{"error_code":"4017","error":"timeout"}`)), Request: r}, nil
	})}
	db := openCollectDB(t)
	ctx, cancel := context.WithTimeout(context.Background(), 80*time.Millisecond)
	defer cancel()
	start := time.Now()
	result := Product(ctx, db, "local", map[string]any{"url": "1234567"}, "test-key", "test-secret", client)
	if result.Status != 504 || calls != 1 || time.Since(start) > 700*time.Millisecond {
		t.Fatalf("status=%d calls=%d elapsed=%s", result.Status, calls, time.Since(start))
	}
}

func TestWanbangCancelWhileReadingResponseDoesNotRetry(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	calls := 0
	client := &http.Client{Transport: collectRoundTripper(func(r *http.Request) (*http.Response, error) {
		calls++
		cancel()
		return &http.Response{StatusCode: 200, Header: http.Header{}, Body: &canceledWanbangBody{ctx}, Request: r}, nil
	})}
	result := Product(ctx, openCollectDB(t), "local", map[string]any{"url": "1234567"}, "test-key", "test-secret", client)
	if result.Status != 499 || calls != 1 {
		t.Fatalf("status=%d calls=%d", result.Status, calls)
	}
}

type canceledWanbangBody struct{ context.Context }

func (body *canceledWanbangBody) Read(_ []byte) (int, error) { return 0, body.Err() }
func (body *canceledWanbangBody) Close() error               { return nil }
