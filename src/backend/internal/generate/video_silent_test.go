package generate

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/storage"
	"beike.local/cloud/src/backend/internal/system"
)

func TestVideoSilentOwnershipAndActualMedia(t *testing.T) {
	root, _ := filepath.Abs(filepath.Join("..", "..", "..", ".."))
	ffmpeg, ok := system.FFmpegBinary(root)
	if !ok {
		t.Fatal("FFmpeg required for silent delivery verification")
	}
	cache := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", cache)
	server := httptest.NewServer(http.NotFoundHandler())
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	cfg.Root = root
	db, err := openTaskDB(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := os.MkdirAll(filepath.Join(cache, "owner"), 0700); err != nil {
		t.Fatal(err)
	}
	source := filepath.Join(cache, "owner", "source.mp4")
	args := []string{"-v", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=768x768:r=24:d=15.083333", "-f", "lavfi", "-i", "sine=frequency=800:duration=15.083333", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-shortest", source}
	if raw, err := exec.CommandContext(t.Context(), ffmpeg, args...).CombinedOutput(); err != nil {
		t.Fatalf("source: %v %s", err, raw)
	}
	original, _ := os.ReadFile(source)
	_, err = db.Exec(`INSERT INTO "ImageTask" ("id","workspaceId","taskId","status","mediaType","model","resultUrl") VALUES ('record','owner','provider-task','SUCCESS','video','MiniMax-H3','/storage/owner/source.mp4')`)
	if err != nil {
		t.Fatal(err)
	}
	request := func(workspace, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodPost, "/api/generate/video/silent", strings.NewReader(body))
		r = r.WithContext(httpx.WithWorkspace(r.Context(), workspace))
		res := httptest.NewRecorder()
		VideoSilent(cfg).ServeHTTP(res, r)
		return res
	}
	for _, body := range []string{`{`, `{"taskId":""}`, `{"taskId":"provider-task","url":"https://example.com/private.mp4"}`, `{"taskId":"provider-task"} {}`} {
		if res := request("owner", body); res.Code != 400 {
			t.Fatalf("invalid body: %d %s", res.Code, res.Body.String())
		}
	}
	if res := request("other", `{"taskId":"provider-task"}`); res.Code != 404 {
		t.Fatalf("cross-workspace result: %d", res.Code)
	}
	if res := request("owner", `{"taskId":"unrecorded"}`); res.Code != 404 {
		t.Fatalf("unknown result: %d", res.Code)
	}
	res := request("owner", `{"taskId":"provider-task"}`)
	var result struct {
		URL      string  `json:"url"`
		Duration float64 `json:"durationSec"`
		HasAudio bool    `json:"hasAudio"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &result); err != nil || res.Code != 200 || result.Duration != 15 || result.HasAudio {
		t.Fatalf("delivery: %d %s %v", res.Code, res.Body.String(), err)
	}
	output := storage.StoredFile(strings.TrimPrefix(result.URL, "/storage/"))
	probe, err := system.ProbeLocalVideo(t.Context(), root, output)
	if err != nil || !validSilentDelivery(probe) {
		t.Fatalf("actual delivery: %#v %v", probe, err)
	}
	after, _ := os.ReadFile(source)
	if !bytes.Equal(original, after) {
		t.Fatal("provider original changed")
	}
	info, _ := os.Stat(output)
	res = request("owner", `{"taskId":"provider-task"}`)
	next, _ := os.Stat(output)
	if res.Code != 200 || !info.ModTime().Equal(next.ModTime()) {
		t.Fatal("repeated processing did not reuse verified delivery")
	}
	var saved string
	_ = db.QueryRow(`SELECT "resultUrl" FROM "ImageTask" WHERE "id"='record'`).Scan(&saved)
	if saved != "/storage/owner/source.mp4" {
		t.Fatal("original task result overwritten")
	}
}
