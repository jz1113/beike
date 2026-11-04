package sales

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database/migrate"
	"beike.local/cloud/src/backend/internal/platform/storage"
	"beike.local/cloud/src/backend/internal/system"
)

func mediaJobConfig(t *testing.T) config.Config {
	t.Helper()
	root, _ := filepath.Abs("../../../..")
	dbFile := filepath.Join(t.TempDir(), "tasks.db")
	if err := migrate.Run(dbFile, t.TempDir(), false); err != nil {
		t.Fatal(err)
	}
	t.Setenv("AZHUO_CACHE_DIR", t.TempDir())
	return config.Config{Root: root, DatabaseURL: "file:" + dbFile}
}
func readJobForTest(t *testing.T, cfg config.Config, id string) mediaJob {
	t.Helper()
	for started := time.Now(); time.Since(started) < 15*time.Second; {
		rec := httptest.NewRecorder()
		MediaJobs(cfg).ServeHTTP(rec, httptest.NewRequest("GET", "/api/sales/media-jobs?id="+id, nil))
		var response struct{ Job mediaJob }
		if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &response) != nil {
			t.Fatal(rec.Code, rec.Body.String())
		}
		if response.Job.Status != "running" && response.Job.Status != "queued" {
			return response.Job
		}
		time.Sleep(30 * time.Millisecond)
	}
	t.Fatal("job timed out")
	return mediaJob{}
}
func enqueueTestMedia(t *testing.T, h http.Handler, body string, cancelBrowser bool) string {
	t.Helper()
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	req := httptest.NewRequest("POST", "/", strings.NewReader(body)).WithContext(ctx)
	req.Header.Set("Prefer", "respond-async")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if cancelBrowser {
		cancel()
	}
	var resp struct{ Job mediaJob }
	if rec.Code != 202 || json.Unmarshal(rec.Body.Bytes(), &resp) != nil || resp.Job.ID == "" {
		t.Fatal(rec.Code, rec.Body.String())
	}
	return resp.Job.ID
}
func TestBackgroundSalesVideoDelivery(t *testing.T) {
	cfg := mediaJobConfig(t)
	ffmpeg, ok := system.FFmpegBinary(cfg.Root)
	if !ok {
		t.Skip("missing ffmpeg")
	}
	for _, mode := range []string{"script_only", "depth_imitation"} {
		t.Run(mode, func(t *testing.T) {
			rel := "local/" + mode + ".mp4"
			source := filepath.Join(storage.ResolveRoot(), rel)
			if err := os.MkdirAll(filepath.Dir(source), 0755); err != nil {
				t.Fatal(err)
			}
			pattern := "testsrc2"
			if mode == "depth_imitation" {
				pattern = "smptebars"
			}
			if b, err := exec.Command(ffmpeg, "-v", "error", "-y", "-f", "lavfi", "-i", pattern+"=size=240x320:rate=15", "-f", "lavfi", "-i", "sine=frequency=440", "-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", source).CombinedOutput(); err != nil {
				t.Fatal(err, string(b))
			}
			var calls atomic.Int32
			gate := make(chan struct{})
			var reqBody map[string]any
			h := BackgroundMedia(cfg, "video", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method == "POST" {
					calls.Add(1)
					<-gate
					if json.NewDecoder(r.Body).Decode(&reqBody) != nil {
						t.Error("invalid payload")
					}
					httpx.WriteJSON(w, 200, map[string]any{"success": true, "taskId": "mock-" + mode, "model": "offline"})
					return
				}
				if r.URL.Query().Get("taskId") != "mock-"+mode {
					t.Error("wrong provider receipt")
				}
				httpx.WriteJSON(w, 200, map[string]any{"success": true, "status": "SUCCESS", "resultUrl": "/storage/" + rel})
			}))
			input := map[string]any{"model": "offline", "images": []string{"/storage/local/product.png"}, "prompt": "保留商品原色"}
			if mode == "depth_imitation" {
				input["videos"] = []string{"/storage/local/pose.mp4"}
			}
			raw, _ := json.Marshal(input)
			id := enqueueTestMedia(t, h, string(raw), true)
			again := enqueueTestMedia(t, h, string(raw), true)
			close(gate)
			if again != id {
				t.Fatal("duplicate submission", again, id)
			}
			job := readJobForTest(t, cfg, id)
			if job.Status != "completed" || calls.Load() != 1 {
				t.Fatal(job.Status, job.Error, calls.Load())
			}
			if (reqBody["videos"] != nil) != (mode == "depth_imitation") || reqBody["images"].([]any)[0] != "/storage/local/product.png" {
				t.Fatal("wrong references", reqBody)
			}
			foreign := httptest.NewRecorder()
			rr := httptest.NewRequest("GET", "/api/sales/media-jobs?id="+id, nil)
			MediaJobs(cfg).ServeHTTP(foreign, rr.WithContext(httpx.WithWorkspace(rr.Context(), "another")))
			if foreign.Code != 404 {
				t.Fatal("foreign job accessible", foreign.Code)
			}
			var movie struct{ ResultURL string }
			json.Unmarshal(job.Result, &movie)
			mixID := enqueueTestMedia(t, BackgroundMedia(cfg, "mix", AudioMix(cfg)), fmt.Sprintf(`{"videoUrl":%q,"voiceMode":"speech","bgmId":"bgm_warm_home"}`, movie.ResultURL), true)
			mixed := readJobForTest(t, cfg, mixID)
			if mixed.Status != "completed" {
				t.Fatal(mixed.Error)
			}
			var final struct{ VideoURL string }
			json.Unmarshal(mixed.Result, &final)
			output := storage.StoredFile(strings.TrimPrefix(final.VideoURL, "/storage/"))
			probe, err := system.ProbeVideo(cfg.Root, output)
			if err != nil || !probe.HasAudio || probe.Width != 240 || probe.Height != 320 || probe.Duration < 1.95 || probe.Duration > 2.15 {
				t.Fatal(probe, err)
			}
			if bytes, err := exec.Command(ffmpeg, "-v", "error", "-xerror", "-i", output, "-map", "0:v", "-map", "0:a", "-f", "null", "-").CombinedOutput(); err != nil {
				t.Fatal(err, string(bytes))
			}
			t.Logf("mode=%s submits=%d completed=%s duration=%.3fs video=%dx%d audio=%v", mode, calls.Load(), mixed.Status, probe.Duration, probe.Width, probe.Height, probe.HasAudio)
		})
	}
}
func TestInterruptedMediaJobCanRetryMixWithoutRepeatingVideo(t *testing.T) {
	cfg := mediaJobConfig(t)
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`INSERT INTO SalesMediaJob(id,workspaceId,kind,name,inputKey,status,createdAt,updatedAt,retryInput) VALUES('interrupted','local','mix','test','old','running','now','now','{"videoUrl":"/storage/local/missing.mp4"}')`)
	if err != nil {
		t.Fatal(err)
	}
	j := readJobForTest(t, cfg, "interrupted")
	if j.Status != "failed" || !strings.Contains(j.Error, "中断") {
		t.Fatal(j)
	}
	r := httptest.NewRecorder()
	MediaJobs(cfg).ServeHTTP(r, httptest.NewRequest("POST", "/api/sales/media-jobs?id=interrupted&action=retry", nil))
	var reply struct{ Job mediaJob }
	if r.Code != 202 || json.Unmarshal(r.Body.Bytes(), &reply) != nil {
		t.Fatal(r.Code, r.Body.String())
	}
	retry := readJobForTest(t, cfg, reply.Job.ID)
	if retry.Kind != "mix" || retry.Status != "failed" || !strings.Contains(retry.Error, "工作区") {
		t.Fatal(retry)
	}
}

