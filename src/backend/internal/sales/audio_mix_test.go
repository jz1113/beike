package sales

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/storage"
	"beike.local/cloud/src/backend/internal/system"
)

func TestBuiltinBgmRemainsPlayableWithoutPopulatingMaterialLibrary(t *testing.T) {
	mux := http.NewServeMux()
	cfg := setupStudioCatalogTestConfig(t)
	mux.HandleFunc("GET /api/sales/bgm/{id}", BuiltinBgmAudio())
	mux.HandleFunc("GET /api/sales/studio-assets", StudioAssets(cfg))

	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/sales/bgm/bgm_french_lazy", nil))
	if rec.Code != 200 || !strings.HasPrefix(rec.Header().Get("Content-Type"), "audio/wav") || !strings.HasPrefix(rec.Body.String(), "RIFF") {
		t.Fatalf("expected valid WAV response: code=%d ct=%s", rec.Code, rec.Header().Get("Content-Type"))
	}

	miss := httptest.NewRecorder()
	mux.ServeHTTP(miss, httptest.NewRequest(http.MethodGet, "/api/sales/bgm/unknown", nil))
	if miss.Code != 404 {
		t.Fatalf("expected 404 for unknown bgm, got %d", miss.Code)
	}

	assetsRec := httptest.NewRecorder()
	mux.ServeHTTP(assetsRec, httptest.NewRequest(http.MethodGet, "/api/sales/studio-assets", nil))
	var catalog struct {
		Personas []studioPersona `json:"personas"`
		Scenes   []studioScene   `json:"scenes"`
		Actions  []studioAction  `json:"actions"`
		Voices   []studioVoice   `json:"voices"`
		Bgms     []studioBgm     `json:"bgms"`
	}
	if assetsRec.Code != 200 || json.Unmarshal(assetsRec.Body.Bytes(), &catalog) != nil {
		t.Fatalf("invalid material catalog: %d %s", assetsRec.Code, assetsRec.Body.String())
	}
	if catalog.Personas == nil || catalog.Scenes == nil || catalog.Actions == nil || catalog.Voices == nil || catalog.Bgms == nil ||
		len(catalog.Personas)+len(catalog.Scenes)+len(catalog.Actions)+len(catalog.Voices)+len(catalog.Bgms) != 0 {
		t.Fatalf("expected empty material library: %s", assetsRec.Body.String())
	}
}

func TestAudioMixCombinesVideoVoiceoverAndBuiltinBgm(t *testing.T) {
	root, _ := filepath.Abs(filepath.Join("..", "..", "..", ".."))
	ffmpeg, ok := system.FFmpegBinary(root)
	if !ok {
		t.Skip("FFmpeg is not installed")
	}
	cacheDir := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", cacheDir)

	videoRel := "local/azhuo/generated/videos/raw.mp4"
	videoAbs := filepath.Join(cacheDir, videoRel)
	if err := os.MkdirAll(filepath.Dir(videoAbs), 0o755); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, ffmpeg, "-y", "-f", "lavfi", "-i", "color=c=black:s=360x640:r=25:d=1.8", "-c:v", "libx264", "-pix_fmt", "yuv420p", videoAbs)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("encode video: %v\n%s", err, out)
	}

	voRel := "local/azhuo/generated/audio/vo.wav"
	voAbs := filepath.Join(cacheDir, voRel)
	if err := os.MkdirAll(filepath.Dir(voAbs), 0o755); err != nil {
		t.Fatal(err)
	}
	track, _ := lookupBuiltinBgm("bgm_warm_home")
	if err := os.WriteFile(voAbs, renderBuiltinBgmWAV(track)[:60000], 0o644); err != nil {
		t.Fatal(err)
	}

	for _, test := range []struct {
		name   string
		remote bool
		volume float64
	}{
		{"local", false, 0.16},
		{"remote", true, 0.16},
		{"muted-bgm-preserves-voice-level", false, 0},
	} {
		t.Run(test.name, func(t *testing.T) {
			videoURL, voiceURL := "/storage/"+videoRel, "/storage/"+voRel
			handler := AudioMix(config.Config{Root: root})
			if test.remote {
				videoURL, voiceURL = "https://cdn.example.test/video?sig=a%2Fb", "https://cdn.example.test/voice?sig=b%2Fc"
				handler = audioMixHandler(config.Config{Root: root}, mixMediaClientFunc(func(r *http.Request) (*http.Response, error) {
					file := videoAbs
					if r.URL.Path == "/voice" {
						file = voAbs
					}
					raw, err := os.ReadFile(file)
					if err != nil {
						return nil, err
					}
					return &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewReader(raw)), ContentLength: int64(len(raw))}, nil
				}))
			}
			body := fmt.Sprintf(`{"videoUrl":%q,"voiceMode":"voiceover","voiceoverUrl":%q,"bgmId":"bgm_french_lazy","bgmVolume":%g}`, videoURL, voiceURL, test.volume)
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/sales/audio-mix", strings.NewReader(body)))
			if rec.Code != 200 {
				t.Fatalf("audio-mix failed: %d %s", rec.Code, rec.Body.String())
			}
			var resp struct {
				Success   bool   `json:"success"`
				VideoURL  string `json:"videoUrl"`
				DuckedBgm bool   `json:"duckedBgm"`
			}
			_ = json.Unmarshal(rec.Body.Bytes(), &resp)
			if !resp.Success || !resp.DuckedBgm || !strings.HasPrefix(resp.VideoURL, "/storage/local/") {
				t.Fatalf("unexpected mix response: %+v", resp)
			}
			mixedFile := storage.StoredFile(strings.TrimPrefix(resp.VideoURL, "/storage/"))
			probe, err := system.ProbeVideo(root, mixedFile)
			if err != nil || !probe.HasAudio || probe.Duration < 1.5 {
				t.Fatalf("mixed video probe invalid: %+v err=%v", probe, err)
			}
			if test.volume == 0 {
				sourceLevel := audioMixSampleLevel(t, ffmpeg, voAbs)
				mixedLevel := audioMixSampleLevel(t, ffmpeg, mixedFile)
				if ratio := mixedLevel / sourceLevel; ratio < 0.85 || ratio > 1.15 {
					t.Fatalf("muted BGM changed voice level: source=%v mixed=%v ratio=%v", sourceLevel, mixedLevel, ratio)
				}
			}
		})
	}
}

