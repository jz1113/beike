package sales

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/storage"
	"beike.local/cloud/src/backend/internal/system"
)

func setupBgmImportTest(t *testing.T) (config.Config, *sql.DB, string) {
	t.Helper()
	cfg := setupSalesTestConfig(t)
	cfg.Root, _ = filepath.Abs(filepath.Join("..", "..", "..", ".."))
	ffmpeg, ok := system.FFmpegBinary(cfg.Root)
	if !ok {
		t.Skip("FFmpeg is not installed")
	}
	t.Setenv("AZHUO_CACHE_DIR", t.TempDir())
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return cfg, db, ffmpeg
}

func callBgmImport(t *testing.T, cfg config.Config, workspace, body string, wantCode int) studioBgm {
	t.Helper()
	r := httptest.NewRequest(http.MethodPost, "/api/sales/studio-bgms/import", strings.NewReader(body))
	r = r.WithContext(httpx.WithWorkspace(r.Context(), workspace))
	rec := httptest.NewRecorder()
	StudioBgmImport(cfg).ServeHTTP(rec, r)
	if rec.Code != wantCode {
		t.Fatalf("import: want %d got %d: %s", wantCode, rec.Code, rec.Body.String())
	}
	var response struct {
		Bgm studioBgm `json:"bgm"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	return response.Bgm
}

func TestStudioBgmBuiltinImportIsOptInAndIdempotent(t *testing.T) {
	cfg, db, _ := setupBgmImportTest(t)
	rec := httptest.NewRecorder()
	StudioBuiltinBgms().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/sales/studio-bgms/builtin", nil))
	var list struct {
		Bgms []studioBgm `json:"bgms"`
	}
	if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &list) != nil || len(list.Bgms) != 5 {
		t.Fatalf("unexpected builtin list: %s", rec.Body.String())
	}
	if rows, err := queryStudioBgms(t.Context(), db, "local"); err != nil || len(rows) != 0 {
		t.Fatalf("listing builtins populated library: %#v %v", rows, err)
	}
	first := callBgmImport(t, cfg, "local", `{"builtinId":"bgm_warm_home"}`, 200)
	if first.DurationSec < 11.9 || first.DurationSec > 12.1 || !first.Editable || !strings.Contains(first.License, "CC0") {
		t.Fatalf("invalid imported track: %#v", first)
	}
	if _, err := db.Exec(`UPDATE "SalesProductionPreset" SET "name"='已编辑名称' WHERE "id"=?`, first.ID); err != nil {
		t.Fatal(err)
	}
	retry := callBgmImport(t, cfg, "local", `{"builtinId":"bgm_warm_home","title":"重试名称"}`, 200)
	if retry.ID != first.ID || retry.AudioURL != first.AudioURL || retry.Title != "已编辑名称" {
		t.Fatalf("retry duplicated or replaced user edit: %#v", retry)
	}
	other := callBgmImport(t, cfg, "other", `{"builtinId":"bgm_warm_home"}`, 200)
	if other.ID == first.ID || !strings.HasPrefix(other.AudioURL, "/storage/other/") {
		t.Fatalf("workspace imports not isolated: %#v", other)
	}
	if rows, err := queryStudioBgms(t.Context(), db, "local"); err != nil || len(rows) != 1 {
		t.Fatalf("idempotency failed: %#v %v", rows, err)
	}
}

func TestStudioBgmAudioImportMeasuresTrimsAndMixesSavedAsset(t *testing.T) {
	cfg, _, _ := setupBgmImportTest(t)
	rel := "local/source.wav"
	file := storage.SafeWithin(storage.ResolveRoot(), rel)
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, renderBuiltinBgmWAV(builtinStudioBgms[0]), 0o644); err != nil {
		t.Fatal(err)
	}
	track := callBgmImport(t, cfg, "local", `{"audioUrl":"/storage/local/source.wav","title":"我的短配乐","startSec":2,"durationSec":3}`, 200)
	if track.Title != "我的短配乐" || track.DurationSec < 2.9 || track.DurationSec > 3.1 || strings.Contains(track.License, "CC0") {
		t.Fatalf("import did not preserve measured crop and provenance: %#v", track)
	}
	output, cleanup, err := resolveStudioMixBgm(t.Context(), cfg, "local", track.ID, nil)
	defer cleanup()
	if err != nil || output == "" {
		t.Fatalf("custom asset cannot be mixed: %s %v", output, err)
	}
	duration, err := system.ProbeAudioDuration(t.Context(), cfg.Root, output)
	if err != nil || duration < 2.9 || duration > 3.1 {
		t.Fatalf("crop metadata does not match media: %v %v", duration, err)
	}
	if _, cleanup, err := resolveStudioMixBgm(t.Context(), cfg, "other", track.ID, nil); err == nil {
		cleanup()
		t.Fatal("another workspace can mix private track")
	}
	callBgmImport(t, cfg, "other", `{"audioUrl":"/storage/local/source.wav"}`, 400)
	callBgmImport(t, cfg, "local", `{"audioUrl":"/storage/local/source.wav","startSec":11.5}`, 400)
	callBgmImport(t, cfg, "local", `{"audioUrl":"/storage/local/source.wav","startSec":100}`, 400)
	full := callBgmImport(t, cfg, "local", `{"audioUrl":"/storage/local/source.wav","durationSec":15}`, 200)
	if full.DurationSec < 11.9 || full.DurationSec > 12.1 {
		t.Fatalf("short source did not end naturally: %#v", full)
	}
}

func TestStudioBgmVideoImportKeepsAudioAndRejectsSilentVideo(t *testing.T) {
	cfg, _, ffmpeg := setupBgmImportTest(t)
	for _, hasAudio := range []bool{false, true} {
		rel := "local/silent.mp4"
		if hasAudio {
			rel = "local/reference.mp4"
		}
		file := storage.SafeWithin(storage.ResolveRoot(), rel)
		if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
			t.Fatal(err)
		}
		args := []string{"-y", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=160x160:r=10:d=2"}
		if hasAudio {
			args = append(args, "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:a", "aac")
		}
		args = append(args, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-t", "2", file)
		if raw, err := exec.CommandContext(t.Context(), ffmpeg, args...).CombinedOutput(); err != nil {
			t.Fatalf("fixture: %v %s", err, raw)
		}
		wantCode := 400
		if hasAudio {
			wantCode = 200
		}
		track := callBgmImport(t, cfg, "local", `{"videoUrl":"/storage/`+rel+`"}`, wantCode)
		if hasAudio && (track.DurationSec < 1.9 || track.DurationSec > 2.1 || !strings.Contains(track.Description, "未分离人声") || !strings.Contains(track.License, "参考视频原音轨")) {
			t.Fatalf("video provenance or duration lost: %#v", track)
		}
	}
}

func TestStudioBgmImportValidatesSourcesAndRanges(t *testing.T) {
	for _, body := range []string{
		`{}`, `{"builtinId":"unknown"}`, `{"builtinId":"bgm_warm_home","audioUrl":"/storage/local/a.wav"}`,
		`{"builtinId":"bgm_warm_home","startSec":-1}`, `{"builtinId":"bgm_warm_home","startSec":601}`,
		`{"builtinId":"bgm_warm_home","durationSec":0}`, `{"builtinId":"bgm_warm_home","durationSec":601}`,
		`{"builtinId":"bgm_warm_home"} {}`, `{"audioUrl":"file:///etc/passwd"}`,
	} {
		callBgmImport(t, config.Config{}, "local", body, 400)
	}
}

func TestStudioBgmImportRejectsOversizedFilesAndCleansFailedSave(t *testing.T) {
	cfg, db, _ := setupBgmImportTest(t)
	input := storage.SafeWithin(storage.ResolveRoot(), "local/oversized.wav")
	if err := os.MkdirAll(filepath.Dir(input), 0o755); err != nil {
		t.Fatal(err)
	}
	file, err := os.Create(input)
	if err != nil {
		t.Fatal(err)
	}
	if err := file.Truncate(audioMixAudioLimit + 1); err != nil {
		t.Fatal(err)
	}
	file.Close()
	callBgmImport(t, cfg, "local", `{"audioUrl":"/storage/local/oversized.wav"}`, 400)
	if err := os.WriteFile(input, []byte("#EXTM3U\nhttp://127.0.0.1/private\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	callBgmImport(t, cfg, "local", `{"audioUrl":"/storage/local/oversized.wav"}`, 400)
	if _, err := db.Exec(`CREATE TRIGGER reject_import BEFORE INSERT ON "SalesProductionPreset" BEGIN SELECT RAISE(ABORT,'unavailable'); END`); err != nil {
		t.Fatal(err)
	}
	callBgmImport(t, cfg, "local", `{"builtinId":"bgm_warm_home"}`, 500)
	if matches, err := filepath.Glob(filepath.Join(storage.ResolveRoot(), "local", "azhuo", "generated", "audio", "*", "sales_bgm_*.m4a")); err != nil || len(matches) != 0 {
		t.Fatalf("failed import left generated media: %v %v", matches, err)
	}
}

func TestStudioBgmImportsOpusInOwningWorkspaceOnly(t *testing.T) {
	cfg, _, ffmpeg := setupBgmImportTest(t)
	workspace := strings.Repeat("a", 64)
	rel := workspace + "/reference.opus"
	file := storage.SafeWithin(storage.ResolveRoot(), rel)
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		t.Fatal(err)
	}
	args := []string{"-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:a", "libopus", file}
	if raw, err := exec.CommandContext(t.Context(), ffmpeg, args...).CombinedOutput(); err != nil {
		t.Fatalf("Opus fixture: %v %s", err, raw)
	}
	body := `{"audioUrl":"/storage/` + rel + `"}`
	track := callBgmImport(t, cfg, workspace, body, 200)
	if track.DurationSec < 1.9 || track.DurationSec > 2.1 || !strings.HasPrefix(track.AudioURL, "/storage/"+workspace+"/") {
		t.Fatalf("Opus import failed: %#v", track)
	}
	callBgmImport(t, cfg, "local", body, 400)
	callBgmImport(t, cfg, strings.Repeat("b", 64), body, 400)
	callBgmImport(t, cfg, "local", `{"audioUrl":"/storage/local/../`+rel+`"}`, 400)
}
