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
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database/migrate"
	"beike.local/cloud/src/backend/internal/platform/storage"
	"beike.local/cloud/src/backend/internal/platform/taskrecords"
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
					httpx.WriteJSON(w, 200, map[string]any{"success": true, "taskId": "mock-" + mode, "model": "offline", "recordId": "record-" + mode, "usage": map[string]any{"promptTokens": 5}})
					return
				}
				if r.URL.Query().Get("taskId") != "mock-"+mode || r.Header.Get("x-task-record-id") != "record-"+mode {
					t.Error("wrong provider receipt")
				}
				httpx.WriteJSON(w, 200, map[string]any{"success": true, "status": "SUCCESS", "resultUrl": "/storage/" + rel, "usage": map[string]any{"completionTokens": 8, "totalTokens": 13}})
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
			var movie struct {
				ResultURL string
				RecordID  string
				Usage     struct{ PromptTokens, CompletionTokens, TotalTokens float64 }
			}
			json.Unmarshal(job.Result, &movie)
			if movie.RecordID != "record-"+mode || movie.Usage.PromptTokens != 5 || movie.Usage.CompletionTokens != 8 || movie.Usage.TotalTokens != 13 {
				t.Fatalf("completed receipt lost original record or usage: %s", job.Result)
			}
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

func TestSalesVideoReceiptMergesCumulativeUsage(t *testing.T) {
	receipt := map[string]any{"recordId": "original-record", "usage": map[string]any{"promptTokens": float64(5)}}
	for _, data := range []map[string]any{
		{"usage": map[string]any{"completion_tokens": float64(8), "total_tokens": float64(13)}},
		{"usage": map[string]any{"totalTokens": float64(2)}, "recordId": ""},
		{},
	} {
		mergeVideoUsageReceipt(receipt, data)
	}
	usage, _ := receipt["usage"].(map[string]any)
	if receipt["recordId"] != "original-record" || usage["promptTokens"] != float64(5) || usage["completionTokens"] != float64(8) || usage["totalTokens"] != float64(13) {
		t.Fatalf("original record/usage lost: %#v", receipt)
	}
}

func TestBackgroundVideoFailureRetainsOriginalRecordAndUsage(t *testing.T) {
	cfg := mediaJobConfig(t)
	h := BackgroundMedia(cfg, "video", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			httpx.WriteJSON(w, 200, map[string]any{"success": true, "taskId": "same-provider", "recordId": "original-record", "model": "offline", "usage": map[string]any{"promptTokens": 5}})
			return
		}
		if r.Header.Get("x-task-record-id") != "original-record" {
			t.Error("poll lost original record")
		}
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "status": "FAILURE", "failReason": "provider failed after billing", "usage": map[string]any{"completionTokens": 8, "totalTokens": 13}})
	}))
	id := enqueueTestMedia(t, h, `{"clientTaskId":"usage-failure","model":"offline","prompt":"offline test"}`, true)
	job := readJobForTest(t, cfg, id)
	var result map[string]any
	if err := json.Unmarshal(job.Result, &result); err != nil {
		t.Fatal(err)
	}
	usage, _ := result["usage"].(map[string]any)
	if job.Status != "failed" || result["rejected"] != true || result["recordId"] != "original-record" || usage["promptTokens"] != float64(5) || usage["completionTokens"] != float64(8) || usage["totalTokens"] != float64(13) {
		t.Fatalf("failed task receipt lost usage: status=%s result=%s", job.Status, job.Result)
	}
}

func TestBackgroundVideoSubmissionErrorRetainsReportedUsage(t *testing.T) {
	cfg := mediaJobConfig(t)
	h := BackgroundMedia(cfg, "video", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		httpx.WriteJSON(w, 502, map[string]any{"success": false, "submissionUnknown": true, "recordId": "original-record", "usage": map[string]any{"totalTokens": 7}})
	}))
	id := enqueueTestMedia(t, h, `{"clientTaskId":"usage-unknown","model":"offline","prompt":"offline test"}`, true)
	job := readJobForTest(t, cfg, id)
	var result map[string]any
	if err := json.Unmarshal(job.Result, &result); err != nil {
		t.Fatal(err)
	}
	usage, _ := result["usage"].(map[string]any)
	if job.Status != "failed" || result["rejected"] == true || result["submissionUnknown"] != true || result["recordId"] != "original-record" || usage["totalTokens"] != float64(7) {
		t.Fatalf("unknown receipt lost usage: %s", job.Result)
	}
}

