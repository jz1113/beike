package sales

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/system"
)

func TestScriptAspectRatioSnapsToGenerationRatios(t *testing.T) {
	cases := map[string][2]int{"9:16": {1080, 1920}, "16:9": {1920, 1080}, "3:4": {1080, 1440}, "1:1": {720, 720}}
	for want, size := range cases {
		if got := scriptAspectRatio(size[0], size[1]); got != want {
			t.Fatalf("%v => %s, want %s", size, got, want)
		}
	}
}

func TestEnrichScriptMediaHonorsCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := enrichScriptMedia(ctx, "", "local", "/storage/local/ref.mp4", map[string]any{}); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled analysis must stop before probing/extracting: %v", err)
	}
}

func TestScriptVideoUploadProbesWithoutStoringSourceFrames(t *testing.T) {
	root, _ := filepath.Abs(filepath.Join("..", "..", "..", ".."))
	ffmpeg, ok := system.FFmpegBinary(root)
	if !ok {
		t.Skip("FFmpeg is not installed")
	}
	t.Setenv("AZHUO_CACHE_DIR", t.TempDir())
	source := filepath.Join(t.TempDir(), "ref.mp4")
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, ffmpeg, "-y", "-f", "lavfi", "-i", "color=c=blue:s=360x640:r=25:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", source)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("encode: %v\n%s", err, out)
	}
	raw, _ := os.ReadFile(source)
	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	part, _ := form.CreateFormFile("file", "ref.mp4")
	_, _ = part.Write(raw)
	_ = form.Close()
	request := httptest.NewRequest(http.MethodPost, "/api/sales/script-video", &body)
	request.Header.Set("Content-Type", form.FormDataContentType())
	recorder := httptest.NewRecorder()
	cfg := config.Config{Root: root}
	ScriptVideoUpload(cfg).ServeHTTP(recorder, request)
	var uploaded struct {
		VideoURL    string  `json:"videoUrl"`
		DurationSec float64 `json:"durationSec"`
		AspectRatio string  `json:"aspectRatio"`
		HasAudio    bool    `json:"hasAudio"`
	}
	_ = json.Unmarshal(recorder.Body.Bytes(), &uploaded)
	if recorder.Code != 200 || !strings.HasPrefix(uploaded.VideoURL, "/storage/local/") || uploaded.AspectRatio != "9:16" || uploaded.DurationSec < 1.9 || uploaded.HasAudio {
		t.Fatalf("upload %d %s", recorder.Code, recorder.Body.String())
	}
	script := map[string]any{"durationSec": 9.0, "voiceMode": "speech", "shots": []any{map[string]any{"start": 0.0, "end": 2.0, "beats": []any{map[string]any{"start": 0.0, "end": 1.0, "action": "蓝色画面保持静止"}, map[string]any{"start": 1.0, "end": 2.0, "action": "延续蓝色静止画面"}}}}}
	if err := enrichScriptMedia(context.Background(), root, "local", uploaded.VideoURL, script); err != nil {
		t.Fatal(err)
	}
	if script["voiceMode"] != "none" || script["audioAvailable"] != false || script["durationSec"].(float64) > 2.1 {
		t.Fatalf("measured media should replace model guesses: %#v", script)
	}
	beat := script["shots"].([]any)[0].(map[string]any)["beats"].([]any)[1].(map[string]any)
	if beat["previewFrameUrl"] != nil {
		t.Fatal("original video frames must not be stored")
	}
}

func TestScriptVideoUploadRejectsUnsupportedFiles(t *testing.T) {
	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	part, _ := form.CreateFormFile("file", "ref.gif")
	_, _ = part.Write([]byte("GIF89a"))
	_ = form.Close()
	request := httptest.NewRequest(http.MethodPost, "/api/sales/script-video", &body)
	request.Header.Set("Content-Type", form.FormDataContentType())
	recorder := httptest.NewRecorder()
	ScriptVideoUpload(config.Config{}).ServeHTTP(recorder, request)
	if recorder.Code != 400 {
		t.Fatalf("gif should be rejected: %d", recorder.Code)
	}
}

func TestAnalysisGroupsAnAlreadyTimedAction(t *testing.T) {
	for _, extra := range []string{
		`"actionTemplate":"抬手，视线随手抬起","beats":[]`,
		`"summary":"0.0–14.8 秒｜抬手，视线随手抬起"`,
	} {
		raw := `{"durationSec":14.8,"shots":[{"start":0,"end":14.8,"estimated":true,"expression":"抬眼","camera":"固定",` + extra + `}]}`
		script, err := parseScriptCompletion(scriptCompletion(raw, "stop"))
		if err != nil {
			t.Fatal(err)
		}
		shot := script["shots"].([]any)[0].(map[string]any)
		beats := shot["beats"].([]any)
		beat := beats[0].(map[string]any)
		if len(beats) != 1 || beat["actionTemplate"] != "抬手，视线随手抬起" && beat["action"] != "抬手，视线随手抬起" || beat["start"] != 0.0 || beat["end"] != 14.8 || beat["estimated"] != true || beat["expression"] != "抬眼" || beat["camera"] != "固定" {
			t.Fatalf("lost timed observation: %+v", beats)
		}
	}
}

