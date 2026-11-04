package sales

import (
	"bytes"
	"database/sql"
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

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/network"
	"beike.local/cloud/src/backend/internal/platform/storage"
	"beike.local/cloud/src/backend/internal/system"
)

func setupVoiceSampleTest(t *testing.T) (config.Config, *sql.DB, *http.ServeMux, string) {
	t.Helper()
	cfg, db, _ := setupStudioSoundsTest(t)
	cfg.Root, _ = filepath.Abs(filepath.Join("..", "..", "..", ".."))
	ffmpeg, ok := system.FFmpegBinary(cfg.Root)
	if !ok {
		t.Skip("FFmpeg is not installed")
	}
	t.Setenv("AZHUO_CACHE_DIR", t.TempDir())
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/sales/studio-sounds", StudioSounds(cfg))
	mux.HandleFunc("PATCH /api/sales/studio-sounds/{id}", StudioSoundByID(cfg))
	return cfg, db, mux, ffmpeg
}

func writeVoiceSample(t *testing.T, rel string, seconds float64) (string, []byte) {
	t.Helper()
	frames := int(math.Round(seconds * 32000))
	raw := make([]byte, 44+frames*2)
	copy(raw, "RIFF")
	binary.LittleEndian.PutUint32(raw[4:], uint32(len(raw)-8))
	copy(raw[8:], "WAVEfmt ")
	binary.LittleEndian.PutUint32(raw[16:], 16)
	binary.LittleEndian.PutUint16(raw[20:], 1)
	binary.LittleEndian.PutUint16(raw[22:], 1)
	binary.LittleEndian.PutUint32(raw[24:], 32000)
	binary.LittleEndian.PutUint32(raw[28:], 64000)
	binary.LittleEndian.PutUint16(raw[32:], 2)
	binary.LittleEndian.PutUint16(raw[34:], 16)
	copy(raw[36:], "data")
	binary.LittleEndian.PutUint32(raw[40:], uint32(frames*2))
	for i := range frames {
		value := int16(12000 * math.Sin(2*math.Pi*440*float64(i)/32000))
		binary.LittleEndian.PutUint16(raw[44+i*2:], uint16(value))
	}
	file := storage.SafeWithin(storage.ResolveRoot(), rel)
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, raw, 0o644); err != nil {
		t.Fatal(err)
	}
	return file, raw
}

