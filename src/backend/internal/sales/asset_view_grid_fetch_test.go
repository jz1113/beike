package sales

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

type gridFetchTransport func(*http.Request) (*http.Response, error)

func (f gridFetchTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

type brokenGridBody struct{ closed bool }

func (b *brokenGridBody) Read([]byte) (int, error) { return 0, io.ErrUnexpectedEOF }
func (b *brokenGridBody) Close() error             { b.closed = true; return nil }

func TestAssetGridDownloadRetriesStalledBodyWithAlternateConnection(t *testing.T) {
	const source = "https://cdn.example/grid.png?signature=original"
	body := &brokenGridBody{}
	firstCalls, secondCalls := 0, 0
	primary := &http.Client{Transport: gridFetchTransport(func(r *http.Request) (*http.Response, error) {
		firstCalls++
		deadline, ok := r.Context().Deadline()
		if !ok || time.Until(deadline) > 20*time.Second || time.Until(deadline) < 19*time.Second {
			t.Fatal("first download must leave time for alternate route and cropping")
		}
		return &http.Response{StatusCode: 200, Body: body}, nil
	})}
	want := assetGridFixture(t, 900, 900)
	alternate := &http.Client{Transport: gridFetchTransport(func(r *http.Request) (*http.Response, error) {
		secondCalls++
		if !body.closed || r.URL.String() != source || r.Method != http.MethodGet {
			t.Fatal("retry must close failed response and reuse the exact original URL")
		}
		deadline, _ := r.Context().Deadline()
		if time.Until(deadline) < 59*time.Second || r.Header.Get("User-Agent") == "" {
			t.Fatal("alternate attempt needs the large-image budget and media headers")
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewReader(want))}, nil
	})}
	data, err := fetchAssetGridWithClients(context.Background(), source, primary, alternate)
	if err != nil || !bytes.Equal(data, want) || firstCalls != 1 || secondCalls != 1 {
		t.Fatal("failed to recover original image", err, firstCalls, secondCalls)
	}
	if err := validateAssetGrid(data, "scene"); err != nil {
		t.Fatal(err)
	}
}

func TestAssetGridDownloadDoesNotRetryPermanentFailureOrCancellation(t *testing.T) {
	for _, test := range []struct {
		name   string
		status int
		length int64
		cancel bool
	}{
		{"expired", 403, 0, false}, {"oversized", 200, assetGridMaxBytes + 1, false}, {"cancelled", 200, 0, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			calls := 0
			client := &http.Client{Transport: gridFetchTransport(func(r *http.Request) (*http.Response, error) {
				calls++
				if test.cancel {
					cancel()
					return nil, context.Canceled
				}
				return &http.Response{StatusCode: test.status, ContentLength: test.length, Body: io.NopCloser(strings.NewReader("unused"))}, nil
			})}
			_, err := fetchAssetGridWithClients(ctx, "https://cdn.example/grid.png", client, client)
			if err == nil || calls != 1 {
				t.Fatal("permanent failure retried", err, calls)
			}
			if test.cancel && !errors.Is(err, context.Canceled) {
				t.Fatal(err)
			}
			if test.length > assetGridMaxBytes {
				var oversized originalImageSizeError
				if !errors.As(err, &oversized) {
					t.Fatal("lost size error", err)
				}
			}
		})
	}
}

func TestAssetGridDownloadRejectsInvalidSourceBeforeNetwork(t *testing.T) {
	client := &http.Client{Transport: gridFetchTransport(func(*http.Request) (*http.Response, error) {
		t.Fatal("invalid source reached network")
		return nil, nil
	})}
	for _, source := range []string{"file:///etc/passwd", "https://user:pass@cdn.example/a.png", "https:///a.png"} {
		if _, err := fetchAssetGridWithClients(context.Background(), source, client, client); err == nil {
			t.Fatal(source)
		}
	}
}
