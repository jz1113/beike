package generate

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/database"
	"beike.local/cloud/src/backend/internal/platform/submission"
	"beike.local/cloud/src/backend/internal/system"
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
)

func TestCanvasChatReportsUpstreamReasonWithoutCredentials(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":{"message":"unsupported video format; key secret-test-key"}}`))
	}))
	defer server.Close()
	previous := canvasHTTP
	canvasHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { canvasHTTP = previous })
	body := `{"model":"gemini-test","textProtocol":"openai","customBaseUrl":"` + server.URL + `","customApiKey":"secret-test-key","messages":[{"role":"user","content":"analyse"}]}`
	w := httptest.NewRecorder()
	CanvasText(canvasTextTestConfig(t, "development")).ServeHTTP(w, httptest.NewRequest("POST", "/api/generate/canvas-text", strings.NewReader(body)))
	result := w.Body.String()
	if w.Code != 502 || !strings.Contains(result, "HTTP 400") || !strings.Contains(result, "unsupported video format") || strings.Contains(result, "secret-test-key") {
		t.Fatalf("unexpected diagnostic: %d %s", w.Code, result)
	}
}

func TestCanvasNativeVideoEmbedsRemoteVideoWithoutGatewayCredentials(t *testing.T) {
	raw := []byte("\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "" || r.Header.Get("x-goog-api-key") != "" {
			t.Error("gateway credentials leaked to media server")
		}
		w.Header().Set("Content-Type", "video/mp4")
		_, _ = w.Write(raw)
	}))
	defer server.Close()
	previous := canvasVideoHTTP
	canvasVideoHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { canvasVideoHTTP = previous })
	video := map[string]any{"url": server.URL + "/video.mp4"}
	wire := map[string]any{"messages": []any{map[string]any{"content": []any{map[string]any{"type": "video_url", "video_url": video}}}}}
	if err := inlineCanvasChatVideos(context.Background(), wire); err != nil {
		t.Fatal(err)
	}
	want := "data:video/mp4;base64," + base64.StdEncoding.EncodeToString(raw)
	if video["url"] != want {
		t.Fatal("remote video not embedded")
	}
}

func TestCanvasNativeVideoDownloadErrorsDoNotExposeSignedURLs(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(403) }))
	defer server.Close()
	previous := canvasVideoHTTP
	canvasVideoHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { canvasVideoHTTP = previous })
	_, err := downloadCanvasChatVideo(context.Background(), server.URL+"/private.mp4?signature=secret")
	if err == nil || !strings.Contains(err.Error(), "HTTP 403") || strings.Contains(err.Error(), "secret") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestCanvasNativeVideoRetriesTruncatedDownload(t *testing.T) {
	raw := []byte("\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00")
	for _, tc := range []struct {
		name              string
		truncatedAttempts int32
	}{
		{name: "recovers from a truncated response", truncatedAttempts: 1},
		{name: "stops after a second truncated response", truncatedAttempts: 2},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var attempts atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "video/mp4")
				w.Header().Set("Content-Length", strconv.Itoa(len(raw)))
				if attempts.Add(1) <= tc.truncatedAttempts {
					_, _ = w.Write(raw[:8])
					return
				}
				_, _ = w.Write(raw)
			}))
			defer server.Close()
			previous := canvasVideoHTTP
			canvasVideoHTTP = func() *http.Client { return server.Client() }
			t.Cleanup(func() { canvasVideoHTTP = previous })

			got, err := downloadCanvasChatVideo(t.Context(), server.URL)
			if tc.truncatedAttempts == 1 {
				want := "data:video/mp4;base64," + base64.StdEncoding.EncodeToString(raw)
				if err != nil || got != want {
					t.Fatalf("expected the complete video after retry, got %q, %v", got, err)
				}
			} else if err == nil || !strings.Contains(err.Error(), "参考视频下载未完成") || got != "" {
				t.Fatalf("expected an incomplete download error, got %q, %v", got, err)
			}
			if count := attempts.Load(); count != 2 {
				t.Fatalf("expected two downloads, got %d", count)
			}
		})
	}
}

