package generate

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
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