func audioMixSampleLevel(t *testing.T, ffmpeg, file string) float64 {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()
	raw, err := exec.CommandContext(ctx, ffmpeg, "-v", "error", "-i", file, "-t", "0.25", "-map", "0:a:0", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", "-f", "s16le", "pipe:1").Output()
	if err != nil || len(raw) < 2 {
		t.Fatalf("decode mixed audio samples: %v (%d bytes)", err, len(raw))
	}
	var sum float64
	for i := 0; i+1 < len(raw); i += 2 {
		sample := float64(int16(binary.LittleEndian.Uint16(raw[i:])))
		sum += sample * sample
	}
	level := math.Sqrt(sum / float64(len(raw)/2))
	if level == 0 {
		t.Fatal("expected audible voice samples")
	}
	return level
}

func TestAudioMixRespectsExplicitMuteAndUsesDefaultsOnlyWhenOmitted(t *testing.T) {
	for _, test := range []struct {
		body    string
		speech  bool
		want    float64
		invalid bool
	}{
		{`{}`, true, 0.16, false},
		{`{}`, false, 0.38, false},
		{`{"bgmVolume":0}`, true, 0, false},
		{`{"bgmVolume":0}`, false, 0, false},
		{`{"bgmVolume":1.2}`, true, 1.2, false},
		{`{"bgmVolume":-0.1}`, false, 0, true},
		{`{"bgmVolume":1.3}`, false, 0, true},
	} {
		var request audioMixRequest
		if err := json.Unmarshal([]byte(test.body), &request); err != nil {
			t.Fatal(err)
		}
		got, err := audioMixBgmVolume(request.BgmVolume, test.speech)
		if (err != nil) != test.invalid || got != test.want {
			t.Fatalf("%s speech=%v: volume=%v err=%v", test.body, test.speech, got, err)
		}
	}
}

func TestAudioMixConvertsVideoCodecsForMP4Delivery(t *testing.T) {
	root, _ := filepath.Abs(filepath.Join("..", "..", "..", ".."))
	ffmpeg, ok := system.FFmpegBinary(root)
	if !ok {
		t.Skip("FFmpeg is not installed")
	}
	for _, fixture := range []struct {
		extension string
		args      []string
		remote    bool
	}{
		{"webm", []string{"-c:v", "libvpx", "-deadline", "realtime"}, false},
		{"mov", []string{"-c:v", "prores_ks", "-pix_fmt", "yuv422p10le"}, true},
	} {
		t.Run(fixture.extension, func(t *testing.T) {
			cache := t.TempDir()
			t.Setenv("AZHUO_CACHE_DIR", cache)
			rel := "local/source." + fixture.extension
			input := filepath.Join(cache, rel)
			if err := os.MkdirAll(filepath.Dir(input), 0o755); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(t.Context(), 20*time.Second)
			defer cancel()
			args := append([]string{"-y", "-f", "lavfi", "-i", "color=c=black:s=160x160:r=10:d=1"}, fixture.args...)
			args = append(args, input)
			if out, err := exec.CommandContext(ctx, ffmpeg, args...).CombinedOutput(); err != nil {
				t.Fatalf("create video fixture: %v %s", err, out)
			}
			sourceURL := "/storage/" + rel
			handler := AudioMix(config.Config{Root: root})
			if fixture.remote {
				raw, err := os.ReadFile(input)
				if err != nil {
					t.Fatal(err)
				}
				sourceURL = "https://cdn.example.test/signed-video?sig=mov"
				handler = audioMixHandler(config.Config{Root: root}, mixMediaClientFunc(func(*http.Request) (*http.Response, error) {
					return &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewReader(raw)), ContentLength: int64(len(raw))}, nil
				}))
			}
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/sales/audio-mix", strings.NewReader(`{"videoUrl":"`+sourceURL+`","bgmId":"bgm_warm_home"}`)))
			if rec.Code != 200 {
				t.Fatalf("video could not become MP4: %d %s", rec.Code, rec.Body.String())
			}
			var result struct {
				VideoURL string `json:"videoUrl"`
			}
			if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil {
				t.Fatal(err)
			}
			file := storage.StoredFile(strings.TrimPrefix(result.VideoURL, "/storage/"))
			probe, err := system.ProbeVideo(root, file)
			if err != nil || !probe.HasAudio || probe.Duration < 0.9 {
				t.Fatalf("invalid MP4 delivery: %#v %v", probe, err)
			}
		})
	}
}
