package generate

import (
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/system"
)

func veoTestClip(t *testing.T, root string, audio bool, seconds string) []byte {
	t.Helper()
	binary, ok := system.FFmpegBinary(root)
	if !ok {
		t.Fatal("FFmpeg required for extension integration test")
	}
	path := filepath.Join(t.TempDir(), "test.mp4")
	args := []string{"-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=1280x720:r=24"}
	if audio {
		args = append(args, "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000")
	}
	args = append(args, "-t", seconds, "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p")
	if audio {
		args = append(args, "-c:a", "aac")
	}
	args = append(args, path)
	if raw, err := exec.Command(binary, args...).CombinedOutput(); err != nil {
		t.Fatalf("fixture: %v %s", err, raw)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func veoRequest(handler http.Handler, method, path, base string, body any) *httptest.ResponseRecorder {
	encoded, _ := json.Marshal(body)
	r := httptest.NewRequest(method, path, strings.NewReader(string(encoded)))
	r.Header.Set("x-custom-base-url", base)
	r.Header.Set("x-custom-api-key", "secret")
	r = r.WithContext(httpx.WithWorkspace(r.Context(), "local"))
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	return w
}

func TestVeoComflyExtensionEndToEnd(t *testing.T) {
	root, _ := filepath.Abs("../../../..")
	original := veoTestClip(t, root, true, "1.25")
	continuation := veoTestClip(t, root, false, "8")
	var submits atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			submits.Add(1)
			var payload map[string]any
			json.NewDecoder(r.Body).Decode(&payload)
			refs, _ := payload["images"].([]any)
			if len(refs) != 1 || !strings.HasPrefix(refs[0].(string), "data:image/png;base64,") || payload["videos"] != nil || payload["extension_strategy"] != nil {
				t.Errorf("bad continuation payload: keys=%v", reflectVeoKeys(payload))
			}
			w.Write([]byte(`{"task_id":"veo-extension-1"}`))
			return
		}
		if r.URL.Path == "/clip.mp4" {
			if r.Header.Get("Authorization") != "" {
				t.Error("API credential leaked to media")
			}
			w.Write(continuation)
			return
		}
		json.NewEncoder(w).Encode(map[string]any{"status": "SUCCESS", "video_url": "http://" + r.Host + "/clip.mp4"})
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	cfg.Root = root
	t.Setenv("AZHUO_CACHE_DIR", filepath.Join(t.TempDir(), "storage"))
	previous := veoMediaHTTP
	veoMediaHTTP = server.Client
	t.Cleanup(func() { veoMediaHTTP = previous })
	handler := Video(cfg)
	body := map[string]any{"model": "veo3.1", "prompt": "继续向前走", "duration": 8, "resolution": "720P", "aspect_ratio": "16:9", "ref_mode": "extend", "videos": []string{"data:video/mp4;base64," + base64.StdEncoding.EncodeToString(original)}, "clientTaskId": "extension-case"}
	first := veoRequest(handler, http.MethodPost, "/api/generate/video", server.URL, body)
	if first.Code != 200 || !strings.Contains(first.Body.String(), `"submissionOutcome":"accepted"`) {
		t.Fatal(first.Code, first.Body.String())
	}
	duplicate := veoRequest(handler, http.MethodPost, "/api/generate/video", server.URL, body)
	if duplicate.Code != 200 || submits.Load() != 1 {
		t.Fatal("duplicate paid submission", duplicate.Code, submits.Load(), duplicate.Body.String())
	}
	// Remove the in-memory routing hint to exercise restart recovery from persisted records.
	videoQueries.Range(func(key, value any) bool { videoQueries.Delete(key); return true })
	path := "/api/generate/video?taskId=veo-extension-1&model=veo3.1"
	deadline := time.Now().Add(25 * time.Second)
	var stored string
	for time.Now().Before(deadline) {
		response := veoRequest(handler, http.MethodGet, path, server.URL, nil)
		var data map[string]any
		json.Unmarshal(response.Body.Bytes(), &data)
		if data["status"] == "SUCCESS" {
			stored, _ = data["resultUrl"].(string)
			break
		}
		if data["resultUrl"] != "" && data["resultUrl"] != nil {
			t.Fatalf("continuation exposed as final: %s", response.Body.String())
		}
		time.Sleep(100 * time.Millisecond)
	}
	if !strings.HasPrefix(stored, "/storage/local/") {
		t.Fatal("join did not finish", stored)
	}
	output := filepath.Join(veoStorageRoot(cfg), strings.TrimPrefix(stored, "/storage/"))
	probe, err := system.ProbeVideo(root, output)
	if err != nil || probe.Duration < 9.1 || probe.Duration > 9.5 || !probe.HasAudio {
		t.Fatal("original duration/audio lost", probe, err)
	}

	binaryPath, _ := system.FFmpegBinary(root)
	energy := func(position string) int64 {
		raw, err := exec.Command(binaryPath, "-nostdin", "-v", "error", "-ss", position, "-i", output, "-t", "0.2", "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", "pipe:1").Output()
		if err != nil || len(raw) == 0 {
			t.Fatal("output audio unreadable", err)
		}
		var total int64
		for index := 0; index+1 < len(raw); index += 2 {
			sample := int64(int16(binary.LittleEndian.Uint16(raw[index : index+2])))
			if sample < 0 {
				sample = -sample
			}
			total += sample
		}
		return total / int64(len(raw)/2)
	}
	if energy("0.1") < 100 || energy("3") > 20 {
		t.Fatal("original audio or continuation silence was changed")
	}
	again := veoRequest(handler, http.MethodGet, path, server.URL, nil)
	if !strings.Contains(again.Body.String(), stored) || submits.Load() != 1 {
		t.Fatal("terminal recovery", again.Body.String(), submits.Load())
	}
}

func reflectVeoKeys(body map[string]any) []string {
	keys := []string{}
	for key := range body {
		keys = append(keys, key)
	}
	return keys
}

func TestVeoNativeSubmissionPollAndPersistence(t *testing.T) {
	root, _ := filepath.Abs("../../../..")
	clip := veoTestClip(t, root, false, "1")
	name := "projects/project-a/locations/us-central1/publishers/google/models/veo-3.1-generate-001/operations/op-1"
	var submits atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.Header.Get("Authorization") != "Bearer secret" {
			t.Errorf("native auth/method")
		}
		var body map[string]any
		json.NewDecoder(r.Body).Decode(&body)
		if strings.HasSuffix(r.URL.Path, ":predictLongRunning") {
			submits.Add(1)
			instances, _ := body["instances"].([]any)
			instance, _ := instances[0].(map[string]any)
			video, _ := instance["video"].(map[string]any)
			if video["bytesBase64Encoded"] != base64.StdEncoding.EncodeToString(clip) || video["url"] != nil {
				t.Error("native media not prepared")
			}
			parameters, _ := body["parameters"].(map[string]any)
			if parameters["durationSeconds"] != nil {
				t.Error("extension sends unsupported duration")
			}
			json.NewEncoder(w).Encode(map[string]any{"name": name})
			return
		}
		if !strings.HasSuffix(r.URL.Path, ":fetchPredictOperation") || body["operationName"] != name {
			t.Errorf("wrong native poll %s", r.URL.Path)
		}
		json.NewEncoder(w).Encode(map[string]any{"done": true, "response": map[string]any{"videos": []map[string]string{{"bytesBase64Encoded": base64.StdEncoding.EncodeToString(clip), "mimeType": "video/mp4"}}}})
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	cfg.Root = root
	t.Setenv("AZHUO_CACHE_DIR", filepath.Join(t.TempDir(), "storage"))
	base := server.URL + "/v1/projects/project-a/locations/us-central1/publishers/google"
	handler := Video(cfg)
	body := map[string]any{"model": "veo3.1", "prompt": "继续", "duration": 7, "resolution": "720P", "ref_mode": "extend", "videos": []string{"data:video/mp4;base64," + base64.StdEncoding.EncodeToString(clip)}, "clientTaskId": "native-case"}
	for range 2 {
		response := veoRequest(handler, http.MethodPost, "/api/generate/video", base, body)
		if response.Code != 200 {
			t.Fatal(response.Code, response.Body.String())
		}
	}
	if submits.Load() != 1 {
		t.Fatal("native submitted twice")
	}
	taskID := encodeVeoOperation(name)
	response := veoRequest(handler, http.MethodGet, "/api/generate/video?taskId="+url.QueryEscape(taskID)+"&model=veo3.1", base, nil)
	var data map[string]any
	json.Unmarshal(response.Body.Bytes(), &data)
	stored, _ := data["resultUrl"].(string)
	if data["status"] != "SUCCESS" || !strings.HasPrefix(stored, "/storage/local/") {
		t.Fatal(response.Code, response.Body.String())
	}
	result, err := os.ReadFile(filepath.Join(veoStorageRoot(cfg), strings.TrimPrefix(stored, "/storage/")))
	if err != nil || string(result) != string(clip) {
		t.Fatal("native video not saved", err)
	}
	filtered, err := readVeoNativeResult(context.Background(), cfg, "local", "filtered", "secret", map[string]any{"response": map[string]any{}})
	if err != nil || filtered.status != "FAILURE" {
		t.Fatal("filtered job not terminal", filtered, err)
	}
}

func TestVeoNativeExtensionContract(t *testing.T) {
	base := "https://us-central1-aiplatform.googleapis.com/v1/projects/project-a/locations/us-central1/publishers/google"
	payload := map[string]json.RawMessage{"ref_mode": rawJSON(t, "extend"), "videos": rawJSON(t, []string{"https://cdn.example/a.mp4"}), "duration": rawJSON(t, 7), "resolution": rawJSON(t, "720P")}
	if message := videoInputError(payload, "veo3.1", base); message != "" {
		t.Fatal(message)
	}
	a := buildVideoPayload("veo3.1", "continue forward", payload)
	if err := applyVeoNativeRoute(base, payload, &a); err != nil {
		t.Fatal(err)
	}
	if a.endpoints[0] != base+"/models/veo-3.1-generate-001:predictLongRunning" {
		t.Fatal(a.endpoints)
	}
	name := "projects/project-a/locations/us-central1/publishers/google/models/veo-3.1-generate-001/operations/op-1"
	id := readVideoTaskID(map[string]any{"name": name}, "veo")
	if decoded, err := decodeVeoOperation(id, base, "veo3.1"); err != nil || decoded != name {
		t.Fatal(id, decoded, err)
	}
	if _, err := decodeVeoOperation(id, "https://relay.example/google/v1/projects/project-a/locations/us-central1/publishers/google", "veo3.1"); err != nil {
		t.Fatal("explicit reverse proxy prefix broke operation validation", err)
	}
	if _, err := decodeVeoOperation(id, "https://us-central1-aiplatform.googleapis.com/v1/projects/other/locations/us-central1/publishers/google", "veo3.1"); err == nil {
		t.Fatal("operation escaped configured project")
	}
}

func TestComflyKlingMotionAndVeoReferenceMapping(t *testing.T) {
	base := "https://ai.comfly.org"
	input := map[string]json.RawMessage{"ref_mode": rawJSON(t, "motion_control"), "images": rawJSON(t, []string{"https://cdn.example/person.png"}), "videos": rawJSON(t, []string{"https://cdn.example/action.mp4"}), "resolution": rawJSON(t, "1080P")}
	for _, model := range []string{"kling-video-v3", "kling-video-v2-6"} {
		if message := videoInputError(input, model, base); message != "" {
			t.Fatal(message)
		}
		a := buildVideoPayload(model, "动作", input)
		applyNativeVideoRoute(base, "motion_control", "secret", &a)
		applyKlingMotionChannel(base, &a)
		if a.payload["video_url"] != "https://cdn.example/action.mp4" || a.payload["image_url"] != "https://cdn.example/person.png" || a.payload["duration"] != nil || a.endpoints[0] != base+"/kling/v1/videos/motion-control" {
			t.Fatal(a)
		}
	}
	input = map[string]json.RawMessage{"ref_mode": rawJSON(t, "omni"), "images": rawJSON(t, []string{"https://cdn.example/person.png"}), "duration": rawJSON(t, 8)}
	a := buildVideoPayload("veo3.1", "reference", input)
	applyVeoComflyChannel(base, input, &a)
	if a.payload["model"] != "veo3.1-components" || a.payload["images"] == nil || a.payload["reference_images"] != nil {
		t.Fatal(a.payload)
	}
}

func TestVeoOperationBinding(t *testing.T) {
	name := "projects/project-a/locations/us-central1/publishers/google/models/veo-3.1-fast-generate-001/operations/op-1"
	id, valid := normalizeVeoBindID(name)
	if !valid || id != encodeVeoOperation(name) {
		t.Fatal("Cloud console operation cannot be recovered")
	}
	if normalized, valid := normalizeVeoBindID(id); !valid || normalized != id {
		t.Fatal("encoded operation rejected")
	}
	for _, invalid := range []string{"projects/evil/../../operations/o", "veo-op.invalid", "veo-op."} {
		if _, valid := normalizeVeoBindID(invalid); valid {
			t.Fatal("invalid operation accepted", invalid)
		}
	}
}