func TestAnalysisRecoversRootBeatsOnlyForSingleShot(t *testing.T) {
	raw := `{"durationSec":2,"shots":[{"start":0,"end":2}],"beats":[{"start":0,"end":1,"action":"抬手"},{"start":1,"end":2,"action":"收手"}]}`
	script, err := parseScriptCompletion(scriptCompletion(raw, "stop"))
	if err != nil || len(script["shots"].([]any)[0].(map[string]any)["beats"].([]any)) != 2 {
		t.Fatal("single-shot beats not recovered", err)
	}
	for _, broken := range []string{
		strings.Replace(raw, `"end":2}`, `"end":1},{"start":1,"end":2}`, 1),
		strings.Replace(raw, `"end":1,"action"`, `"end":5,"action"`, 1),
		`{"durationSec":2,"shots":[{"start":0,"end":2,"summary":"开场展示"}]}`,
	} {
		if _, err := parseScriptCompletion(scriptCompletion(broken, "stop")); err == nil {
			t.Fatal("accepted missing or ambiguous timeline", broken)
		}
	}
}

func TestAnalysisRetainsDetailedOneTakeWithoutSplittingOrTruncating(t *testing.T) {
	var beats []map[string]any
	for i := 0; i < 25; i++ {
		beats = append(beats, map[string]any{"start": i, "end": i + 1, "action": "抬手"})
	}
	for _, count := range []int{13, 24, 25} {
		raw, _ := json.Marshal(map[string]any{"durationSec": count, "shots": []any{map[string]any{"start": 0, "end": count, "beats": beats[:count]}}})
		script, err := parseScriptCompletion(scriptCompletion(string(raw), "stop"))
		if count == 25 {
			if err == nil || !strings.Contains(err.Error(), "25 个动作段") {
				t.Fatal("missing actual beat count", err)
			}
			continue
		}
		if err != nil || len(script["shots"].([]any)[0].(map[string]any)["beats"].([]any)) != count {
			t.Fatal("lost motion", count, err)
		}
	}
}

