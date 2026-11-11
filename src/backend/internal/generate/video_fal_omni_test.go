package generate

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"beike.local/cloud/src/backend/internal/gateway"
)

func TestFalOmniSubmissionUsesQueueAndRecoversByOriginalTask(t *testing.T) {
	const base = "https://queue.fal.run"
	const endpoint = falOmniPath + "/v1.2/image-to-video"
	const resultURL = "https://v3.fal.media/files/result.mp4"
	var submissions atomic.Int32
	var statusCalls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Key secret" {
			t.Errorf("wrong fal authentication: %s", r.Header.Get("Authorization"))
		}
		switch {
		case r.Method == http.MethodPost && r.URL.Path == endpoint:
			submissions.Add(1)
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Error(err)
			}
			if body["image_url"] != "https://cdn.example/first.jpg" || body["end_image_url"] != "https://cdn.example/last.jpg" ||
				body["duration"] != float64(12) || body["resolution"] != "360p" || body["aspect_ratio"] != "9:16" || body["model"] != nil {
				t.Errorf("invalid image-to-video payload: %#v", body)
			}
			w.Write([]byte(`{"request_id":"fal-video-task"}`))
		case r.Method == http.MethodGet && r.URL.Path == falOmniPath+"/requests/fal-video-task/status":
			if statusCalls.Add(1) == 1 {
				w.Write([]byte(`{"status":"IN_QUEUE"}`))
			} else {
				w.Write([]byte(`{"status":"COMPLETED"}`))
			}
		case r.Method == http.MethodGet && r.URL.Path == falOmniPath+"/requests/fal-video-task":
			json.NewEncoder(w).Encode(map[string]any{"video": map[string]string{"url": resultURL}})
		default:
			t.Errorf("unexpected fal request %s %s", r.Method, r.URL.Path)
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	cfg := videoSubmissionTestConfig(t, server)
	target, _ := url.Parse(server.URL)
	gateway.ModelHTTP = func() *http.Client {
		return &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			if req.URL.Scheme != "https" || req.URL.Host != "queue.fal.run" {
				t.Errorf("unexpected upstream %s", req.URL.Host)
			}
			local := req.Clone(req.Context())
			local.URL.Scheme, local.URL.Host = target.Scheme, target.Host
			return http.DefaultTransport.RoundTrip(local)
		})}
	}

	body := map[string]any{
		"model": falOmniModel, "prompt": "人物在画面中自然转身", "duration": 12, "resolution": "360P", "aspect_ratio": "9:16",
		"ref_mode": "first_last_frame", "clientTaskId": "fal-omni-run",
		"first_frame_image": "https://cdn.example/first.jpg", "last_frame_image": "https://cdn.example/last.jpg",
	}
	for range 2 {
		res := veoRequest(Video(cfg), http.MethodPost, "/api/generate/video", base, body)
		if res.Code != http.StatusOK || !strings.Contains(res.Body.String(), "fal-video-task") {
			t.Fatal(res.Code, res.Body.String())
		}
	}
	videoQueries = sync.Map{}
	pollPath := "/api/generate/video?taskId=fal-video-task&model=" + falOmniModel
	if res := veoRequest(Video(cfg), http.MethodGet, pollPath, "https://gateway.example", nil); res.Code != http.StatusConflict {
		t.Fatal(res.Code, res.Body.String())
	}
	if res := veoRequest(Video(cfg), http.MethodGet, pollPath, base, nil); !strings.Contains(res.Body.String(), "IN_PROGRESS") {
		t.Fatal(res.Code, res.Body.String())
	}
	if res := veoRequest(Video(cfg), http.MethodGet, pollPath, base, nil); res.Code != http.StatusOK || !strings.Contains(res.Body.String(), resultURL) {
		t.Fatal(res.Code, res.Body.String())
	}
	if submissions.Load() != 1 || statusCalls.Load() != 2 {
		t.Fatal("unexpected number of upstream requests", submissions.Load(), statusCalls.Load())
	}
}

func TestFalOmni10UsesUnversionedEndpointAndItsOwnParameters(t *testing.T) {
	payload := map[string]json.RawMessage{
		"prompt":       json.RawMessage(`"小猫跳上沙发"`),
		"ref_mode":     json.RawMessage(`"omni"`),
		"duration":     json.RawMessage(`10`),
		"aspect_ratio": json.RawMessage(`"9:16"`),
		"images":       json.RawMessage(`["https://cdn.example/subject.jpg"]`),
	}
	if reason := videoInputError(payload, falOmni10Model, "https://queue.fal.run"); reason != "" {
		t.Fatal(reason)
	}
	adapted := buildVideoPayload(falOmni10Model, "小猫跳上沙发", payload)
	if adapted.payload["resolution"] != nil || adapted.payload["duration"] != 10 || adapted.payload["aspect_ratio"] != "9:16" {
		t.Fatalf("unexpected Omni 1.0 payload: %#v", adapted.payload)
	}
	if path := falOmniEndpoint(falOmni10Model, "omni"); path != falOmniPath+"/reference-to-video" {
		t.Fatal(path)
	}
	payload["duration"] = json.RawMessage(`11`)
	if reason := videoInputError(payload, falOmni10Model, "https://queue.fal.run"); reason == "" {
		t.Fatal("11 seconds is outside Omni 1.0's supported range")
	}
}