func TestImportLinksAcceptedDepthWithoutRewritingConfirmedScript(t *testing.T) {
	cfg := mediaJobConfig(t)
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	const source = "/storage/local/source.mp4"
	os.MkdirAll(filepath.Join(storage.ResolveRoot(), "local"), 0755)
	os.WriteFile(filepath.Join(storage.ResolveRoot(), "local", "source.mp4"), []byte("fixture input to injected converter"), 0600)
	var script map[string]any
	json.Unmarshal([]byte(validScript), &script)
	stored, err := persistAnalyzedScript(cfg, "local", source, "hash", "model", "prompt", "route", script, false)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`UPDATE SalesReferenceScript SET status='verified',version=7 WHERE id=?`, stored.ID)
	if err != nil {
		t.Fatal(err)
	}
	submits := 0
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			submits++
			var input map[string]any
			json.NewDecoder(r.Body).Decode(&input)
			if input["videoUrl"] != source || input["style"] != "mocap" {
				t.Error(input)
			}
			if _, err := db.Exec(`INSERT INTO ImageTask(id,workspaceId,taskId,prompt,model,mediaType,quality,status,createdAt,updatedAt) VALUES('depth-owned','local','depth-owned','','depth','depth-video','standard','SUCCESS','now','now')`); err != nil {
				t.Error(err)
			}
			httpx.WriteJSON(w, 200, map[string]any{"success": true, "taskId": "depth-owned"})
			return
		}
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "status": "SUCCESS", "resultUrl": "/storage/local/output.mp4"})
	})
	for range 2 {
		if err := completeImportDepth(cfg, db, httptest.NewRequest("POST", "/", nil), stored.ID, source, handler); err != nil {
			t.Fatal(err)
		}
	}
	saved, err := readReferenceScriptByID(t.Context(), db, "local", stored.ID)
	if err != nil || saved.DepthVideoURL != "/storage/local/output.mp4" || saved.Version != 7 || saved.Status != "verified" || submits != 1 {
		t.Fatal(saved, submits, err)
	}
}

func TestCanceledQueuedMediaStageNeverEntersHandler(t *testing.T) {
	cfg := mediaJobConfig(t)
	for range cap(mediaJobSlots) {
		mediaJobSlots <- struct{}{}
	}
	var invoked atomic.Int32
	handler := BackgroundMedia(cfg, "mix", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { invoked.Add(1) }))
	id := enqueueTestMedia(t, handler, `{"videoUrl":"/storage/local/raw.mp4"}`, true)
	rec := httptest.NewRecorder()
	MediaJobs(cfg).ServeHTTP(rec, httptest.NewRequest("POST", "/api/sales/media-jobs?id="+id+"&action=cancel", nil))
	job := readJobForTest(t, cfg, id)
	for range cap(mediaJobSlots) {
		<-mediaJobSlots
	}
	if rec.Code != 200 || job.Status != "canceled" || invoked.Load() != 0 {
		t.Fatal(rec.Code, job.Status, invoked.Load())
	}
}