func TestScriptDepthReceiptPreservesConcurrentReview(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	create := httptest.NewRecorder()
	Scripts(cfg).ServeHTTP(create, httptest.NewRequest(http.MethodPost, "/api/sales/scripts", strings.NewReader(`{"id":"linked","videoUrl":"/storage/local/source.mp4","script":`+validScript+`}`)))
	if create.Code != 200 {
		t.Fatal(create.Body.String())
	}
	body := &interleavedScriptBody{reader: strings.NewReader(`{"depthVideoUrl":"/storage/local/depth.mp4","depthOperationId":"operation-1"}`), before: func() {
		if _, err := db.Exec(`UPDATE "SalesReferenceScript" SET "title"='已确认新脚本',"status"='verified',"version"=5 WHERE "id"='linked'`); err != nil {
			t.Fatal(err)
		}
	}}
	rec := httptest.NewRecorder()
	patchReferenceScript(rec, httptest.NewRequest(http.MethodPatch, "/api/sales/scripts/linked", body), db, "local", "linked")
	var response struct {
		Item storedReferenceScript `json:"item"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &response)
	if rec.Code != 200 || response.Item.Status != "verified" || response.Item.Version != 5 || response.Item.Title != "已确认新脚本" || response.Item.DepthVideoURL != "/storage/local/depth.mp4" || response.Item.VideoURL != "/storage/local/source.mp4" {
		t.Fatalf("receipt overwrote review or lost media: %d %s", rec.Code, rec.Body.String())
	}
	// A full save from an older editor omits new fields; those linked results stay.
	replace := httptest.NewRecorder()
	Scripts(cfg).ServeHTTP(replace, httptest.NewRequest(http.MethodPost, "/api/sales/scripts", strings.NewReader(`{"id":"linked","script":`+validScript+`}`)))
	_ = json.Unmarshal(replace.Body.Bytes(), &response)
	if replace.Code != 200 || response.Item.DepthVideoURL != "/storage/local/depth.mp4" || response.Item.VideoURL != "/storage/local/source.mp4" {
		t.Fatalf("old editor lost media: %s", replace.Body.String())
	}

	body = &interleavedScriptBody{reader: strings.NewReader(`{"status":"verified"}`), before: func() {
		if _, err := db.Exec(`UPDATE "SalesReferenceScript" SET "depthVideoUrl"='/storage/local/new-depth.mp4' WHERE "id"='linked'`); err != nil {
			t.Fatal(err)
		}
	}}
	rec = httptest.NewRecorder()
	patchReferenceScript(rec, httptest.NewRequest(http.MethodPatch, "/api/sales/scripts/linked", body), db, "local", "linked")
	_ = json.Unmarshal(rec.Body.Bytes(), &response)
	if rec.Code != 200 || response.Item.DepthVideoURL != "/storage/local/new-depth.mp4" {
		t.Fatalf("review overwrote conversion: %s", rec.Body.String())
	}
}

func TestScriptMediaLinksCheckWorkspaceAndRegisteredRemoteResults(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`CREATE TABLE "ActionAsset" ("workspaceId" TEXT,"mediaType" TEXT,"mediaUrl" TEXT);
CREATE TABLE "ImageTask" ("id" TEXT,"workspaceId" TEXT,"mediaType" TEXT,"status" TEXT,"resultUrl" TEXT);
INSERT INTO "ActionAsset" VALUES ('a','depth-video','https://cdn.example/owned.mp4'),('b','depth-video','https://cdn.example/foreign.mp4');
INSERT INTO "ImageTask" VALUES ('task-a','a','depth-video','SUCCESS','https://cdn.example/result.mp4'),('task-b','b','depth-video','SUCCESS','https://cdn.example/foreign-result.mp4');`)
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range []struct {
		source, depth, task string
		allowed             bool
	}{
		{"/storage/a/source.mp4", "/storage/a/depth.mp4", "task-a", true},
		{"", "https://cdn.example/owned.mp4", "", true},
		{"", "https://cdn.example/result.mp4", "task-a", true},
		{"/storage/b/source.mp4", "", "", false},
		{"/storage/a/../b/source.mp4", "", "", false},
		{"/storage/a/%2e%2e/b/source.mp4", "", "", false},
		{"", "https://cdn.example/foreign.mp4", "", false},
		{"", "https://cdn.example/unregistered.mp4", "", false},
		{"", "/storage/a/depth.mp4", "task-b", false},
	} {
		err := validateScriptLinks(context.Background(), db, "a", row.source, row.depth, row.task, "operation")
		if (err == nil) != row.allowed {
			t.Fatalf("%+v: %v", row, err)
		}
	}
}

func TestAnalyzedScriptPersistsAndReusesWithoutOverwritingReview(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	var script map[string]any
	_ = json.Unmarshal([]byte(validScript), &script)
	first, err := persistAnalyzedScript(cfg, "local", "/storage/local/source.mp4", "hash", "model", "prompt", "route", script, false)
	if err != nil {
		t.Fatal(err)
	}
	if first.Status != "verified" {
		t.Fatalf("new analysis is not ready for use: %s", first.Status)
	}
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`UPDATE "SalesReferenceScript" SET "title"='手动草稿',"status"='draft' WHERE "id"=?`, first.ID); err != nil {
		t.Fatal(err)
	}
	second, err := persistAnalyzedScript(cfg, "local", "/storage/local/source.mp4", "hash", "model", "prompt", "route", script, false)
	if err != nil || second.ID != first.ID || second.Status != "draft" || second.Title != "手动草稿" {
		t.Fatalf("repeat analysis overwrote review: %+v %v", second, err)
	}
	forced, err := persistAnalyzedScript(cfg, "local", "/storage/local/source.mp4", "hash", "model", "prompt", "route", script, true)
	if err != nil || forced.ID == first.ID || forced.Status != "verified" {
		t.Fatalf("forced reanalysis must save a fresh verified script: %+v %v", forced, err)
	}
}

func TestSweepOnlyDiscardsIdleScriptUploads(t *testing.T) {
	cfg := setupPromptExecutionTestConfig(t)
	root := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", root)
	key := "local/azhuo/refs/sales-script/202611/0123456789abcdef0123456789abcdef.mp4"
	unrelated := "local/azhuo/generated/videos/202611/0123456789abcdef0123456789abcdef.mp4"
	frame := "local/azhuo/refs/sales-script/frames/abcdef/frame.jpg"
	legacy := "local/azhuo/refs/sales-script/frames/0123456789abcdef0123456789abcdef/beat-00-5.jpg"
	for _, f := range []string{key, unrelated, frame, legacy} {
		file := filepath.Join(root, f)
		if err := os.MkdirAll(filepath.Dir(file), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(file, []byte("test"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	release := holdScriptSource("local", "/storage/"+key)
	if n, err := SweepScriptSources(cfg, time.Now()); err != nil || n != 0 {
		t.Fatal(n, err)
	}
	if _, err := os.Stat(filepath.Join(root, legacy)); !os.IsNotExist(err) {
		t.Fatal("legacy source preview was retained")
	}
	holdScriptSource("other", "/storage/"+key)()
	if _, err := os.Stat(filepath.Join(root, key)); err != nil {
		t.Fatal(err)
	}
	release()
	if _, err := os.Stat(filepath.Join(root, key)); !os.IsNotExist(err) {
		t.Fatal("terminal release did not delete source")
	}
	if err := os.WriteFile(filepath.Join(root, key), []byte("abandoned"), 0600); err != nil {
		t.Fatal(err)
	}
	if n, err := SweepScriptSources(cfg, time.Now()); err != nil || n != 1 {
		t.Fatal(n, err)
	}
	for _, f := range []string{unrelated, frame} {
		if _, err := os.Stat(filepath.Join(root, f)); err != nil {
			t.Fatal(err)
		}
	}
}
