package generate

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"beike.local/cloud/src/backend/internal/system"
)

func writeLegacyOggVoice(t *testing.T, root, rel string) string {
	t.Helper()
	source := writeReferenceWav(t, root, "local/audio/source.wav", 3)
	ffmpeg, ok := system.FFmpegBinary(audioTestProjectRoot(t))
	if !ok {
		t.Fatal("FFmpeg is required for voice-library compatibility tests")
	}
	path := filepath.Join(root, filepath.FromSlash(rel))
	cmd := exec.Command(ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", source, "-c:a", "flac", "-f", "ogg", path)
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("create real Ogg fixture: %v %s", err, output)
	}
	return path
}

func assertNoAudioConversionTemps(t *testing.T, dir string) {
	t.Helper()
	files, err := filepath.Glob(filepath.Join(dir, "video-reference-audio-*"))
	if err != nil || len(files) != 0 {
		t.Fatalf("temporary converted audio leaked: %v %v", files, err)
	}
}

func TestLegacyLocalOggVoiceConvertsToPCMMonoWavWithoutChangingSource(t *testing.T) {
	for _, model := range []string{"doubao-seedance-2.0-mini", "doubao-seedance-2.5", "wan3.0-video"} {
		t.Run(model, func(t *testing.T) {
			seedanceAssetCache = sync.Map{}
			store := &wanReferenceObjectStore{}
			root := setupWanStorage(t, store, "")
			temporary := t.TempDir()
			t.Setenv("TMPDIR", temporary)
			originalPath := writeLegacyOggVoice(t, root, "local/audio/legacy.ogg")
			original, err := os.ReadFile(originalPath)
			if err != nil {
				t.Fatal(err)
			}
			var generations, audioRegistrations atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var body map[string]any
				_ = json.NewDecoder(r.Body).Decode(&body)
				if r.URL.Path == "/seedance/v3/assets/create" {
					if body["assetType"] == "Audio" {
						audioRegistrations.Add(1)
					}
					_, _ = w.Write([]byte(`{"code":0,"data":{"assetId":"converted-voice","status":"Active"}}`))
					return
				}
				generations.Add(1)
				var ref string
				if model == "wan3.0-video" {
					media := body["input"].(map[string]any)["media"].([]any)
					last := media[len(media)-1].(map[string]any)
					if last["type"] != "reference_audio" {
						t.Errorf("Wan did not receive converted WAV reference: %#v", last)
					}
					ref, _ = last["url"].(string)
				} else {
					content := body["content"].([]any)
					last := content[len(content)-1].(map[string]any)
					if last["type"] != "audio_url" || last["role"] != "reference_audio" {
						t.Errorf("Seedance did not receive converted WAV reference: %#v", last)
					}
					ref, _ = last["audio_url"].(map[string]any)["url"].(string)
				}
				if !strings.HasPrefix(ref, "https://reference-bucket.") || !strings.Contains(ref, ".wav?") || !strings.Contains(ref, "x-oss-signature=") {
					t.Errorf("converted WAV reference is not signed HTTPS: %q", ref)
				}
				assertNoAudioConversionTemps(t, temporary)
				_, _ = w.Write([]byte(`{"task_id":"converted-voice-video"}`))
			}))
			defer server.Close()
			storeSeedanceCachedURI(seedanceAssetScope{base: server.URL, apiKey: "secret", model: model}, "Audio", "/storage/local/audio/legacy.ogg", "asset://legacy-cached-ogg")
			cfg := videoSubmissionTestConfig(t, server)
			cfg.Root = audioTestProjectRoot(t)
			handler := Video(cfg)
			response := postVideoWithAudio(t, handler, server.URL, model, "converted-voice", "/storage/local/audio/legacy.ogg", "local")
			if response.Code != http.StatusOK || generations.Load() != 1 || store.calls != 1 || audioRegistrations.Load() != 0 {
				t.Fatalf("legacy voice failed: %d %s generations=%d uploads=%d", response.Code, response.Body.String(), generations.Load(), store.calls)
			}
			if len(store.body) < 36 || string(store.body[:4]) != "RIFF" || string(store.body[8:12]) != "WAVE" ||
				binary.LittleEndian.Uint16(store.body[20:22]) != 1 || binary.LittleEndian.Uint16(store.body[22:24]) != 1 || binary.LittleEndian.Uint16(store.body[34:36]) != 16 {
				t.Fatal("uploaded audio is not PCM16 mono WAV")
			}
			convertedPath := filepath.Join(t.TempDir(), "uploaded.wav")
			if err := os.WriteFile(convertedPath, store.body, 0600); err != nil {
				t.Fatal(err)
			}
			before, beforeErr := system.ProbeAudioDuration(context.Background(), cfg.Root, originalPath)
			after, afterErr := system.ProbeAudioDuration(context.Background(), cfg.Root, convertedPath)
			if beforeErr != nil || afterErr != nil || math.Abs(before-after) > 0.025 {
				t.Fatalf("conversion changed voice duration: before=%f after=%f errors=%v/%v", before, after, beforeErr, afterErr)
			}
			preserved, err := os.ReadFile(originalPath)
			if err != nil || !bytes.Equal(preserved, original) {
				t.Fatal("voice-library source file was changed", err)
			}
			assertNoAudioConversionTemps(t, temporary)
			// Once accepted, even a missing source cannot trigger another conversion.
			if err := os.Remove(originalPath); err != nil {
				t.Fatal(err)
			}
			repeated := postVideoWithAudio(t, handler, server.URL, model, "converted-voice", "/storage/local/audio/legacy.ogg", "local")
			if repeated.Code != 200 || store.calls != 1 || generations.Load() != 1 || !strings.Contains(repeated.Body.String(), `"reused":true`) {
				t.Fatal("replay reconverted or regenerated accepted voice", repeated.Code, repeated.Body.String())
			}
			assertNoAudioConversionTemps(t, temporary)
		})
	}
}

