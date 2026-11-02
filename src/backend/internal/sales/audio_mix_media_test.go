package sales

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/platform/network"
)

type mixMediaClientFunc func(*http.Request) (*http.Response, error)

func (f mixMediaClientFunc) Do(r *http.Request) (*http.Response, error) { return f(r) }

func TestAudioMixRemoteDownloadPreservesSignedURLAndCleansUp(t *testing.T) {
	source := "https://cdn.example.test/asset?signature=a%2Fb&expires=100"
	wav := append([]byte("RIFF1234WAVEfmt "), []byte("audio fixture")...)
	client := mixMediaClientFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.String() != source || r.Header.Get("Accept") != "audio/*" {
			t.Fatalf("request changed signature or type: %s %v", r.URL, r.Header)
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewReader(wav)), ContentLength: int64(len(wav))}, nil
	})
	file, cleanup, err := resolveAudioMixMedia(t.Context(), source, "local", false, client)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(file)
	if err != nil || !bytes.Equal(raw, wav) {
		t.Fatalf("download lost bytes: %v", err)
	}
	cleanup()
	if _, err := os.Stat(file); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("temporary input left behind: %v", err)
	}
}

func TestAudioMixRemoteRejectsNonMediaOversizeAndInterruptedDownloads(t *testing.T) {
	for _, test := range []struct {
		name   string
		status int
		length int64
		body   io.Reader
	}{
		{"playlist", 200, 0, strings.NewReader("#EXTM3U\nhttp://127.0.0.1/private")},
		{"html", 200, 0, strings.NewReader("<html>Access Denied</html>")},
		{"oversize_header", 200, audioMixAudioLimit + 1, strings.NewReader("RIFF1234WAVEfmt ")},
		{"oversize_stream", 200, -1, io.MultiReader(strings.NewReader("RIFF1234WAVEfmt "), io.LimitReader(zeroMixReader{}, audioMixAudioLimit))},
		{"interrupted", 200, -1, io.MultiReader(strings.NewReader("RIFF1234WAVEfmt "), brokenMixReader{})},
		{"missing", 403, 0, strings.NewReader("RIFF1234WAVEfmt ")},
	} {
		t.Run(test.name, func(t *testing.T) {
			temp := t.TempDir()
			t.Setenv("TMPDIR", temp)
			client := mixMediaClientFunc(func(*http.Request) (*http.Response, error) {
				return &http.Response{StatusCode: test.status, Body: io.NopCloser(test.body), ContentLength: test.length}, nil
			})
			path, cleanup, err := resolveAudioMixMedia(t.Context(), "https://cdn.example.test/signed", "local", false, client)
			cleanup()
			files, _ := os.ReadDir(temp)
			if err == nil || path != "" || len(files) != 0 {
				t.Fatalf("bad media accepted or leaked: %q %v entries=%v", path, err, files)
			}
		})
	}
}

type zeroMixReader struct{}

func (zeroMixReader) Read(p []byte) (int, error) { clear(p); return len(p), nil }

type brokenMixReader struct{}

func (brokenMixReader) Read([]byte) (int, error) { return 0, io.ErrUnexpectedEOF }

func TestAudioMixRejectsPrivateNetworkAndForeignWorkspace(t *testing.T) {
	for _, source := range []string{"http://127.0.0.1/secret.mp4", "http://localhost/private.mp4", "file:///etc/passwd", "https://name:password@example.test/video.mp4"} {
		path, cleanup, err := resolveAudioMixMedia(t.Context(), source, "mine", true, network.SafeClient())
		cleanup()
		if err == nil || path != "" {
			t.Fatalf("unsafe source accepted: %s", source)
		}
	}
	called := false
	client := mixMediaClientFunc(func(*http.Request) (*http.Response, error) { called = true; return nil, errors.New("must not fetch") })
	_, cleanup, err := resolveAudioMixMedia(t.Context(), "/storage/other/clip.mp4", "mine", true, client)
	cleanup()
	if err == nil || called {
		t.Fatal("foreign local path fell back to remote download")
	}
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	client = mixMediaClientFunc(func(r *http.Request) (*http.Response, error) { return nil, r.Context().Err() })
	_, cleanup, err = resolveAudioMixMedia(ctx, "https://cdn.example.test/video.mp4", "mine", true, client)
	cleanup()
	if err == nil {
		t.Fatal("cancelled download succeeded")
	}
}