func callVoiceSampleMutation(t *testing.T, mux *http.ServeMux, method, id, workspace string, body any, want int) studioVoice {
	t.Helper()
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	path := "/api/sales/studio-sounds"
	if id != "" {
		path += "/" + id
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(raw))
	req = req.WithContext(httpx.WithWorkspace(req.Context(), workspace))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != want {
		t.Fatalf("mutation: want %d got %d: %s", want, rec.Code, rec.Body.String())
	}
	var response struct {
		Voice studioVoice `json:"voice"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	return response.Voice
}

func assertVoiceSampleDuration(t *testing.T, cfg config.Config, source string, want float64) string {
	t.Helper()
	file, err := localWorkspaceAudioFile(source, "local")
	if err != nil {
		t.Fatal(err)
	}
	duration, err := system.ProbeAudioDuration(t.Context(), cfg.Root, file)
	if err != nil || math.Abs(duration-want) > 0.000001 {
		t.Fatalf("sample duration: want %v got %v: %v", want, duration, err)
	}
	return file
}

func assertVoiceSampleOutputs(t *testing.T, want int) {
	t.Helper()
	files, err := filepath.Glob(filepath.Join(storage.ResolveRoot(), "local", "azhuo", "generated", "audio", "*", "sales_voice_*.wav"))
	if err != nil || len(files) != want {
		t.Fatalf("generated sample count: want %d got %v: %v", want, files, err)
	}
}

func TestVoiceSamplePreparationTrimsOnlyAboveFifteenSeconds(t *testing.T) {
	for _, seconds := range []float64{2, 15, 15.001, 20} {
		t.Run(fmt.Sprint(seconds), func(t *testing.T) {
			cfg, _, _, _ := setupVoiceSampleTest(t)
			input, original := writeVoiceSample(t, "local/source.wav", seconds)
			url, discard, err := prepareStudioVoiceSample(t.Context(), cfg, "local", "/storage/local/source.wav", network.SafeClient())
			if err != nil {
				t.Fatal(err)
			}
			defer discard()
			if (url != "/storage/local/source.wav") != (seconds > 15) {
				t.Fatalf("unexpected replacement for %v seconds: %q", seconds, url)
			}
			output := assertVoiceSampleDuration(t, cfg, url, math.Min(seconds, 15))
			if seconds > 15 {
				wav, err := os.ReadFile(output)
				if err != nil || !bytes.HasSuffix(wav, original[44:44+15*64000]) {
					t.Fatalf("trim did not preserve the first 15 seconds: %v", err)
				}
			}
			discard()
			assertVoiceSampleOutputs(t, 0)
			if after, err := os.ReadFile(input); err != nil || !bytes.Equal(after, original) {
				t.Fatalf("original sample changed or disappeared: %v", err)
			}
		})
	}
}

func TestVoiceSampleCreationAndReplacementPersistTheTrimmedReference(t *testing.T) {
	cfg, db, mux, ffmpeg := setupVoiceSampleTest(t)
	source, original := writeVoiceSample(t, "local/source.wav", 20)
	for _, ext := range []string{"mp3", "ogg"} {
		t.Run(ext, func(t *testing.T) {
			encoded := strings.TrimSuffix(source, ".wav") + "." + ext
			if raw, err := exec.CommandContext(t.Context(), ffmpeg, "-v", "error", "-y", "-i", source, encoded).CombinedOutput(); err != nil {
				t.Fatalf("encode sample: %v %s", err, raw)
			}
			voice := callVoiceSampleMutation(t, mux, http.MethodPost, "", "local", map[string]any{"name": "导入人声", "audioUrl": "/storage/local/source." + ext}, 200)
			assertVoiceSampleDuration(t, cfg, voice.SampleAudioURL, 15)
			callVoiceSampleMutation(t, mux, http.MethodPatch, voice.ID, "local", map[string]any{"audioUrl": "/storage/local/source.wav", "voiceId": "explicit-provider"}, 200)
			var audio, sample, voiceID string
			if err := db.QueryRow(`SELECT "audioUrl","sampleAudioUrl","voiceId" FROM "AvatarVoice" WHERE "id"=?`, voice.ID).Scan(&audio, &sample, &voiceID); err != nil {
				t.Fatal(err)
			}
			if audio != sample || sample == voice.SampleAudioURL || voiceID != "explicit-provider" {
				t.Fatalf("replacement references or provider ID differ: %q %q %q", audio, sample, voiceID)
			}
			assertVoiceSampleDuration(t, cfg, sample, 15)
			voices, err := queryStudioVoices(t.Context(), db, "local")
			if err != nil {
				t.Fatal(err)
			}
			found := false
			for _, item := range voices {
				if item.ID == voice.ID {
					found = item.SampleAudioURL == sample
				}
			}
			if !found {
				t.Fatal("catalog did not return the trimmed reference")
			}
		})
	}
	if after, err := os.ReadFile(source); err != nil || !bytes.Equal(after, original) {
		t.Fatalf("source was modified: %v", err)
	}
}

func TestVoiceSampleFailedPersistenceDiscardsTheNewClip(t *testing.T) {
	for _, mode := range []string{"create", "create-zero-rows", "replace", "zero-rows"} {
		t.Run(mode, func(t *testing.T) {
			_, db, mux, _ := setupVoiceSampleTest(t)
			writeVoiceSample(t, "local/source.wav", 20)
			operation, action := "UPDATE", "RAISE(ABORT,'unavailable')"
			method, id, want := http.MethodPatch, "voice_mine", 500
			if strings.HasPrefix(mode, "create") {
				operation, method, id = "INSERT", http.MethodPost, ""
				if mode == "create-zero-rows" {
					action = "RAISE(IGNORE)"
				}
			} else if mode == "zero-rows" {
				action, want = "RAISE(IGNORE)", 404
			}
			if _, err := db.Exec(`CREATE TRIGGER reject_voice BEFORE ` + operation + ` ON "AvatarVoice" BEGIN SELECT ` + action + `; END`); err != nil {
				t.Fatal(err)
			}
			callVoiceSampleMutation(t, mux, method, id, "local", map[string]any{"name": "失败的人声", "audioUrl": "/storage/local/source.wav"}, want)
			assertVoiceSampleOutputs(t, 0)
			var sample string
			if err := db.QueryRow(`SELECT "sampleAudioUrl" FROM "AvatarVoice" WHERE "id"='voice_mine'`).Scan(&sample); err != nil || sample != "" {
				t.Fatalf("failed update changed the previous sample: %q %v", sample, err)
			}
		})
	}
}

func TestVoiceSampleImportLeavesBackgroundMusicLengthUnchanged(t *testing.T) {
	cfg, db, mux, _ := setupVoiceSampleTest(t)
	writeVoiceSample(t, "local/source.wav", 20)
	callVoiceSampleMutation(t, mux, http.MethodPost, "", "local", map[string]any{"soundType": "bgm", "title": "长配乐", "audioUrl": "/storage/local/source.wav", "durationSec": 20}, 200)
	callVoiceSampleMutation(t, mux, http.MethodPatch, "bgm_mine", "local", map[string]any{"audioUrl": "/storage/local/source.wav", "durationSec": 20}, 200)
	tracks, err := queryStudioBgms(t.Context(), db, "local")
	if err != nil || len(tracks) != 2 {
		t.Fatalf("background music save: %v %v", tracks, err)
	}
	for _, track := range tracks {
		wantDuration := 20.0
		if track.ID == "bgm_mine" {
			wantDuration = 15 // Existing BGM metadata is retained by this patch endpoint.
		}
		if track.AudioURL != "/storage/local/source.wav" || track.DurationSec != wantDuration {
			t.Fatalf("background music was cropped: %+v", track)
		}
	}
	assertVoiceSampleDuration(t, cfg, "/storage/local/source.wav", 20)
	assertVoiceSampleOutputs(t, 0)
}

func TestVoiceSamplePreparationRejectsInvalidAndForeignAudio(t *testing.T) {
	_, _, mux, ffmpeg := setupVoiceSampleTest(t)
	foreign := strings.Repeat("a", 64)
	writeVoiceSample(t, foreign+"/foreign.wav", 20)
	file, _ := writeVoiceSample(t, "local/invalid.wav", 2)
	if err := os.WriteFile(file, []byte("#EXTM3U\nhttp://127.0.0.1/private"), 0o644); err != nil {
		t.Fatal(err)
	}
	oversized := filepath.Join(filepath.Dir(file), "oversized.wav")
	f, err := os.Create(oversized)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.Truncate(audioMixAudioLimit + 1); err != nil {
		t.Fatal(err)
	}
	f.Close()
	silent := filepath.Join(filepath.Dir(file), "silent.m4a")
	if raw, err := exec.CommandContext(t.Context(), ffmpeg, "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=160x160:r=10:d=2", "-an", "-c:v", "libx264", "-f", "mp4", silent).CombinedOutput(); err != nil {
		t.Fatalf("silent fixture: %v %s", err, raw)
	}
	for _, source := range []string{"/storage/" + foreign + "/foreign.wav", "/storage/local/missing.wav", "/storage/local/invalid.wav", "/storage/local/oversized.wav", "/storage/local/silent.m4a", "file:///etc/passwd", "http://127.0.0.1/private.wav"} {
		callVoiceSampleMutation(t, mux, http.MethodPost, "", "local", map[string]any{"name": "无效人声", "audioUrl": source}, 400)
	}
	assertVoiceSampleOutputs(t, 0)
}

func TestVoiceSampleRemotePreparationCleansTemporaryDownloads(t *testing.T) {
	for _, seconds := range []float64{2, 20} {
		t.Run(fmt.Sprint(seconds), func(t *testing.T) {
			cfg, _, _, _ := setupVoiceSampleTest(t)
			_, wav := writeVoiceSample(t, "local/source.wav", seconds)
			temp := t.TempDir()
			t.Setenv("TMPDIR", temp)
			source := "https://cdn.example.test/sample?signature=a%2Fb&expires=100"
			client := mixMediaClientFunc(func(req *http.Request) (*http.Response, error) {
				if req.URL.String() != source {
					t.Fatalf("signed URL changed: %s", req.URL)
				}
				return &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewReader(wav)), ContentLength: int64(len(wav))}, nil
			})
			url, discard, err := prepareStudioVoiceSample(t.Context(), cfg, "local", source, client)
			if err != nil {
				t.Fatal(err)
			}
			defer discard()
			if (url != source) != (seconds > 15) {
				t.Fatalf("unexpected remote sample reference: %q", url)
			}
			if seconds > 15 {
				assertVoiceSampleDuration(t, cfg, url, 15)
			}
			files, err := os.ReadDir(temp)
			if err != nil || len(files) != 0 {
				t.Fatalf("remote download leaked: %v %v", files, err)
			}
			discard()
			assertVoiceSampleOutputs(t, 0)
		})
	}
}
