package generate

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/httpx"
)

type specializedTestTransport func(*http.Request) (*http.Response, error)

func (f specializedTestTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestCanvasSpecializedProvidersAndReceipts(t *testing.T) {
	t.Setenv("RUNNINGHUB_API_KEY", "rh-test")
	t.Setenv("MESHY_API_KEY", "meshy-test")
	cfg := canvasTextTestConfig(t, "development")
	calls := map[string]int{}
	client := &http.Client{Transport: specializedTestTransport(func(r *http.Request) (*http.Response, error) {
		path := r.URL.Path
		calls[path]++
		var body map[string]any
		if r.Body != nil && r.Header.Get("Content-Type") == "application/json" {
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatal(err)
			}
		}
		var result string
		switch path {
		case "/task/openapi/upload":
			if r.URL.Host != "www.runninghub.cn" || !strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
				t.Fatal("incorrect media upload")
			}
			result = `{"code":0,"data":{"fileName":"api/example.png"}}`
		case "/task/openapi/ai-app/run", "/task/openapi/create":
			idField := "webappId"
			if path == "/task/openapi/create" {
				idField = "workflowId"
			}
			if body[idField] != "123" || body["apiKey"] != "rh-test" {
				t.Fatalf("wrong RH payload for %s", path)
			}
			fields := body["nodeInfoList"].([]any)
			if fields[0].(map[string]any)["fieldValue"] != "api/example.png" {
				t.Fatal("reference not uploaded")
			}
			result = `{"code":0,"data":{"taskId":"rh-task"}}`
		case "/openapi/v2/query":
			if body["taskId"] != "rh-task" || r.Header.Get("Authorization") != "Bearer rh-test" {
				t.Fatal("wrong RH query")
			}
			result = `{"status":"SUCCESS","results":[{"url":"https://example.com/result.png","outputType":"png"}]}`
		case "/openapi/v1/image-to-3d":
			if r.URL.Host != "api.meshy.ai" || r.Header.Get("Authorization") != "Bearer meshy-test" || body["should_texture"] != true || body["image_url"] == nil {
				t.Fatal("wrong 3D request")
			}
			result = `{"result":"meshy-task"}`
		case "/openapi/v1/image-to-3d/meshy-task":
			result = `{"status":"SUCCEEDED","model_urls":{"glb":"https://example.com/model.glb"},"thumbnail_url":"https://example.com/preview.png"}`
		default:
			t.Fatalf("unexpected endpoint %s", path)
		}
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(result))}, nil
	})}
	handler := canvasSpecialized(cfg, client)
	do := func(method, operation, workspace, payload string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "/api/generate/canvas-specialized?status=1&operationKey="+operation, strings.NewReader(payload))
		r = r.WithContext(httpx.WithWorkspace(r.Context(), workspace))
		r.Header.Set("x-idempotency-key", operation)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	for _, kind := range []string{"rh-app", "rh-comfy", "gen-3d"} {
		body := `{"kind":"` + kind + `","target":"123","fields":[{"nodeId":"1","fieldName":"image","fieldValue":"data:image/png;base64,YQ=="}],"image":"data:image/png;base64,YQ==","textured":true}`
		for i := 0; i < 2; i++ {
			if w := do("POST", kind, "owner", body); w.Code != 200 {
				t.Fatalf("submit %s: %d %s", kind, w.Code, w.Body.String())
			}
		}
		if w := do("GET", kind, "other", ""); w.Code != 404 {
			t.Fatalf("cross-workspace query: %d", w.Code)
		}
		if w := do("GET", kind, "owner", ""); w.Code != 200 || !strings.Contains(w.Body.String(), `"status":"done"`) {
			t.Fatalf("query %s: %d %s", kind, w.Code, w.Body.String())
		}
	}
	if calls["/task/openapi/ai-app/run"] != 1 || calls["/task/openapi/create"] != 1 || calls["/openapi/v1/image-to-3d"] != 1 || calls["/task/openapi/upload"] != 2 {
		t.Fatalf("unexpected duplicate dispatch: %v", calls)
	}
}