func TestLegacyAudioConversionCleansTempsOnFailureAndRejectsRenamedFormats(t *testing.T) {
	store := &wanReferenceObjectStore{}
	root := setupWanStorage(t, store, "")
	temporary := t.TempDir()
	t.Setenv("TMPDIR", temporary)
	path := writeLegacyOggVoice(t, root, "local/audio/legacy.ogg")
	projectRoot := audioTestProjectRoot(t)
	original, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, _, _, err := prepareLocalReferenceAudio(ctx, projectRoot, path); err == nil {
		t.Fatal("cancelled conversion succeeded")
	}
	assertNoAudioConversionTemps(t, temporary)
	store.err = errors.New("upload rejected")
	cfg := resolveVideoStorageConfig(nil, map[string]json.RawMessage{"storageConfig": json.RawMessage(wanOSSStorageJSON)})
	if cfg == nil {
		t.Fatal("test storage configuration unavailable")
	}
	if _, err := uploadAudioReference(context.Background(), projectRoot, "/storage/local/audio/legacy.ogg", "local", false, *cfg); err == nil {
		t.Fatal("failed upload succeeded")
	}
	assertNoAudioConversionTemps(t, temporary)
	for _, ext := range []string{"wav", "mp3", "unknown"} {
		fake := filepath.Join(root, "local/audio/renamed."+ext)
		if err := os.WriteFile(fake, original, 0600); err != nil {
			t.Fatal(err)
		}
		if _, _, _, err := prepareLocalReferenceAudio(context.Background(), projectRoot, fake); err == nil {
			t.Fatal("renamed or unrecognized audio format was silently accepted", ext)
		}
	}
	preserved, err := os.ReadFile(path)
	if err != nil || !bytes.Equal(preserved, original) {
		t.Fatal("failure changed source audio", err)
	}
	assertNoAudioConversionTemps(t, temporary)
}

