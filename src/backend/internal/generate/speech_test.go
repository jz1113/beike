package generate

import (
	"context"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSynthesizeSpeechBinaryJSONAndFailure(t *testing.T) {
	audio := []byte("ID3unit-test-audio")
	var mode string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch mode {
		case "binary":
			w.Header().Set("Content-Type", "audio/mpeg")
			_, _ = w.Write(audio)
		case "json":
			_, _ = w.Write([]byte(`{"data":{"audio":"` + hex.EncodeToString(audio) + `"}}`))
		default:
			w.WriteHeader(http.StatusBadGateway)
			_, _ = w.Write([]byte(`{"message":"quota exceeded"}`))
		}
	}))
	defer server.Close()
	previous := ModelHTTP
	ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { ModelHTTP = previous })

	req := SpeechRequest{Base: server.URL, APIKey: "secret", Model: "speech-01-hd", Text: "你好", Voice: "alloy", Format: "mp3"}
	mode = "binary"
	binary, err := SynthesizeSpeech(context.Background(), req)
	if err != nil || string(binary.Bytes) != string(audio) {
		t.Fatalf("binary %#v %v", binary, err)
	}
	mode = "json"
	encoded, err := SynthesizeSpeech(context.Background(), req)
	if err != nil || string(encoded.Bytes) != string(audio) {
		t.Fatalf("json %#v %v", encoded, err)
	}
	mode = "fail"
	_, err = SynthesizeSpeech(context.Background(), req)
	if err == nil || !strings.Contains(err.Error(), "quota exceeded") {
		t.Fatalf("failure %v", err)
	}
}

func TestSynthesizeSpeechFallsThroughServerError(t *testing.T) {
	audio := []byte("ID3fallback-audio")
	var hits []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits = append(hits, r.URL.Path)
		if r.URL.Path == "/v1/t2a_v2" {
			w.WriteHeader(http.StatusBadGateway)
			_, _ = w.Write([]byte(`{"message":"upstream down"}`))
			return
		}
		w.Header().Set("Content-Type", "audio/mpeg")
		_, _ = w.Write(audio)
	}))
	defer server.Close()
	previous := ModelHTTP
	ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { ModelHTTP = previous })

	result, err := SynthesizeSpeech(context.Background(), SpeechRequest{
		Base: server.URL, APIKey: "secret", Model: "speech-2.8-hd", Text: "你好", Voice: "alloy", Format: "mp3",
	})
	if err != nil || string(result.Bytes) != string(audio) {
		t.Fatalf("fallback %#v %v hits %v", result, err, hits)
	}
	if len(hits) < 2 || hits[0] != "/v1/t2a_v2" || hits[1] != "/v1/audio/speech" {
		t.Fatalf("hits %v", hits)
	}
}
