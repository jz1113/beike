package generate

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func serviceImageRequest(workspace string) *http.Request {
	r := httptest.NewRequest(http.MethodPost, "/api/sales/asset-view-jobs", nil)
	return r.WithContext(httpx.WithWorkspace(r.Context(), workspace))
}

func serviceImagePayload(base string) map[string]any {
	return map[string]any{"model": "gpt-image-2", "prompt": "海边九宫格", "customBaseUrl": base, "customApiKey": "test-only", "customProtocol": "openai"}
}

func TestRunImageTaskCheckpointsAndReusesPaidResult(t *testing.T) {
	var submits, polls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-only" {
			t.Errorf("credentials lost for %s", r.Method)
		}
		if r.Method == http.MethodPost {
			submits.Add(1)
			_, _ = w.Write([]byte(`{"task_id":"service-image"}`))
			return
		}
		polls.Add(1)
		_, _ = w.Write([]byte(`{"status":"SUCCESS","url":"https://cdn.example.com/grid.jpg"}`))
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	r := serviceImageRequest("owner")
	var saved []ImageTaskCheckpoint
	state, err := RunImageTask(cfg, r, serviceImagePayload(server.URL), "grid-key", ImageTaskCheckpoint{}, func(next ImageTaskCheckpoint) error {
		saved = append(saved, next)
		return nil
	})
	if err != nil || state.ResultURL != "https://cdn.example.com/grid.jpg" || state.TaskID != "service-image" || len(saved) != 2 || saved[0].ResultURL != "" || submits.Load() != 1 || polls.Load() != 1 {
		t.Fatalf("state=%+v saved=%+v submits=%d polls=%d err=%v", state, saved, submits.Load(), polls.Load(), err)
	}
	if r.Header.Get("x-custom-api-key") != "" || r.URL.RawQuery != "" {
		t.Fatal("caller request was mutated")
	}
	// A worker losing its local checkpoint can still recover from the same key.
	recovered, err := RunImageTask(cfg, r, serviceImagePayload(server.URL), "grid-key", ImageTaskCheckpoint{}, nil)
	if err != nil || recovered.ResultURL != state.ResultURL || submits.Load() != 1 || polls.Load() != 1 {
		t.Fatalf("recovered=%+v submits=%d polls=%d err=%v", recovered, submits.Load(), polls.Load(), err)
	}
}

func TestRunImageTaskStopsOnCheckpointFailureAndOnlyPollsOnResume(t *testing.T) {
	var submits, polls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			submits.Add(1)
			_, _ = w.Write([]byte(`{"task_id":"resume-image"}`))
			return
		}
		polls.Add(1)
		_, _ = w.Write([]byte(`{"status":"SUCCESS","url":"https://cdn.example.com/resumed.jpg"}`))
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	persistErr := errors.New("checkpoint unavailable")
	state, err := RunImageTask(cfg, serviceImageRequest("owner"), serviceImagePayload(server.URL), "resume-key", ImageTaskCheckpoint{}, func(ImageTaskCheckpoint) error { return persistErr })
	if !errors.Is(err, persistErr) || state.TaskID != "resume-image" || submits.Load() != 1 || polls.Load() != 0 {
		t.Fatalf("state=%+v submits=%d polls=%d err=%v", state, submits.Load(), polls.Load(), err)
	}
	state, err = RunImageTask(cfg, serviceImageRequest("owner"), serviceImagePayload(server.URL), "resume-key", state, nil)
	if err != nil || state.ResultURL == "" || submits.Load() != 1 || polls.Load() != 1 {
		t.Fatalf("resume=%+v submits=%d polls=%d err=%v", state, submits.Load(), polls.Load(), err)
	}
	// A persisted result can proceed to crop/storage without model settings or IO.
	state, err = RunImageTask(config.Config{}, serviceImageRequest("owner"), nil, "", state, nil)
	if err != nil || state.ResultURL == "" || submits.Load() != 1 || polls.Load() != 1 {
		t.Fatalf("result checkpoint=%+v err=%v", state, err)
	}
}