func TestCanvasJimengSendsSignedResolutionAndRecoversReceipt(t *testing.T) {
	t.Setenv("JIMENG_ACCESS_KEY_ID", "fixture-access")
	t.Setenv("JIMENG_SECRET_ACCESS_KEY", "fixture-secret")
	calls := 0
	client := &http.Client{Transport: specializedTestTransport(func(r *http.Request) (*http.Response, error) {
		calls++
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatal(err)
		}
		if r.URL.Host != jimengHost || r.URL.Query().Get("Version") != "2022-08-31" ||
			r.Header.Get("X-Content-Sha256") != jimengHexHash(body) ||
			!strings.Contains(r.Header.Get("Authorization"), "Credential=fixture-access/") ||
			!strings.Contains(r.Header.Get("Authorization"), "/cn-north-1/cv/request") ||
			strings.Contains(r.Header.Get("Authorization"), "fixture-secret") {
			t.Fatal("unexpected signing metadata")
		}
		var payload map[string]any
		if json.Unmarshal(body, &payload) != nil || payload["req_key"] != jimengReqKey {
			t.Fatal("unexpected payload")
		}
		var reply string
		switch r.URL.Query().Get("Action") {
		case "CVSync2AsyncSubmitTask":
			if payload["resolution"] != "8k" || payload["scale"] != float64(68) {
				t.Fatal("incorrect upscaling settings")
			}
			reply = `{"code":10000,"data":{"task_id":"12345"}}`
		case "CVSync2AsyncGetResult":
			if payload["task_id"] != "12345" || payload["req_json"] != `{"return_url":true}` {
				t.Fatal("incorrect polling parameters")
			}
			reply = `{"code":10000,"data":{"status":"done","image_urls":["https://example.com/8k.png"]}}`
		default:
			t.Fatal("unexpected provider action")
		}
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(reply))}, nil
	})}
	handler := canvasSpecialized(canvasTextTestConfig(t, "development"), client)
	do := func(method string, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "/api/generate/canvas-specialized?status=1&operationKey=upscale", strings.NewReader(body))
		r = r.WithContext(httpx.WithWorkspace(r.Context(), "owner"))
		r.Header.Set("x-idempotency-key", "upscale")
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	body := `{"kind":"jimeng-super-resolution","resolution":"8k","detail":68,"image":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZuoAAAAASUVORK5CYII="}`
	for range 2 {
		if w := do("POST", body); w.Code != 200 {
			t.Fatalf("submit: %d %s", w.Code, w.Body.String())
		}
	}
	if w := do("GET", ""); w.Code != 200 || !strings.Contains(w.Body.String(), "https://example.com/8k.png") {
		t.Fatalf("poll: %d %s", w.Code, w.Body.String())
	}
	if calls != 2 {
		t.Fatalf("expected one submit and one query, got %d", calls)
	}
}