func TestCanvasStoryboardExtractsRealBoundariesAndEvidenceFrames(t *testing.T) {
	root, err := filepath.Abs("../../../..")
	if err != nil {
		t.Fatal(err)
	}
	binary, ok := system.FFmpegBinary(root)
	if !ok {
		t.Skip("FFmpeg is unavailable")
	}
	path := filepath.Join(t.TempDir(), "source.mp4")
	args := []string{"-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=96x128:r=12:d=1", "-f", "lavfi", "-i", "color=c=blue:s=96x128:r=12:d=1", "-f", "lavfi", "-i", "color=c=black:s=96x128:r=12:d=0.25", "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]", "-map", "[v]", "-c:v", "libx264", path}
	if out, err := exec.CommandContext(t.Context(), binary, args...).CombinedOutput(); err != nil {
		t.Fatalf("create source: %v %s", err, out)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	wire := map[string]any{"messages": []any{map[string]any{"role": "user", "content": []any{map[string]any{"type": "video_url", "video_url": map[string]any{"url": "data:video/mp4;base64," + base64.StdEncoding.EncodeToString(data)}}}}}}
	evidence, err := prepareCanvasStoryboard(t.Context(), config.Config{Root: root}, wire)
	if err != nil {
		t.Fatal(err)
	}
	if len(evidence.Shots) != 2 || evidence.ContentEnd < 1.95 || evidence.ContentEnd > 2.05 {
		t.Fatalf("unexpected shots: %+v", evidence)
	}
	images := 0
	for _, raw := range evidence.parts {
		part := raw.(map[string]any)
		if part["type"] == "image_url" {
			image := part["image_url"].(map[string]any)
			if !strings.HasPrefix(image["url"].(string), "data:image/jpeg;base64,") {
				t.Fatal("not an inline JPEG")
			}
			images++
		}
	}
	if images != 6 {
		t.Fatalf("expected three observations per shot, got %d", images)
	}
}

func TestCanvasShotBoundariesPreserveShortCutsAndRemoveTerminalBlack(t *testing.T) {
	end, shots, err := canvasShotBoundaries(15.73, "pts_time:1.41177\npts_time:2.52101\npts_time:2.55\npts_time:14.4874\npts_time:15.5294\nblack_start:15.5294 black_end:15.73")
	if err != nil || end != 15.5294 || len(shots) != 4 || shots[1].Start != 1.41177 || shots[3].End != end {
		t.Fatalf("unexpected evidence: %v %v %v", end, shots, err)
	}
	_, _, err = canvasShotBoundaries(60, strings.Repeat("pts_time:1\n", 50))
	if err != nil {
		t.Fatal("duplicate candidates must be coalesced")
	}
}
func TestCanvasObservationMustCoverEveryCandidateBeforeAdaptation(t *testing.T) {
	e := &canvasStoryboardEvidence{Duration: 15.73, ContentEnd: 15.53, Shots: []canvasShot{{Index: 1, Start: 0, End: 3}, {Index: 2, Start: 3, End: 15.53}}}
	response := func(text, reason string) map[string]any {
		return map[string]any{"choices": []any{map[string]any{"finish_reason": reason, "message": map[string]any{"content": text}}}}
	}
	if _, err := canvasObservationText(response("【原片镜头 01】低头", "stop"), e); err == nil {
		t.Fatal("missing shot accepted")
	}
	if _, err := canvasObservationText(response("【原片镜头 01】【原片镜头 02】", "length"), e); err == nil {
		t.Fatal("truncated report accepted")
	}
	text, err := canvasObservationText(response("【原片镜头 01】低头【原片镜头 02】抬眼", "stop"), e)
	if err != nil {
		t.Fatal(err)
	}
	wire := map[string]any{"messages": []any{map[string]any{"role": "user", "content": "目标要求"}}}
	canvasStoryboardAdaptation(wire, e, text)
	messages := anySlice(wire["messages"])
	last := messages[1].(map[string]any)["content"].(string)
	if len(messages) != 2 || !strings.Contains(last, "15.730秒") || !strings.Contains(last, text) || !strings.Contains(last, "源镜号") {
		t.Fatalf("lost evidence: %v", wire)
	}
}

func TestCanvasStoryboardStageReceiptsNeverRedispatchUnknown(t *testing.T) {
	root, err := filepath.Abs("../../../..")
	if err != nil {
		t.Fatal(err)
	}
	binary, ok := system.FFmpegBinary(root)
	if !ok {
		t.Skip("FFmpeg unavailable")
	}
	file := filepath.Join(t.TempDir(), "source.mp4")
	if out, err := exec.CommandContext(t.Context(), binary, "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=96x128:r=12:d=1", "-c:v", "libx264", file).CombinedOutput(); err != nil {
		t.Fatal(err, string(out))
	}
	video, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	for _, scenario := range []string{"success", "observation-unknown", "adaptation-unknown", "observation-settlement-failed"} {
		t.Run(scenario, func(t *testing.T) {
			calls := 0
			var failSettlement func()
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				var wire map[string]any
				if err := json.NewDecoder(r.Body).Decode(&wire); err != nil {
					t.Error(err)
				}
				if calls == 2 {
					raw, _ := json.Marshal(wire["messages"])
					if strings.Contains(string(raw), "data:video/") || strings.Contains(string(raw), "video_url") {
						t.Error("adaptation sent the source video instead of relying on the verified observation")
					}
					if !strings.Contains(string(raw), "保留创作要求") || !strings.Contains(string(raw), "已核实观察") {
						t.Error("adaptation lost the creative brief or the verified observation")
					}
				}
				if calls == 1 && scenario == "observation-settlement-failed" {
					failSettlement()
				}
				if calls == 1 && scenario == "observation-unknown" || calls == 2 && scenario == "adaptation-unknown" {
					w.WriteHeader(502)
					w.Write([]byte(`{"error":{"message":"lost upstream result"}}`))
					return
				}
				text := "【原片镜头 01】已核实观察"
				if calls == 2 {
					text = "【原片风格分析】改编结果"
				}
				json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"finish_reason": "stop", "message": map[string]any{"content": text}}}, "usage": map[string]any{"total_tokens": 7}})
			}))
			defer server.Close()
			cfg := videoSubmissionTestConfig(t, server)
			cfg.Root = root
			previous := canvasHTTP
			canvasHTTP = func() *http.Client { return server.Client() }
			defer func() { canvasHTTP = previous }()
			failSettlement = func() {
				db, err := database.OpenWrite(cfg.SQLiteFile())
				if err != nil {
					t.Error(err)
					return
				}
				defer db.Close()
				if _, err = db.Exec(`CREATE TRIGGER fail_observation BEFORE UPDATE ON "GenerationSubmission" WHEN OLD.kind='canvas-text-observation' BEGIN SELECT RAISE(ABORT,'injected'); END`); err != nil {
					t.Error(err)
				}
			}
			payload := map[string]any{"model": "test", "customBaseUrl": server.URL, "customApiKey": "mock-private", "beikeStoryboardAnalysis": true, "messages": []any{map[string]any{"role": "user", "content": []any{map[string]any{"type": "video_url", "video_url": map[string]any{"url": "data:video/mp4;base64," + base64.StdEncoding.EncodeToString(video)}}, map[string]any{"type": "text", "text": "保留创作要求"}}}}}
			raw, _ := json.Marshal(payload)
			handler := CanvasText(cfg)
			for _, method := range []string{"POST", "GET", "POST", "GET"} {
				r := httptest.NewRequest(method, "/api/generate/canvas-text?operationKey=original", strings.NewReader(string(raw)))
				r.Header.Set("x-idempotency-key", "original")
				w := httptest.NewRecorder()
				handler.ServeHTTP(w, r)
				if scenario == "success" {
					if w.Code != 200 || !strings.Contains(w.Body.String(), "改编结果") {
						t.Fatal(w.Code, w.Body.String())
					}
				} else if w.Code < 500 || !strings.Contains(w.Body.String(), `"submissionUnknown":true`) {
					t.Fatal(w.Code, w.Body.String())
				}
				if scenario == "adaptation-unknown" && !strings.Contains(w.Body.String(), "已核实观察") {
					t.Fatal("lost completed observation", w.Body.String())
				}
				if strings.Contains(w.Body.String(), "mock-private") {
					t.Fatal("credential leaked")
				}
			}
			expected := 2
			if scenario == "observation-unknown" || scenario == "observation-settlement-failed" {
				expected = 1
			}
			if calls != expected {
				t.Fatalf("expected %d calls, got %d", expected, calls)
			}
			observation, err := submission.Read(t.Context(), cfg.SQLiteFile(), "local", "canvas-text-observation", "original")
			if err != nil {
				t.Fatal(err)
			}
			if scenario == "observation-settlement-failed" {
				if observation.Status != 0 {
					t.Fatal("unsettled stage must stay unknown")
				}
			} else if observation.Status == 0 {
				t.Fatal("stage receipt missing")
			}
		})
	}
}
