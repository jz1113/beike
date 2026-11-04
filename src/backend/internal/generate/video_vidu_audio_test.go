package generate

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"math"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/platform/storage"
	"beike.local/cloud/src/backend/internal/system"
)

func viduAudioTestStorage(t *testing.T) *storage.ObjectConfig {
	t.Helper()
	cfg := resolveVideoStorageConfig(nil, map[string]json.RawMessage{"storageConfig": json.RawMessage(wanOSSStorageJSON)})
	if cfg == nil {
		t.Fatal("test storage configuration unavailable")
	}
	return cfg
}

func assertNoViduAudioTemps(t *testing.T, dir string) {
	t.Helper()
	files, err := filepath.Glob(filepath.Join(dir, "video-reference-audio-*.mp3"))
	if err != nil || len(files) != 0 {
		t.Fatalf("temporary Vidu audio leaked: %v %v", files, err)
	}
}

func TestViduAudioConvertsLocalVoiceToSignedMP3WithoutChangingSource(t *testing.T) {
	for _, ext := range []string{"wav", "ogg"} {
		t.Run(ext, func(t *testing.T) {
			store := &wanReferenceObjectStore{}
			root := setupWanStorage(t, store, "")
			temporary := t.TempDir()
			t.Setenv("TMPDIR", temporary)
			path := writeReferenceWav(t, root, "local/audio/voice.wav", 3)
			if ext == "ogg" {
				path = writeLegacyOggVoice(t, root, "local/audio/voice.ogg")
			}
			original, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			body := map[string]any{"sounds": []string{"/storage/local/audio/voice." + ext}}
			projectRoot := audioTestProjectRoot(t)
			if err := prepareViduAudioReferences(context.Background(), projectRoot, body, "local", false, viduAudioTestStorage(t)); err != nil {
				t.Fatal("Vidu voice preparation failed", err)
			}
			ref := body["sounds"].([]string)[0]
			parsed, err := url.Parse(ref)
			if err != nil || parsed.Host != "reference-bucket.oss-cn-beijing.aliyuncs.com" || parsed.Path != "/"+store.key || parsed.Query().Get("x-oss-signature") == "" {
				t.Fatal("Vidu voice did not use signed public URL")
			}
			if store.calls != 1 || store.contentType != "audio/mpeg" || !strings.HasSuffix(store.key, ".mp3") {
				t.Fatal("Vidu audio was not uploaded once as MP3")
			}
			convertedPath := filepath.Join(t.TempDir(), "uploaded.mp3")
			if err := os.WriteFile(convertedPath, store.body, 0600); err != nil {
				t.Fatal(err)
			}
			if _, extension, _, err := readLocalReferenceAudio(convertedPath); err != nil || extension != "mp3" {
				t.Fatal("uploaded bytes are not MP3", err)
			}
			before, beforeErr := system.ProbeAudioDuration(context.Background(), projectRoot, path)
			after, afterErr := system.ProbeAudioDuration(context.Background(), projectRoot, convertedPath)
			if beforeErr != nil || afterErr != nil || math.Abs(before-after) > 0.1 {
				t.Fatalf("voice timing changed: %f -> %f (%v/%v)", before, after, beforeErr, afterErr)
			}
			preserved, err := os.ReadFile(path)
			if err != nil || !bytes.Equal(original, preserved) {
				t.Fatal("Vidu conversion changed voice-library source", err)
			}
			assertNoViduAudioTemps(t, temporary)
		})
	}
}

func TestViduAudioPreservesExistingMP3AndRemoteReferenceOrder(t *testing.T) {
	store := &wanReferenceObjectStore{}
	root := setupWanStorage(t, store, "")
	wav := writeReferenceWav(t, root, "local/audio/voice.wav", 3)
	mp3, err := prepareLocalViduReferenceAudio(context.Background(), audioTestProjectRoot(t), wav)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(root, "local/audio/voice.mp3")
	if err := os.WriteFile(path, mp3, 0600); err != nil {
		t.Fatal(err)
	}
	const remote = "https://cdn.example/voice.mp3?signature=a%2Fb&expires=100"
	body := map[string]any{"sounds": []string{remote, "/storage/local/audio/voice.mp3", "http://cdn.example/voice-two.mp3"}}
	if err := prepareViduAudioReferences(context.Background(), audioTestProjectRoot(t), body, "local", false, viduAudioTestStorage(t)); err != nil {
		t.Fatal(err)
	}
	refs := body["sounds"].([]string)
	if len(refs) != 3 || refs[0] != remote || refs[2] != "http://cdn.example/voice-two.mp3" || store.calls != 1 || !bytes.Equal(store.body, mp3) {
		t.Fatal("MP3 bytes, remote links or audio order changed")
	}
	if err := prepareViduAudioReferences(context.Background(), audioTestProjectRoot(t), map[string]any{}, "local", false, nil); err != nil {
		t.Fatal("video without reference audio must not need storage", err)
	}
}

func TestViduAudioRejectsUnavailableAndInvalidReferences(t *testing.T) {
	for _, ref := range []string{"", "asset://voice", "oss://bucket/voice.mp3", "file:///private/voice.mp3", "data:audio/mpeg;base64,abc", "https://user:secret@cdn.example/voice.mp3", "https:///voice.mp3"} {
		body := map[string]any{"sounds": []string{ref}}
		if err := prepareViduAudioReferences(context.Background(), audioTestProjectRoot(t), body, "local", false, nil); err == nil {
			t.Fatal("invalid reference accepted", ref)
		}
	}
	if err := prepareViduAudioReferences(context.Background(), audioTestProjectRoot(t), map[string]any{"sounds": []string{"/storage/local/audio/voice.mp3"}}, "local", false, nil); err == nil || !strings.Contains(err.Error(), "未配置对象存储") {
		t.Fatal("local voice without storage accepted", err)
	}
	store := &wanReferenceObjectStore{}
	root := setupWanStorage(t, store, "")
	path := writeReferenceWav(t, root, "local/audio/voice.wav", 3)
	original, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	temporary := t.TempDir()
	t.Setenv("TMPDIR", temporary)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := prepareLocalViduReferenceAudio(ctx, audioTestProjectRoot(t), path); err == nil {
		t.Fatal("cancelled Vidu conversion succeeded")
	}
	assertNoViduAudioTemps(t, temporary)
	store.err = errors.New("upload failed")
	body := map[string]any{"sounds": []string{"/storage/local/audio/voice.wav"}}
	if err := prepareViduAudioReferences(context.Background(), audioTestProjectRoot(t), body, "local", false, viduAudioTestStorage(t)); err == nil || !strings.Contains(err.Error(), "上传参考音频失败") {
		t.Fatal("failed Vidu voice upload accepted", err)
	}
	assertNoViduAudioTemps(t, temporary)
	preserved, err := os.ReadFile(path)
	if err != nil || !bytes.Equal(original, preserved) {
		t.Fatal("failed Vidu preparation changed source", err)
	}
}