func TestVideoBackgroundIdentityIncludesExplicitOperationKey(t *testing.T) {
	cfg := mediaJobConfig(t)
	release := make(chan struct{})
	handler := BackgroundMedia(cfg, "video", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-release
		w.WriteHeader(400)
		w.Write([]byte(`{"success":false,"submissionRejected":true}`))
	}))
	defer close(release)
	body := func(key string) string {
		return `{"clientTaskId":"` + key + `","model":"offline","prompt":"same input","images":[]}`
	}
	first := enqueueTestMedia(t, handler, body("operation-a"), true)
	repeated := enqueueTestMedia(t, handler, body("operation-a"), true)
	second := enqueueTestMedia(t, handler, body("operation-b"), true)
	if first != repeated {
		t.Fatal("same operation not coalesced")
	}
	if strings.TrimSpace(second) == "" || first == second {
		t.Fatal("distinct operation aliased to another receipt")
	}
}

func TestP1VoiceUnknownReceiptSurvivesBackgroundFailureAndReplay(t *testing.T) {
	cfg := mediaJobConfig(t)
	var calls atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.WriteHeader(502)
		w.Write([]byte(`{"error":"lost result","usage":{"total_tokens":7}}`))
	}))
	defer upstream.Close()
	previous := gateway.ModelHTTP
	gateway.ModelHTTP = func() *http.Client { return upstream.Client() }
	t.Cleanup(func() { gateway.ModelHTTP = previous })
	raw, _ := json.Marshal(map[string]any{"prompt": "same voice", "model": "speech-2.8-hd", "clientTaskId": "original-voice", "customBaseUrl": upstream.URL, "customApiKey": "fake"})
	for range 2 {
		r := httptest.NewRequest("POST", "/api/generate/audio", strings.NewReader(string(raw)))
		r.Header.Set("Prefer", "respond-async")
		r.Header.Set("x-idempotency-key", "original-voice")
		w := httptest.NewRecorder()
		BackgroundMedia(cfg, "voice", generate.Audio(cfg)).ServeHTTP(w, r)
		var response struct{ Job mediaJob }
		if w.Code != 202 || json.Unmarshal(w.Body.Bytes(), &response) != nil {
			t.Fatal(w.Code, w.Body.String())
		}
		job := readJobForTest(t, cfg, response.Job.ID)
		var result map[string]any
		if json.Unmarshal(job.Result, &result) != nil || result["submissionUnknown"] != true || result["taskKey"] != "original-voice" || result["usage"] == nil {
			t.Fatal(job.Status, string(job.Result))
		}
	}
	// A fresh handler reads the durable original audio receipt, never calling TTS.
	w := httptest.NewRecorder()
	generate.Audio(cfg).ServeHTTP(w, httptest.NewRequest("GET", "/api/generate/audio?taskKey=original-voice", nil))
	if w.Code != 502 || !strings.Contains(w.Body.String(), `"totalTokens":7`) || calls.Load() != 1 {
		t.Fatal(w.Code, w.Body.String(), calls.Load())
	}
}

func TestTaskRecordsSearchesStoredMediaAcrossPagesAndWorkspaces(t *testing.T) {
	cfg := mediaJobConfig(t)
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for i := range 24 {
		workspace := "active"
		if i == 23 {
			workspace = "other"
		}
		_, err = db.Exec(`INSERT INTO SalesMediaJob(id,workspaceId,kind,name,inputKey,status,createdAt,startedAt,updatedAt,retryInput,result,error)
  VALUES('test-'||?,?,'video','商品演示','key','failed','2026-11-03T22:00:00Z','2026-11-03T22:00:01Z','2026-11-03T22:01:00Z','{"selection":"demo-model"}','{"taskId":"channel-1"}','失败原因')`, i, workspace)
		if err != nil {
			t.Fatal(err)
		}
	}
	req := httptest.NewRequest("GET", "/api/sales/task-records?kind=video&model=demo-model&q=channel-1&status=failed&from=2026-11-03T00:00:00Z&until=2026-11-04T00:00:00Z&page=2&size=10", nil)
	resp := httptest.NewRecorder()
	TaskRecords(cfg).ServeHTTP(resp, req.WithContext(httpx.WithWorkspace(req.Context(), "active")))
	var body struct {
		Records     []taskrecords.Record
		Models      []string
		Total, Page int
	}
	if resp.Code != 200 || json.Unmarshal(resp.Body.Bytes(), &body) != nil || body.Total != 23 || body.Page != 2 || len(body.Models) != 1 || body.Models[0] != "demo-model" || len(body.Records) != 10 || body.Records[0].External != "channel-1" {
		t.Fatal(resp.Code, resp.Body.String())
	}
}