func TestCanvasFal3DQueueSubmitAndPoll(t *testing.T) {
	t.Setenv("AI_DRAWING_BASE_URL", "https://proxy.example.com/v1")
	t.Setenv("FAL_API_KEY", "fal-bearer-secret")
	cfg := canvasTextTestConfig(t, "development")

	statusPollCount := 0
	var capturedPaths []string
	client := &http.Client{Transport: specializedTestTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Host != "proxy.example.com" {
			t.Fatalf("expected queue.fal.run rewritten to proxy.example.com, got %s", r.URL.Host)
		}
		if r.Header.Get("Authorization") != "Bearer fal-bearer-secret" {
			t.Fatalf("expected Bearer auth header, got %q", r.Header.Get("Authorization"))
		}
		capturedPaths = append(capturedPaths, r.Method+" "+r.URL.Path)

		var payload map[string]any
		if r.Body != nil && r.Header.Get("Content-Type") == "application/json" {
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				t.Fatal(err)
			}
		}

		var reply string
		switch r.URL.Path {
		case "/fal/fal-ai/hunyuan-3d/v3.1/pro/text-to-3d":
			if payload["prompt"] != "cyberpunk helmet" || payload["generate_type"] != "Normal" || payload["enable_pbr"] != true || payload["face_count"] != float64(500000) {
				t.Fatalf("unexpected hunyuan pro payload: %#v", payload)
			}
			reply = `{"request_id":"req-hunyuan-1","status":"IN_QUEUE","status_url":"https://queue.fal.run/fal-ai/hunyuan-3d/requests/req-hunyuan-1/status","response_url":"https://queue.fal.run/fal-ai/hunyuan-3d/requests/req-hunyuan-1"}`
		case "/fal/fal-ai/hunyuan-3d/requests/req-hunyuan-1/status":
			statusPollCount++
			if statusPollCount == 1 {
				reply = `{"status":"IN_PROGRESS"}`
			} else {
				reply = `{"status":"COMPLETED"}`
			}
		case "/fal/fal-ai/hunyuan-3d/requests/req-hunyuan-1":
			reply = `{"model_glb":{"url":"https://cdn.example.com/helmet.glb"},"model_urls":{"glb":{"url":"https://cdn.example.com/helmet.glb"},"obj":{"url":"https://cdn.example.com/helmet.obj"}},"thumbnail":{"url":"https://cdn.example.com/helmet.png"}}`
		case "/fal/tripo3d/h3.1/multiview-to-3d":
			imgs, _ := payload["image_urls"].([]any)
			if len(imgs) != 2 || payload["texture"] != false || payload["pbr"] != false {
				t.Fatalf("unexpected tripo multiview payload: %#v", payload)
			}
			reply = `{"request_id":"req-tripo-1","status_url":"https://queue.fal.run/tripo3d/h3.1/requests/req-tripo-1/status","response_url":"https://queue.fal.run/tripo3d/h3.1/requests/req-tripo-1"}`
		case "/fal/tripo3d/h3.1/requests/req-tripo-1/status":
			reply = `{"status":"COMPLETED","model_mesh":{"url":"https://cdn.example.com/tripo.glb"},"rendered_image":{"url":"https://cdn.example.com/tripo.webp"}}`
		default:
			t.Fatalf("unexpected fal request path: %s", r.URL.Path)
		}
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(reply))}, nil
	})}

	handler := canvasSpecialized(cfg, client)
	do := func(method, op, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "/api/generate/canvas-specialized?status=1&operationKey="+op, strings.NewReader(body))
		r = r.WithContext(httpx.WithWorkspace(r.Context(), "owner"))
		r.Header.Set("x-idempotency-key", op)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}

	submitBody := `{"kind":"gen-3d","model":"hunyuan-3d-pro-fal","material":"pbr","prompt":"cyberpunk helmet"}`
	if w := do("POST", "fal-op-1", submitBody); w.Code != 200 {
		t.Fatalf("submit hunyuan pro failed: %d %s", w.Code, w.Body.String())
	}
	if w := do("GET", "fal-op-1", ""); w.Code != 200 || !strings.Contains(w.Body.String(), `"status":"pending"`) {
		t.Fatalf("first poll expected pending: %d %s", w.Code, w.Body.String())
	}
	wDone := do("GET", "fal-op-1", "")
	if wDone.Code != 200 || !strings.Contains(wDone.Body.String(), `"status":"done"`) || !strings.Contains(wDone.Body.String(), `"modelUrl":"https://cdn.example.com/helmet.glb"`) {
		t.Fatalf("second poll expected done with glb url: %d %s", wDone.Code, wDone.Body.String())
	}

	tripoBody := `{"kind":"gen-3d","model":"tripo-h3","material":"geometry","images":["https://cdn.example.com/front.png","https://cdn.example.com/back.png"]}`
	if w := do("POST", "fal-op-2", tripoBody); w.Code != 200 {
		t.Fatalf("submit tripo multiview failed: %d %s", w.Code, w.Body.String())
	}
	wTripo := do("GET", "fal-op-2", "")
	if wTripo.Code != 200 || !strings.Contains(wTripo.Body.String(), `"modelUrl":"https://cdn.example.com/tripo.glb"`) {
		t.Fatalf("poll tripo expected done: %d %s", wTripo.Code, wTripo.Body.String())
	}
	if len(capturedPaths) != 6 {
		t.Fatalf("unexpected call sequence: %v", capturedPaths)
	}
}

func TestFalQueueDoesNotAcceptForeignPollOrigins(t *testing.T) {
	base := "https://configured.example/fal"
	if got := rewriteFalURL("https://other.example/fal/status", base, true); got != "" {
		t.Fatalf("accepted foreign status URL: %s", got)
	}
	if got := rewriteFalURL("https://configured.example/fal/status", base, true); got != base+"/status" {
		t.Fatalf("rejected configured queue URL: %s", got)
	}
}