func TestReferenceAudioTranscodeClipsWithinProviderDurationLimits(t *testing.T) {
	for _, item := range []struct {
		name, input, output string
		seconds             int
		maximum             float64
	}{
		{"Vidu MP3 limit", "wav", "mp3", 15, 12},
		{"Vidu MP3 exact boundary", "wav", "mp3", 12, 12},
		{"MP3 input", "mp3", "mp3", 15, 12},
		{"WAV limit", "wav", "wav", 30, 15},
		{"legacy OGG", "ogg", "wav", 3, 2},
	} {
		t.Run(item.name, func(t *testing.T) {
			root := t.TempDir()
			temporary := t.TempDir()
			t.Setenv("TMPDIR", temporary)
			projectRoot := audioTestProjectRoot(t)
			path := writeReferenceWav(t, root, "local/audio/voice.wav", item.seconds)
			if item.input == "ogg" {
				path = writeLegacyOggVoice(t, root, "local/audio/voice.ogg")
			} else if item.input == "mp3" {
				converted, _, _, err := transcodeReferenceAudio(context.Background(), projectRoot, path, "mp3", 0)
				if err != nil {
					t.Fatal("create MP3 source", err)
				}
				path = filepath.Join(root, "local/audio/voice.mp3")
				if err := os.WriteFile(path, converted, 0600); err != nil {
					t.Fatal(err)
				}
			}
			original, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			converted, ext, mime, err := transcodeReferenceAudio(context.Background(), projectRoot, path, item.output, item.maximum)
			if err != nil {
				t.Fatal("clip audio", err)
			}
			if ext != item.output || item.output == "mp3" && mime != "audio/mpeg" || item.output == "wav" && mime != "audio/wav" {
				t.Fatalf("unexpected clipped audio format: %s %s", ext, mime)
			}
			output := filepath.Join(t.TempDir(), "clipped."+ext)
			if err := os.WriteFile(output, converted, 0600); err != nil {
				t.Fatal(err)
			}
			duration, err := system.ProbeAudioDuration(context.Background(), projectRoot, output)
			if err != nil || duration > item.maximum || duration < item.maximum-0.15 {
				t.Fatalf("clipped duration outside limit: %.6fs, maximum %.6fs, error %v", duration, item.maximum, err)
			}
			preserved, err := os.ReadFile(path)
			if err != nil || !bytes.Equal(preserved, original) {
				t.Fatal("clipping changed original voice sample", err)
			}
			assertNoAudioConversionTemps(t, temporary)
		})
	}
}

func TestReferenceAudioTranscodeKeepsValidBytesAndCleansFailedClips(t *testing.T) {
	root := t.TempDir()
	projectRoot := audioTestProjectRoot(t)
	path := writeReferenceWav(t, root, "local/audio/voice.wav", 3)
	original, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	unchanged, _, _, err := transcodeReferenceAudio(context.Background(), projectRoot, path, "wav", 0)
	if err != nil || !bytes.Equal(original, unchanged) {
		t.Fatal("valid audio was unnecessarily re-encoded", err)
	}
	temporary := t.TempDir()
	t.Setenv("TMPDIR", temporary)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, _, _, err := transcodeReferenceAudio(ctx, projectRoot, path, "mp3", 2); err == nil {
		t.Fatal("cancelled clip succeeded")
	}
	for _, limit := range []float64{math.NaN(), math.Inf(1), 0.05} {
		if _, _, _, err := transcodeReferenceAudio(context.Background(), projectRoot, path, "mp3", limit); err == nil {
			t.Fatal("invalid clip limit accepted", limit)
		}
	}
	if _, _, _, err := transcodeReferenceAudio(context.Background(), projectRoot, path, "unsupported", 2); err == nil {
		t.Fatal("unsupported output format accepted")
	}
	preserved, err := os.ReadFile(path)
	if err != nil || !bytes.Equal(original, preserved) {
		t.Fatal("failed clip changed source", err)
	}
	assertNoAudioConversionTemps(t, temporary)
}