func TestRunImageTaskUnknownSubmissionDoesNotResubmit(t *testing.T) {
	var submits atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		submits.Add(1)
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"message":"provider outcome unknown"}`))
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	for i := 0; i < 2; i++ {
		_, err := RunImageTask(cfg, serviceImageRequest("owner"), serviceImagePayload(server.URL), "unknown-key", ImageTaskCheckpoint{}, nil)
		var taskErr *ImageTaskError
		if !errors.As(err, &taskErr) || !taskErr.SubmissionUnknown {
			t.Fatalf("unknown submission: %v", err)
		}
	}
	if submits.Load() != 1 {
		t.Fatalf("unknown paid request was resubmitted %d times", submits.Load())
	}
}

func TestRunImageTaskValidatesAndRespectsWorkspaceOwnership(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		_, _ = w.Write([]byte(`{"task_id":"private-image"}`))
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	payload := serviceImagePayload(server.URL)
	payload["prompt"] = ""
	if _, err := RunImageTask(cfg, serviceImageRequest("owner"), payload, "invalid", ImageTaskCheckpoint{}, nil); err == nil || !strings.Contains(err.Error(), "提示词") || calls.Load() != 0 {
		t.Fatalf("validation: calls=%d err=%v", calls.Load(), err)
	}
	stop := errors.New("stop after submission")
	state, err := RunImageTask(cfg, serviceImageRequest("owner"), serviceImagePayload(server.URL), "private-key", ImageTaskCheckpoint{}, func(ImageTaskCheckpoint) error { return stop })
	if !errors.Is(err, stop) {
		t.Fatal(err)
	}
	_, err = RunImageTask(cfg, serviceImageRequest("other"), serviceImagePayload(server.URL), "private-key", state, nil)
	if err == nil || calls.Load() != 1 {
		t.Fatalf("ownership: calls=%d err=%v", calls.Load(), err)
	}
}

func TestRunImageTaskCancellationStopsPollingWithoutResubmission(t *testing.T) {
	var submits atomic.Int32
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			submits.Add(1)
			_, _ = w.Write([]byte(`{"task_id":"waiting-image"}`))
			return
		}
		cancel()
		_, _ = w.Write([]byte(`{"status":"IN_PROGRESS"}`))
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	r := serviceImageRequest("owner").WithContext(httpx.WithWorkspace(ctx, "owner"))
	state, err := RunImageTask(cfg, r, serviceImagePayload(server.URL), "cancel-key", ImageTaskCheckpoint{}, nil)
	if !errors.Is(err, context.Canceled) || state.TaskID != "waiting-image" || submits.Load() != 1 {
		t.Fatalf("state=%+v submits=%d err=%v", state, submits.Load(), err)
	}
}

func TestRunImageTaskPreservesCustomTemplateAndProtocolForPolling(t *testing.T) {
	server := httptest.NewServer(http.NotFoundHandler())
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	var submits, polls atomic.Int32
	gateway.ModelHTTP = func() *http.Client {
		return &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			body := `{"state":"ready","image":"https://cdn.example.com/template.jpg"}`
			if r.Method == http.MethodPost {
				submits.Add(1)
				if r.URL.String() != "https://template.example.com/submit" || r.Header.Get("x-api-key") != "test-only" {
					t.Errorf("template submit: url=%s x-api-key=%q", r.URL, r.Header.Get("x-api-key"))
				}
				body = `{"receipt":{"id":"template-job"}}`
			} else {
				polls.Add(1)
				if r.URL.String() != "https://template.example.com/poll/template-job" {
					t.Errorf("template poll URL: %s", r.URL)
				}
			}
			return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body))}, nil
		})}
	}
	payload := serviceImagePayload("https://template.example.com")
	payload["customProtocol"] = "template"
	payload["requestTemplate"] = map[string]any{
		"submit": map[string]any{"url": "https://template.example.com/submit", "headers": map[string]any{"x-api-key": "{{apiKey}}"}, "body": `{"prompt":"{{prompt}}","model":"{{model}}"}`},
		"result": map[string]any{"taskIdPath": "receipt.id"},
		"poll":   map[string]any{"url": "https://template.example.com/poll/{{taskId}}", "statusPath": "state", "imageUrlPath": "image", "successValues": []string{"ready"}},
	}
	state, err := RunImageTask(cfg, serviceImageRequest("owner"), payload, "template-key", ImageTaskCheckpoint{}, nil)
	if err != nil || state.TaskID != "template-job" || state.ResultURL != "https://cdn.example.com/template.jpg" || submits.Load() != 1 || polls.Load() != 1 {
		t.Fatalf("template state=%+v submits=%d polls=%d err=%v", state, submits.Load(), polls.Load(), err)
	}
}

func TestBackgroundImageRunnerIsolatesSameProviderNumberByOriginalRecord(t *testing.T) {
	var submits, polls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			submits.Add(1)
			_, _ = w.Write([]byte(`{"task_id":"same-provider-number"}`))
			return
		}
		polls.Add(1)
		_, _ = w.Write([]byte(`{"status":"SUCCESS","url":"https://cdn.example/result.jpg"}`))
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	a, err := RunImageTask(cfg, serviceImageRequest("owner"), serviceImagePayload(server.URL+"/channel-a"), "operation-a", ImageTaskCheckpoint{}, nil)
	if err != nil || a.ResultURL == "" {
		t.Fatalf("first %v %#v", err, a)
	}
	b, err := RunImageTask(cfg, serviceImageRequest("owner"), serviceImagePayload(server.URL+"/channel-b"), "operation-b", ImageTaskCheckpoint{}, nil)
	if err != nil || b.ResultURL == "" {
		t.Fatalf("second record collision: state=%#v err=%v", b, err)
	}
	if submits.Load() != 2 || polls.Load() != 2 {
		t.Fatalf("submits=%d polls=%d", submits.Load(), polls.Load())
	}
}

func TestBackgroundImageRunnerRestoresOriginalRecordAcrossCheckpointFailure(t *testing.T) {
	for _, legacy := range []bool{false, true} {
		t.Run(fmt.Sprint("legacy-", legacy), func(t *testing.T) {
			var submits, polls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method == http.MethodPost {
					submits.Add(1)
					_, _ = w.Write([]byte(`{"task_id":"shared-number"}`))
					return
				}
				polls.Add(1)
				_, _ = w.Write([]byte(`{"status":"SUCCESS","url":"https://cdn.example/result.jpg"}`))
			}))
			defer server.Close()
			cfg := videoSubmissionTestConfig(t, server)
			_, err := RunImageTask(cfg, serviceImageRequest("owner"), serviceImagePayload(server.URL+"/a"), "op-a", ImageTaskCheckpoint{}, nil)
			if err != nil {
				t.Fatal(err)
			}
			stop := errors.New("checkpoint write failed")
			checkpoint, err := RunImageTask(cfg, serviceImageRequest("owner"), serviceImagePayload(server.URL+"/b"), "op-b", ImageTaskCheckpoint{}, func(ImageTaskCheckpoint) error { return stop })
			if !errors.Is(err, stop) || checkpoint.RecordID == "" {
				t.Fatal("lost original record", checkpoint, err)
			}
			recordID := checkpoint.RecordID
			if legacy {
				checkpoint.RecordID = ""
			}
			checkpoint, err = RunImageTask(cfg, serviceImageRequest("owner"), serviceImagePayload(server.URL+"/b"), "op-b", checkpoint, nil)
			if err != nil || checkpoint.RecordID != recordID || checkpoint.ResultURL == "" || submits.Load() != 2 || polls.Load() != 2 {
				t.Fatal("recovery confused channels", checkpoint, err, submits.Load(), polls.Load())
			}
		})
	}
}

func TestImageRouteBindsTemplatePollURLAcrossRestart(t *testing.T) {
	server := httptest.NewServer(http.NotFoundHandler())
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	template := `{"submit":{"url":"https://template.example/submit"},"result":{"taskIdPath":"id"},"poll":{"url":"https://template.example/poll/{{taskId}}","statusPath":"status","imageUrlPath":"url","successValues":["done"]}}`
	body, _ := json.Marshal(map[string]any{"model": "gpt-image-2", "prompt": "test", "customBaseUrl": server.URL, "customApiKey": "test-only", "customProtocol": "template", "requestTemplate": json.RawMessage(template)})
	var payload map[string]json.RawMessage
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest(http.MethodPost, "/api/generate/image", strings.NewReader(string(body)))
	claim, status, message := claimImageSubmission(cfg, r, payload, "gpt-image-2", "test", "high", "1024x1024", "template-key")
	if status != 0 {
		t.Fatalf("claim %d %s", status, message)
	}
	db, err := openTaskDB(cfg)
	if err != nil {
		t.Fatal(err)
	}
	err = settleImageSubmission(r.Context(), db, claim.recordID, imageTaskDraft{TaskID: "template-pinned", Status: "IN_PROGRESS"})
	_ = db.Close()
	if err != nil {
		t.Fatal(err)
	}
	imageRequestTemplates.Delete(imageTemplateKey(server.URL, "template-pinned"))
	check := func(rawTemplate string) (bool, *httptest.ResponseRecorder) {
		query := httptest.NewRequest(http.MethodGet, "/api/generate/image?taskId=template-pinned&model=gpt-image-2", nil)
		query.Header.Set("x-custom-base-url", server.URL)
		query.Header.Set("x-custom-api-key", "test-only")
		query.Header.Set("x-custom-protocol", "template")
		query.Header.Set("x-request-template", rawTemplate)
		w := httptest.NewRecorder()
		allowed := authorizeImageRoute(cfg, w, query, "template-pinned")
		return allowed, w
	}
	allowed, changed := check(strings.ReplaceAll(template, "template.example", "other-template.example"))
	if allowed || changed.Code != http.StatusConflict {
		t.Fatalf("changed template allowed: %d %s", changed.Code, changed.Body.String())
	}
	var parsed any
	_ = json.Unmarshal([]byte(template), &parsed)
	reordered, _ := json.Marshal(parsed)
	allowed, restored := check(string(reordered))
	if !allowed {
		t.Fatalf("equivalent template rejected: %d %s", restored.Code, restored.Body.String())
	}
}

func TestImageRoutePersistsAndBlocksChangedChannelBeforeUpstream(t *testing.T) {
	var posts, polls, otherCalls atomic.Int32
	original := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-only" {
			t.Error("unexpected credential")
		}
		if r.Method == http.MethodPost {
			posts.Add(1)
			_, _ = w.Write([]byte(`{"task_id":"pinned-task"}`))
		} else {
			polls.Add(1)
			_, _ = w.Write([]byte(`{"data":{"status":"SUCCESS","url":"https://media.example/pinned.png"}}`))
		}
	}))
	defer original.Close()
	other := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { otherCalls.Add(1); w.WriteHeader(http.StatusNotFound) }))
	defer other.Close()
	cfg := videoSubmissionTestConfig(t, original)
	submitted := imageSubmissionPost(Image(cfg), original.URL, "pinned-key", "test", "owner")
	if submitted.Code != http.StatusOK {
		t.Fatalf("submit %d %s", submitted.Code, submitted.Body.String())
	}
	db, err := openTaskDB(cfg)
	if err != nil {
		t.Fatal(err)
	}
	var fingerprint string
	err = db.QueryRow(`SELECT "routeFingerprint" FROM "ImageTask" WHERE "taskId" = 'pinned-task'`).Scan(&fingerprint)
	_ = db.Close()
	if err != nil || len(fingerprint) != 64 || strings.Contains(fingerprint, "test-only") {
		t.Fatalf("invalid route digest: %v", err)
	}

	for _, tc := range []struct{ name, base, key, protocol, query string }{
		{"changed-address", other.URL, "test-only", "", "taskId=pinned-task"},
		{"rotated-key", original.URL, "new-account", "", "taskId=pinned-task"},
		{"changed-protocol", original.URL, "test-only", "dashscope", "taskId=pinned-task"},
		{"keyed-recovery", other.URL, "test-only", "", "taskKey=pinned-key"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, "/api/generate/image?"+tc.query+"&model=gpt-image-2", nil)
			r = r.WithContext(httpx.WithWorkspace(r.Context(), "owner"))
			r.Header.Set("x-custom-base-url", tc.base)
			r.Header.Set("x-custom-api-key", tc.key)
			r.Header.Set("x-custom-protocol", tc.protocol)
			w := httptest.NewRecorder()
			// A fresh handler and DB connection rely only on the persistent receipt.
			Image(cfg).ServeHTTP(w, r)
			if w.Code != http.StatusConflict || !strings.Contains(w.Body.String(), `"code":"task_route_changed"`) || !strings.Contains(w.Body.String(), `"submissionUnknown":true`) {
				t.Fatalf("query %d %s", w.Code, w.Body.String())
			}
			if posts.Load() != 1 || polls.Load() != 0 || otherCalls.Load() != 0 {
				t.Fatal("route conflict contacted a provider")
			}
		})
	}
	r := httptest.NewRequest(http.MethodGet, "/api/generate/image?taskId=pinned-task&model=gpt-image-2", nil)
	r = r.WithContext(httpx.WithWorkspace(r.Context(), "owner"))
	r.Header.Set("x-custom-base-url", original.URL)
	r.Header.Set("x-custom-api-key", "test-only")
	w := httptest.NewRecorder()
	Image(cfg).ServeHTTP(w, r)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "pinned.png") || polls.Load() != 1 || posts.Load() != 1 {
		t.Fatalf("restore original route: %d %s polls=%d posts=%d", w.Code, w.Body.String(), polls.Load(), posts.Load())
	}
}

func TestRunImageTaskPreservesUsageBeforeFailureAndDuringRecovery(t *testing.T) {
	var submits, polls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			submits.Add(1)
			_, _ = w.Write([]byte(`{"task_id":"charged-image","usage":{"prompt_tokens":11}}`))
			return
		}
		polls.Add(1)
		_, _ = w.Write([]byte(`{"status":"FAILURE","message":"charged but failed","usage":{"completion_tokens":7}}`))
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	db, openErr := openTaskDB(cfg)
	if openErr != nil {
		t.Fatal(openErr)
	}
	if _, err := db.Exec(`ALTER TABLE "ImageTask" ADD COLUMN "usage" TEXT`); err != nil {
		t.Fatal(err)
	}
	db.Close()
	var saved ImageTaskCheckpoint
	state, err := RunImageTask(cfg, serviceImageRequest("owner"), serviceImagePayload(server.URL), "charged-op", ImageTaskCheckpoint{}, func(next ImageTaskCheckpoint) error { saved = next; return nil })
	if err == nil || submits.Load() != 1 || polls.Load() != 1 {
		t.Fatal(state, err)
	}
	raw, _ := json.Marshal(saved)
	var receipt map[string]any
	_ = json.Unmarshal(raw, &receipt)
	if usage := gateway.NormalizeUsage(receipt); usage == nil || usage["promptTokens"] != float64(11) || usage["completionTokens"] != float64(7) || usage["totalTokens"] != float64(18) {
		t.Fatalf("paid usage lost: %s", raw)
	}
	_, err = RunImageTask(cfg, serviceImageRequest("owner"), serviceImagePayload(server.URL), "charged-op", saved, nil)
	if err == nil || submits.Load() != 1 || polls.Load() != 1 {
		t.Fatal("terminal recovery called model", err)
	}
}

func TestRunImageTaskRetainsBilledSubmissionFailureOnSameKeyReplay(t *testing.T) {
	for _, status := range []int{200, 400, 503} {
		t.Run(fmt.Sprint(status), func(t *testing.T) {
			var submits atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				submits.Add(1)
				w.WriteHeader(status)
				_, _ = w.Write([]byte(`{"message":"output unavailable","usage":{"total_tokens":23}}`))
			}))
			defer server.Close()
			cfg := videoSubmissionTestConfig(t, server)
			db, openErr := openTaskDB(cfg)
			if openErr != nil {
				t.Fatal(openErr)
			}
			if _, err := db.Exec(`ALTER TABLE "ImageTask" ADD COLUMN "usage" TEXT`); err != nil {
				t.Fatal(err)
			}
			db.Close()
			for attempt := 0; attempt < 2; attempt++ {
				state, err := RunImageTask(cfg, serviceImageRequest("owner"), serviceImagePayload(server.URL), "paid-submit-failure", ImageTaskCheckpoint{}, nil)
				raw, _ := json.Marshal(state)
				var body map[string]any
				_ = json.Unmarshal(raw, &body)
				if usage := gateway.NormalizeUsage(body); err == nil || usage == nil || usage["totalTokens"] != float64(23) || state.ResultURL != "" {
					t.Fatalf("paid submission lost: err=%v state=%s", err, raw)
				}
			}
			if submits.Load() != 1 {
				t.Fatal("paid submission repeated", submits.Load())
			}
		})
	}
}
