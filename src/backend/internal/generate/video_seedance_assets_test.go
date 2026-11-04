package generate

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
)

func TestSeedanceRegistersAndPollsAssetsUntilActive(t *testing.T) {
	seedanceAssetCache = sync.Map{}
	prevPoll := seedanceAssetPollWait
	seedanceAssetPollWait = 5 * time.Millisecond
	t.Cleanup(func() { seedanceAssetPollWait = prevPoll })

	var createCalls, queryCalls, submitCalls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		switch r.URL.Path {
		case "/seedance/v3/assets/create":
			call := createCalls.Add(1)
			assetType, _ := body["assetType"].(string)
			if call == 1 && assetType == "Image" {
				_, _ = w.Write([]byte(`{"code":0,"msg":"success","data":{"assetId":"asset-img-1","status":"Processing"}}`))
				return
			}
			if call == 2 && assetType == "Video" {
				_, _ = w.Write([]byte(`{"code":0,"msg":"success","data":{"assetId":"asset-vid-1","status":"Processing"}}`))
				return
			}
			t.Errorf("unexpected asset create #%d: %#v", call, body)
		case "/seedance/v3/assets/query":
			q := queryCalls.Add(1)
			id, _ := body["assetId"].(string)
			status := "Active"
			if q == 1 {
				status = "Processing"
			}
			_, _ = w.Write([]byte(`{"code":0,"msg":"success","data":{"assetId":"` + id + `","status":"` + status + `"}}`))
		case "/seedance/v3/contents/generations/tasks":
			submitCalls.Add(1)
			content, _ := body["content"].([]any)
			if len(content) != 3 {
				t.Errorf("unexpected content len: %#v", body)
			}
			imgItem, _ := content[1].(map[string]any)
			imgURL, _ := imgItem["image_url"].(map[string]any)
			vidItem, _ := content[2].(map[string]any)
			vidURL, _ := vidItem["video_url"].(map[string]any)
			if imgURL["url"] != "asset://asset-img-1" || vidURL["url"] != "asset://asset-vid-1" {
				t.Errorf("expected asset:// references, got img=%v vid=%v", imgURL["url"], vidURL["url"])
			}
			_, _ = w.Write([]byte(`{"id":"cgt-seedance-1"}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	cfg := videoSubmissionTestConfig(t, server)
	rawBody, _ := json.Marshal(map[string]any{
		"prompt":        "参考图片1和视频1跳舞",
		"model":         "doubao-seedance-2.0-mini",
		"duration":      5,
		"aspect_ratio":  "9:16",
		"resolution":    "720P",
		"ref_mode":      "omni",
		"images":        []string{"https://cdn.example/person.png"},
		"videos":        []string{"https://cdn.example/dance.mp4"},
		"customBaseUrl": server.URL,
		"customApiKey":  "secret",
		"clientTaskId":  "seedance-asset-ok",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/generate/video", strings.NewReader(string(rawBody)))
	req = req.WithContext(httpx.WithWorkspace(req.Context(), "local"))
	req.Header.Set("x-idempotency-key", "seedance-asset-ok")
	res := httptest.NewRecorder()
	Video(cfg).ServeHTTP(res, req)
	if res.Code != http.StatusOK || !strings.Contains(res.Body.String(), `"taskId":"cgt-seedance-1"`) {
		t.Fatalf("expected accepted task, got %d %s", res.Code, res.Body.String())
	}
	if createCalls.Load() != 2 || queryCalls.Load() < 2 || submitCalls.Load() != 1 {
		t.Fatalf("unexpected calls create=%d query=%d submit=%d", createCalls.Load(), queryCalls.Load(), submitCalls.Load())
	}
}

func TestSeedanceRejectsWhenAssetCheckFailsSensitiveContent(t *testing.T) {
	seedanceAssetCache = sync.Map{}
	prevPoll := seedanceAssetPollWait
	seedanceAssetPollWait = 5 * time.Millisecond
	t.Cleanup(func() { seedanceAssetPollWait = prevPoll })

	var submitCalls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/seedance/v3/assets/create":
			_, _ = w.Write([]byte(`{"code":0,"msg":"success","data":{"assetId":"asset-bad-vid","status":"Processing"}}`))
		case "/seedance/v3/assets/query":
			_, _ = w.Write([]byte(`{"code":1501,"msg":"Input material may contain sensitive content: videoUrls[0]. Please replace the material and try again | 用户输入的素材可能包含敏感内容：videoUrls[0]，请更换素材后重试","data":{"assetId":"asset-bad-vid","status":"Failed"}}`))
		case "/seedance/v3/contents/generations/tasks":
			submitCalls.Add(1)
			_, _ = w.Write([]byte(`{"id":"should-not-run"}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	cfg := videoSubmissionTestConfig(t, server)
	rawBody, _ := json.Marshal(map[string]any{
		"prompt":        "参考视频1动作",
		"model":         "doubao-seedance-2.0-mini",
		"duration":      5,
		"aspect_ratio":  "9:16",
		"resolution":    "720P",
		"ref_mode":      "omni",
		"videos":        []string{"https://cdn.example/sensitive.mp4"},
		"customBaseUrl": server.URL,
		"customApiKey":  "secret",
		"clientTaskId":  "seedance-asset-rejected",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/generate/video", strings.NewReader(string(rawBody)))
	req = req.WithContext(httpx.WithWorkspace(req.Context(), "local"))
	req.Header.Set("x-idempotency-key", "seedance-asset-rejected")
	res := httptest.NewRecorder()
	Video(cfg).ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest || submitCalls.Load() != 0 {
		t.Fatalf("expected rejection before submit, got %d submitCalls=%d body=%s", res.Code, submitCalls.Load(), res.Body.String())
	}
	if !strings.Contains(res.Body.String(), "参考视频未通过安全检测") {
		t.Fatalf("expected humanized sensitive material message, got %s", res.Body.String())
	}
	if got := gateway.PresentVideoError(`{"code":"1501","message":"Input material may contain sensitive content: videoUrls[0]. Please replace the material and try again | 用户输入的素材可能包含敏感内容：videoUrls[0]，请更换素材后重试"}`); !strings.Contains(got, "参考视频未通过安全检测") {
		t.Fatalf("unexpected formatted error: %s", got)
	}
}

func TestSeedancePrecheckValidatesAndCachesAssets(t *testing.T) {
	seedanceAssetCache = sync.Map{}
	prevPoll := seedanceAssetPollWait
	seedanceAssetPollWait = 5 * time.Millisecond
	t.Cleanup(func() { seedanceAssetPollWait = prevPoll })

	var createCalls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/seedance/v3/assets/create":
			call := createCalls.Add(1)
			if call == 1 {
				_, _ = w.Write([]byte(`{"code":0,"msg":"success","data":{"assetId":"precheck-vid-1","status":"Active"}}`))
				return
			}
			_, _ = w.Write([]byte(`{"code":1501,"msg":"Input material may contain sensitive content: imageUrls[0]","data":{"status":"Failed"}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	cfg := videoSubmissionTestConfig(t, server)
	rawBody, _ := json.Marshal(map[string]any{
		"items": []map[string]any{
			{"url": "https://cdn.example/depth-action.mp4", "mediaType": "depth-video"},
			{"url": "https://cdn.example/bad-persona.png", "mediaType": "image"},
		},
		"customBaseUrl": server.URL,
		"customApiKey":  "secret",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/generate/seedance/precheck", strings.NewReader(string(rawBody)))
	req = req.WithContext(httpx.WithWorkspace(req.Context(), "local"))
	res := httptest.NewRecorder()
	SeedancePrecheck(cfg).ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d %s", res.Code, res.Body.String())
	}
	var parsed struct {
		Success bool                         `json:"success"`
		Results []seedancePrecheckResultItem `json:"results"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &parsed); err != nil {
		t.Fatal(err)
	}
	if !parsed.Success || len(parsed.Results) != 2 {
		t.Fatalf("unexpected precheck response: %#v", parsed)
	}
	if parsed.Results[0].Status != "passed" || parsed.Results[0].AssetURI != "asset://precheck-vid-1" {
		t.Fatalf("expected first item passed, got %#v", parsed.Results[0])
	}
	if parsed.Results[1].Status != "rejected" || !strings.Contains(parsed.Results[1].Error, "参考图片未通过安全检测") {
		t.Fatalf("expected second item rejected, got %#v", parsed.Results[1])
	}
	if cached := loadSeedanceCachedURI(seedanceAssetScope{base: server.URL, apiKey: "secret", model: "doubao-seedance-2.0-mini", workspace: "local"}, "Video", "https://cdn.example/depth-action.mp4"); cached != "asset://precheck-vid-1" {
		t.Fatalf("expected cached asset URI, got %q", cached)
	}
	if msg := validateSeedanceVideoDuration(1.2); !strings.Contains(msg, "2 ~ 30 秒") {
		t.Fatalf("expected duration error for 1.2s, got %q", msg)
	}
	if msg := validateSeedanceVideoDuration(8.5); msg != "" {
		t.Fatalf("expected valid duration for 8.5s, got %q", msg)
	}
}
