package generate

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func TestVideoSubmissionDiagnosticsPersistActualEndpointAndAudioWithoutSecrets(t *testing.T) {
	const audio = "https://audio.example/voice.wav?signature=private-signed-audio"
	seedanceAssetCache = sync.Map{}
	var submits atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/seedance/v3/assets/create":
			_, _ = w.Write([]byte(`{"code":0,"data":{"assetId":"person","status":"Active"}}`))
		case "/seedance/v3/contents/generations/tasks":
			submits.Add(1)
			var sent map[string]any
			_ = json.NewDecoder(r.Body).Decode(&sent)
			if sent["generate_audio"] != true {
				t.Error("audio switch was not sent")
			}
			content := sent["content"].([]any)
			last := content[len(content)-1].(map[string]any)
			if last["role"] != "reference_audio" || last["audio_url"].(map[string]any)["url"] != audio {
				t.Error("audio reference was not sent")
			}
			_, _ = w.Write([]byte(`{"task_id":"diagnostic-video"}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	first := postVideoWithAudio(t, Video(cfg), server.URL, "doubao-seedance-2.0-mini", "diagnostic-input", audio, "local")
	var body struct {
		RecordID         string                      `json:"recordId"`
		DiagnosticsSaved bool                        `json:"diagnosticsSaved"`
		Diagnostic       *videoSubmissionDiagnostics `json:"submissionDiagnostics"`
	}
	if err := json.Unmarshal(first.Body.Bytes(), &body); err != nil || first.Code != http.StatusOK || !body.DiagnosticsSaved || body.Diagnostic == nil {
		t.Fatalf("diagnostic submit: code=%d body=%s err=%v", first.Code, first.Body.String(), err)
	}
	diagnostic := body.Diagnostic
	parsed, _ := url.Parse(server.URL)
	if diagnostic.Endpoint == nil || diagnostic.Endpoint.Host != parsed.Host || diagnostic.Endpoint.Path != "/seedance/v3/contents/generations/tasks" || diagnostic.EndpointAttempts != 1 || diagnostic.SubmissionOutcome != "accepted" {
		t.Fatalf("actual fallback endpoint missing: %+v", diagnostic)
	}
	if diagnostic.GenerateAudio == nil || !*diagnostic.GenerateAudio || diagnostic.Model != "doubao-seedance-2.0-mini" || diagnostic.AudioReferenceCount != 1 || diagnostic.AudioReferences[0].Role != "reference_audio" || diagnostic.AudioReferences[0].ReferenceSHA256 != videoDiagnosticDigest([]byte(audio)) {
		t.Fatalf("actual audio input missing: %+v", diagnostic)
	}
	file := videoSubmissionDiagnosticFile(cfg, "local", body.RecordID)
	raw, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	for _, secret := range []string{"private-signed-audio", "test-key", "https://audio.example", "Authorization", "/Users/"} {
		if strings.Contains(string(raw), secret) || strings.Contains(first.Body.String(), secret) {
			t.Fatalf("private input leaked into diagnostic: %q", secret)
		}
	}
	if info, err := os.Stat(file); err != nil || info.Mode().Perm() != 0o600 {
		t.Fatalf("diagnostic file permissions: %v %v", info, err)
	}
	db, err := openTaskDB(cfg)
	if err != nil {
		t.Fatal(err)
	}
	updateTaskTerminal(context.Background(), db, taskScope{"local", "video"}, "diagnostic-video", "SUCCESS", "https://cdn.example/result.mp4", "", "")
	_ = db.Close()
	// A fresh handler and terminal polling keep the same transport evidence.
	queried := videoSubmissionTestGet(Video(cfg), "diagnostic-input", "local")
	if !strings.Contains(queried.Body.String(), `"submissionDiagnostics"`) || !strings.Contains(queried.Body.String(), `"path":"/seedance/v3/contents/generations/tasks"`) {
		t.Fatal(queried.Body.String())
	}
	hidden := videoSubmissionTestGet(Video(cfg), "diagnostic-input", "other-workspace")
	if strings.Contains(hidden.Body.String(), "submissionDiagnostics") || strings.Contains(hidden.Body.String(), "diagnostic-video") {
		t.Fatal("diagnostic crossed workspace boundary", hidden.Body.String())
	}
	repeated := postVideoWithAudio(t, Video(cfg), server.URL, "doubao-seedance-2.0-mini", "diagnostic-input", audio, "local")
	if repeated.Code != http.StatusOK || !strings.Contains(repeated.Body.String(), `"submissionDiagnostics"`) || submits.Load() != 1 {
		t.Fatal("diagnostic receipt caused resubmission", repeated.Body.String())
	}
}

func TestVideoSubmissionDiagnosticsHashLocalSourceAndRecordWanRole(t *testing.T) {
	root := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", root)
	t.Setenv("AZHUO_DATA_DIR", t.TempDir())
	path := writeReferenceWav(t, root, "workspace-a/audio/voice.wav", 3)
	const signed = "https://bucket.example/private.wav?token=signed-private"
	payload := map[string]json.RawMessage{"audios": rawJSON(t, []string{"/storage/workspace-a/audio/voice.wav"})}
	adapted := videoAdapted{modelID: "wan3.0-video", family: "wan", payload: map[string]any{
		"parameters": map[string]any{"audio": true},
		"input":      map[string]any{"media": []map[string]string{{"type": "reference_audio", "url": signed}}},
	}}
	r := httptest.NewRequest(http.MethodPost, "/", nil)
	r = r.WithContext(httpx.WithWorkspace(r.Context(), "workspace-a"))
	cfg := config.Config{NodeEnv: "production"}
	diagnostic, err := prepareVideoSubmissionDiagnostics(cfg, r, "record", payload, adapted)
	if err != nil {
		t.Fatal(err)
	}
	source, _ := os.ReadFile(path)
	if diagnostic.AudioReferenceCount != 1 || diagnostic.GenerateAudio == nil || !*diagnostic.GenerateAudio {
		t.Fatalf("audio switch/count: %+v", diagnostic)
	}
	item := diagnostic.AudioReferences[0]
	if item.SourceType != "local" || item.Role != "reference_audio" || item.SourceSHA256 != videoDiagnosticDigest(source) || item.ReferenceSHA256 != videoDiagnosticDigest([]byte(signed)) {
		t.Fatalf("source/reference digests missing: %+v", item)
	}
	raw, _ := json.Marshal(diagnostic)
	if strings.Contains(string(raw), signed) || strings.Contains(string(raw), path) || strings.Contains(string(raw), "voice.wav") {
		t.Fatal("diagnostic includes source locations", string(raw))
	}
	if diagnostic.Endpoint != nil || diagnostic.SubmissionOutcome != "prepared" || readVideoSubmissionDiagnostics(cfg, "workspace-a", "record") == nil {
		t.Fatal("prepared evidence was not durable")
	}
}

func TestVideoSubmissionDiagnosticEndpointDropsCredentialsAndSignedQueries(t *testing.T) {
	diagnostic := safeVideoDiagnosticEndpoint("https://user:password@channel.example/token/private/api-key/key-secret/seedance/v3/tasks?token=query-secret#fragment-secret", "key-secret")
	raw, _ := json.Marshal(diagnostic)
	for _, secret := range []string{"user", "password", "private", "key-secret", "query-secret", "fragment-secret"} {
		if strings.Contains(string(raw), secret) {
			t.Fatalf("endpoint credential leaked: %s", raw)
		}
	}
	if diagnostic.Host != "channel.example" || !strings.HasSuffix(diagnostic.Path, "/seedance/v3/tasks") {
		t.Fatalf("transport route lost: %+v", diagnostic)
	}
	for _, bad := range []string{"/relative", "https://", "data:secret", "://invalid"} {
		if safeVideoDiagnosticEndpoint(bad, "") != nil {
			t.Fatalf("invalid endpoint accepted: %s", bad)
		}
	}
}

func TestVideoSubmissionDiagnosticWriteFailurePreventsPaidSubmission(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1) }))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	if err := os.WriteFile(filepath.Join(cfg.DataDir(), "submission-receipts"), []byte("blocked"), 0o600); err != nil {
		t.Fatal(err)
	}
	first := videoSubmissionTestPost(Video(cfg), server.URL, "no-diagnostic", "商品展示", "local")
	repeated := videoSubmissionTestPost(Video(cfg), server.URL, "no-diagnostic", "商品展示", "local")
	if first.Code != http.StatusServiceUnavailable || calls.Load() != 0 || !strings.Contains(first.Body.String(), `"submitted":false`) || !strings.Contains(first.Body.String(), `"submissionUnknown":false`) || !strings.Contains(repeated.Body.String(), `"submissionRejected":true`) {
		t.Fatalf("diagnostic failure submitted request: %s / %s calls=%d", first.Body.String(), repeated.Body.String(), calls.Load())
	}
}

func TestVideoSubmissionDiagnosticFinalWriteFailureKeepsKnownAcceptedTask(t *testing.T) {
	var cfg config.Config
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		dir := filepath.Join(cfg.DataDir(), "submission-receipts", "video")
		if err := os.Rename(dir, dir+"-before-response"); err != nil {
			t.Error(err)
		}
		if err := os.WriteFile(dir, []byte("blocked"), 0o600); err != nil {
			t.Error(err)
		}
		_, _ = w.Write([]byte(`{"task_id":"diagnostic-save-failed-video"}`))
	}))
	defer server.Close()
	cfg = videoSubmissionTestConfig(t, server)
	first := videoSubmissionTestPost(Video(cfg), server.URL, "final-diagnostic-failed", "商品展示", "local")
	repeated := videoSubmissionTestPost(Video(cfg), server.URL, "final-diagnostic-failed", "商品展示", "local")
	if first.Code != http.StatusOK || !strings.Contains(first.Body.String(), `"diagnosticsSaved":false`) || !strings.Contains(first.Body.String(), `"submissionOutcome":"accepted"`) || repeated.Code != http.StatusOK || calls.Load() != 1 {
		t.Fatalf("diagnostic error changed known submission: %s / %s calls=%d", first.Body.String(), repeated.Body.String(), calls.Load())
	}
}

func TestVideoSubmissionDiagnosticAtomicWritesAndWorkspacePaths(t *testing.T) {
	t.Setenv("AZHUO_DATA_DIR", t.TempDir())
	cfg := config.Config{}
	const recordID = "same-record"
	const workspace = "../../outside-workspace"
	if videoSubmissionDiagnosticFile(cfg, workspace, recordID) == videoSubmissionDiagnosticFile(cfg, "other-workspace", recordID) {
		t.Fatal("workspaces share a diagnostic file")
	}
	var writers sync.WaitGroup
	for index := 0; index < 20; index++ {
		writers.Add(1)
		go func(index int) {
			defer writers.Done()
			diagnostic := &videoSubmissionDiagnostics{Version: 1, Model: "mini", EndpointAttempts: index, SubmissionOutcome: "accepted"}
			if err := writeVideoSubmissionDiagnostics(cfg, workspace, recordID, diagnostic); err != nil {
				t.Error(err)
			}
		}(index)
	}
	writers.Wait()
	if got := readVideoSubmissionDiagnostics(cfg, workspace, recordID); got == nil || got.Model != "mini" || got.EndpointAttempts < 0 || got.EndpointAttempts >= 20 {
		t.Fatalf("atomic write did not preserve one complete diagnostic: %+v", got)
	}
	if readVideoSubmissionDiagnostics(cfg, "other-workspace", recordID) != nil {
		t.Fatal("diagnostic read crossed workspace boundary")
	}
	files, err := os.ReadDir(filepath.Join(cfg.DataDir(), "submission-receipts", "video"))
	if err != nil || len(files) != 1 || !strings.HasSuffix(files[0].Name(), ".json") {
		t.Fatalf("temporary diagnostics remain: files=%v err=%v", files, err)
	}
}
