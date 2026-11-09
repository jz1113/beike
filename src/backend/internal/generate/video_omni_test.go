package generate

import (
	"beike.local/cloud/src/backend/internal/httpx"
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func TestOmniFlashSalesSubmission(t *testing.T) {
	const mp4 = "\x00\x00\x00\x18ftypisom"
	image := smoothPNG(t, 8, 8)
	var submits atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/image.png":
			w.Write(image)
		case "/action.mp4":
			io.WriteString(w, mp4)
		case "/v1/videos":
			submits.Add(1)
			if r.Method != "POST" || r.Header.Get("Authorization") != "Bearer test-key" {
				t.Error("create headers", r.Method)
			}
			if err := r.ParseMultipartForm(1 << 20); err != nil {
				t.Error(err)
				http.Error(w, "expected file upload", 400)
				return
			}
			if len(r.MultipartForm.Value) != 3 || r.FormValue("model") != "omni_flash-10s" || !strings.Contains(r.FormValue("prompt"), "<VIDEO_REF_0>@Video1") || !strings.HasSuffix(r.FormValue("prompt"), "按分镜") || r.FormValue("size") != "720x1280" {
				t.Error("unexpected fields", r.MultipartForm.Value)
			}
			parts := r.MultipartForm.File["input_reference"]
			if len(parts) != 5 {
				t.Errorf("got %d files", len(parts))
				return
			}
			for i, part := range parts {
				f, err := part.Open()
				if err != nil {
					t.Error(err)
					return
				}
				data, err := io.ReadAll(f)
				f.Close()
				if err != nil || len(data) == 0 || i == 4 && (string(data) != mp4 || part.Header.Get("Content-Type") != "video/mp4") {
					t.Error("bad reference", i, err)
				}
			}
			io.WriteString(w, `{"id":"task-omni","status":"queued","progress":0}`)
		case "/v1/videos/task-omni":
			io.WriteString(w, `{"id":"task-omni","status":"in_progress","progress":62}`)
		default:
			t.Error("unexpected route", r.URL.Path)
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	handler := Video(videoSubmissionTestConfig(t, server))
	imageURL := server.URL + "/image.png"
	payload := map[string]any{"prompt": "按分镜", "model": "omni_flash-10s", "aspect_ratio": "9:16", "images": []string{imageURL, imageURL, imageURL, imageURL}, "videos": []string{server.URL + "/action.mp4"}, "ref_mode": "omni", "customBaseUrl": server.URL, "customApiKey": "test-key", "clientTaskId": "omni-test"}
	data, _ := json.Marshal(payload)
	for range 2 {
		req := httptest.NewRequest("POST", "/api/generate/video", bytes.NewReader(data))
		req = req.WithContext(httpx.WithWorkspace(req.Context(), "local"))
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)
		if w.Code != 200 || !strings.Contains(w.Body.String(), `"taskId":"task-omni"`) {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	req := httptest.NewRequest("GET", "/api/generate/video?taskId=task-omni&model=omni_flash-10s", nil)
	req = req.WithContext(httpx.WithWorkspace(req.Context(), "local"))
	req.Header.Set("x-custom-base-url", server.URL)
	req.Header.Set("x-custom-api-key", "test-key")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if submits.Load() != 1 || w.Code != 200 || !strings.Contains(w.Body.String(), `"progress":"62%"`) {
		t.Fatal(submits.Load(), w.Code, w.Body.String())
	}
}

func TestOmniFlashJSONAndImmediateResult(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		if r.URL.Path != "/v1/videos" || r.Header.Get("Content-Type") != "application/json" || json.NewDecoder(r.Body).Decode(&body) != nil || len(body) != 4 || body["size"] != "1280x720" || body["model"] != "omni_flash-10s" || body["images"].([]any)[0] != "https://cdn.example/a.jpg" {
			t.Errorf("unexpected JSON create %s %#v", r.URL.Path, body)
		}
		io.WriteString(w, `{"id":"task-done","status":"completed","progress":100,"video_url":"https://oss-us.file-download.life/result.mp4"}`)
	}))
	defer server.Close()
	handler := Video(videoSubmissionTestConfig(t, server))
	payload := map[string]any{"prompt": "scene", "model": "gemini-omni-1.1-flash", "images": []string{"https://cdn.example/a.jpg"}, "customBaseUrl": server.URL, "customApiKey": "test-key", "clientTaskId": "done"}
	raw, _ := json.Marshal(payload)
	req := httptest.NewRequest("POST", "/api/generate/video", bytes.NewReader(raw))
	req = req.WithContext(httpx.WithWorkspace(req.Context(), "local"))
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"status":"SUCCESS"`) || !strings.Contains(w.Body.String(), `"resultUrl":"https://oss-us.file-download.life/result.mp4"`) {
		t.Fatal(w.Code, w.Body.String())
	}
}
