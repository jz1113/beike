package sales

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/submission"
)

func TestNewPersonaJobRequiresPromptOrAnalysisBeforeQueueing(t *testing.T) {
	cfg, db := setupAssetViewJobs(t)
	body := assetViewJobRequest{
		Key: "persona-without-analysis", Kind: "persona",
		Data:       map[string]any{"name": "男1", "avatarUrl": "/reference.jpg"},
		Generation: map[string]any{"model": "image-model", "referenceImageUrl": "/reference.jpg"},
	}
	_, err := prepareAssetViewJob(t.Context(), cfg, db, "mine", body)
	if failure, ok := err.(assetViewJobClientError); !ok || failure.status != 400 || !strings.Contains(failure.message, "反推") {
		t.Fatalf("missing analysis should stop the job: %v", err)
	}
}

func TestAssetCreationPersistsPersonaStripOrIndependentSceneAndViews(t *testing.T) {
	for _, kind := range []string{"persona", "scene"} {
		t.Run(kind, func(t *testing.T) {
			cfg, db := setupAssetViewJobs(t)
			reference := "data:image/png;base64," + base64.StdEncoding.EncodeToString(assetGridFixture(t, 900, 1200))
			main := "data:image/png;base64," + base64.StdEncoding.EncodeToString(assetGridFixture(t, 768, 1024))
			mainJPEG, err := assetCreationJPEG(t.Context(), assetGridFixture(t, 768, 1024))
			if err != nil {
				t.Fatal(err)
			}
			mainReference := "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(mainJPEG)
			grid := "data:image/png;base64," + base64.StdEncoding.EncodeToString(assetGridFixture(t, 1200, 900))
			if kind == "persona" {
				grid = "data:image/png;base64," + base64.StdEncoding.EncodeToString(assetGridFixture(t, 1600, 900))
			}
			drawing := "参考人物留短发，穿蓝色衬衫，iPhone 前置自拍，自然光照亮左侧面颊。"
			if kind == "scene" {
				drawing = "一间重新设计的温暖客厅，左侧落地窗，右侧浅色沙发与圆木茶几，真实摄影，自然柔光。"
			}
			var textCalls, imageCalls atomic.Int32
			previous := gateway.ModelHTTP
			gateway.ModelHTTP = func() *http.Client {
				return &http.Client{Transport: gridFetchTransport(func(request *http.Request) (*http.Response, error) {
					var payload map[string]any
					if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
						t.Error(err)
					}
					var response any
					if strings.Contains(request.URL.Path, "chat/completions") {
						textCalls.Add(1)
						if request.Header.Get("Authorization") != "Bearer text-secret" || payload["model"] != "vision-model" {
							t.Errorf("wrong vision route: %s %+v", request.URL, payload)
						}
						content, _ := json.Marshal(payload["messages"])
						if !bytes.Contains(content, []byte(reference)) {
							t.Error("vision model did not receive source")
						}
						result, _ := json.Marshal(map[string]any{"prompt": drawing})
						response = map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": string(result)}, "finish_reason": "stop"}}}
					} else {
						call := imageCalls.Add(1)
						images, _ := payload["images"].([]any)
						if kind == "persona" {
							if len(images) != 1 || images[0] != reference || !strings.Contains(assetCreationText(payload["prompt"]), drawing) || !strings.Contains(assetCreationText(payload["prompt"]), personaGridPrompt) {
								t.Error("strip must use the source, its description and the saved layout")
							}
							response = map[string]any{"image": grid}
						} else if call == 1 {
							if payload["prompt"] != drawing || len(images) != 0 {
								t.Errorf("main is not standalone: %+v", payload)
							}
							response = map[string]any{"image": main}
						} else {
							if len(images) != 1 || images[0] != mainReference {
								t.Errorf("grid referenced original source: %+v", images)
							}
							response = map[string]any{"image": grid}
						}
					}
					response.(map[string]any)["usage"] = map[string]any{"prompt_tokens": 11, "completion_tokens": 7, "total_tokens": 18}
					raw, _ := json.Marshal(response)
					return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(bytes.NewReader(raw))}, nil
				})}
			}
			t.Cleanup(func() { gateway.ModelHTTP = previous })
			dimensions, _ := json.Marshal(map[string]any{"assetCreation": map[string]any{"referenceImageUrl": reference}})
			data := map[string]any{"title": "新空间", "coverUrl": "", "dimensions": string(dimensions), "sourceImages": "[]"}
			if kind == "persona" {
				data = map[string]any{"name": "新人物", "avatarUrl": "", "dimensions": string(dimensions), "sourceImages": "[]"}
			}
			body := map[string]any{"key": "creation-" + kind, "kind": kind, "data": data, "generation": assetCreationTestGeneration(reference)}
			first := postAssetViewJob(t, cfg, body)
			job := awaitAssetViewJob(t, cfg, db, first.ID)
			wantCalls := int32(2)
			if kind == "persona" {
				wantCalls = 1
				if len(job.Images) != 1 || job.Creation == nil || job.Creation.ImageURL != job.Images["sheet"] {
					t.Fatal("persona sheet must be saved as one image")
				}
			} else if job.Creation == nil || !strings.HasPrefix(job.Creation.ImageURL, "/storage/mine/azhuo/refs/sales-main/scene/") {
				t.Fatal("missing separate scene main")
			}
			if job.Status != "completed" || job.Creation == nil || job.Creation.Prompt != drawing || textCalls.Load() != 1 || imageCalls.Load() != wantCalls {
				t.Fatalf("creation failed: %+v text=%d image=%d", job, textCalls.Load(), imageCalls.Load())
			}
			encoded, _ := json.Marshal(job)
			var receipt map[string]any
			_ = json.Unmarshal(encoded, &receipt)
			entries, _ := receipt["usageReceipts"].([]any)
			if len(entries) != int(wantCalls)+1 {
				t.Fatalf("missing durable stage usage: %s", encoded)
			}
			for _, entry := range entries {
				row := entry.(map[string]any)
				if row["success"] != true || row["recordId"] == "" || row["usage"].(map[string]any)["totalTokens"] != float64(18) {
					t.Fatal("invalid stage usage", row)
				}
			}
			table, coverField, viewField := assetViewJobAssetTable(kind)
			var savedDimensions, sources, cover, generation string
			if err := db.QueryRow(`SELECT "dimensions","sourceImages","`+coverField+`" FROM "`+table+`" WHERE "id"=?`, job.AssetID).Scan(&savedDimensions, &sources, &cover); err != nil {
				t.Fatal(err)
			}
			var saved map[string]any
			_ = json.Unmarshal([]byte(savedDimensions), &saved)
			views, _ := saved[viewField].(map[string]any)
			if views["main"] != job.Creation.ImageURL || cover != job.Creation.ImageURL || strings.Contains(sources, reference) || !strings.Contains(savedDimensions, drawing) {
				t.Fatal("invalid asset outputs", savedDimensions)
			}
			if err := saveAssetViewJobImages(t.Context(), db, "mine", job); err != nil {
				t.Fatal("completed save was not idempotent", err)
			}
			if err := db.QueryRow(`SELECT "generationJson" FROM "SalesAssetViewJob" WHERE "id"=?`, job.ID).Scan(&generation); err != nil {
				t.Fatal(err)
			}
			if strings.Contains(generation, "text-secret") || strings.Contains(generation, "image-secret") {
				t.Fatal("credentials persisted")
			}
			postAssetViewJob(t, cfg, body)
			if textCalls.Load() != 1 || imageCalls.Load() != wantCalls {
				t.Fatal("replay repeated paid generation")
			}
		})
	}
}

func TestAssetCreationUsesSavedDesignSnapshotAndClassificationAndRejectsTruncation(t *testing.T) {
	cfg, db := setupAssetViewJobs(t)
	reference := "data:image/png;base64," + base64.StdEncoding.EncodeToString(assetGridFixture(t, 900, 1200))
	dimensions, _ := json.Marshal(map[string]any{"audience": "child_male", "assetCreation": map[string]any{"referenceImageUrl": reference}})
	data := map[string]any{"name": "人物", "avatarUrl": "", "dimensions": string(dimensions)}
	generation := assetCreationTestGeneration(reference)
	if err := prepareAssetCreation(t.Context(), cfg, "mine", "persona", generation, data); err != nil {
		t.Fatal(err)
	}
	state := assetCreationSettings(generation)
	snapshot := assetCreationText(state["designPrompt"])
	if snapshot == "" || assetCreationText(state["designPromptVersion"]) == "" {
		t.Fatal("missing design snapshot")
	}
	if _, err := db.Exec(`UPDATE "SalesPromptOverride" SET "prompt"='later edited design' WHERE "workspaceId"='mine' AND "promptId"='persona-design'`); err != nil {
		t.Fatal(err)
	}
	previous := gateway.ModelHTTP
	gateway.ModelHTTP = func() *http.Client {
		return &http.Client{Transport: gridFetchTransport(func(request *http.Request) (*http.Response, error) {
			var payload map[string]any
			if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
				t.Fatal(err)
			}
			messages := payload["messages"].([]any)
			if messages[0].(map[string]any)["content"] != snapshot {
				t.Error("queued design rules were changed")
			}
			content, _ := json.Marshal(messages[1])
			if !strings.Contains(string(content), "男童") {
				t.Error("person classification omitted", string(content))
			}
			result, _ := json.Marshal(map[string]any{"prompt": "一个男童的自然正面肖像，适龄服装，清晰五官，自然皮肤纹理。"})
			raw, _ := json.Marshal(map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": string(result)}, "finish_reason": "length"}}})
			return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(bytes.NewReader(raw))}, nil
		})}
	}
	t.Cleanup(func() { gateway.ModelHTTP = previous })
	r, _ := http.NewRequest(http.MethodPost, "http://localhost/api/sales/asset-view-jobs", nil)
	r = r.WithContext(httpx.WithWorkspace(r.Context(), "mine"))
	if _, err := analyzeAssetCreation(t.Context(), cfg, r, "persona", state, data, func() error { return nil }, nil); err == nil || !strings.Contains(err.Error(), "未完整") {
		t.Fatal("accepted truncated design", err)
	}
	if facts := assetCreationFacts("persona", map[string]any{"dimensions": `{"audience":"senior_female"}`}); facts["audience"] != "老年女" {
		t.Fatal("senior classification omitted", facts)
	}
}

func TestAssetCreationCannotReplaceNewerReference(t *testing.T) {
	cfg, db := setupAssetViewJobs(t)
	data := map[string]any{"title": "空间", "coverUrl": "", "dimensions": `{"assetCreation":{"referenceImageUrl":"/old-reference.jpg"},"sceneViews":{"main":""}}`}
	job, err := prepareAssetViewJob(t.Context(), cfg, db, "mine", assetViewJobRequest{Key: "stale-creation", Kind: "scene", Data: data, Generation: assetCreationTestGeneration("/old-reference.jpg")})
	if err != nil {
		t.Fatal(err)
	}
	state := assetCreationSettings(job.generation)
	state["prompt"], state["imageUrl"] = "新空间绘图提示词", "/generated-main.jpg"
	if _, err := db.Exec(`UPDATE "SceneAsset" SET "dimensions"='{"assetCreation":{"referenceImageUrl":"/new-reference.jpg"},"sceneViews":{"main":""}}' WHERE "id"=?`, job.AssetID); err != nil {
		t.Fatal(err)
	}
	if err := saveAssetCreationMain(t.Context(), db, "mine", job); err == nil {
		t.Fatal("overwrote newer source")
	}
	for _, view := range assetGridViews["scene"] {
		job.Images[view] = "/generated-" + view + ".jpg"
	}
	if err := saveAssetViewJobImages(t.Context(), db, "mine", job); err == nil {
		t.Fatal("attached generated views to newer source")
	}
}

func assetCreationTestGeneration(reference string) map[string]any {
	return map[string]any{"model": "gpt-image-1", "customBaseUrl": "https://images.example.com", "customApiKey": "image-secret", "customProtocol": "template", "requestTemplate": map[string]any{
		"submit": map[string]any{"url": "https://images.example.com/generate", "body": `{"prompt":"{{prompt}}","model":"{{model}}","images":{{images}}}`}, "result": map[string]any{"imageUrlPath": "image"},
	}, "assetCreation": map[string]any{"referenceImageUrl": reference, "analysisModel": "vision-model", "analysisModelSelection": "vision-route", "customBaseUrl": "https://vision.example.com", "customApiKey": "text-secret", "textProtocol": "openai"}}
}

func TestAssetCreationCropRetryReusesPromptAndBothPaidImages(t *testing.T) {
	cfg, db := setupAssetViewJobs(t)
	main := "data:image/png;base64," + base64.StdEncoding.EncodeToString(assetGridFixture(t, 768, 1024))
	reference := "data:image/png;base64," + base64.StdEncoding.EncodeToString(assetGridFixture(t, 900, 1200))
	grid := "/storage/mine/azhuo/refs/creation-grid.png"
	drawing := "干净明亮的原创空间，左侧自然光照亮简洁的木质家具，真实摄影，合理透视。"
	var calls atomic.Int32
	previous := gateway.ModelHTTP
	gateway.ModelHTTP = func() *http.Client {
		return &http.Client{Transport: gridFetchTransport(func(request *http.Request) (*http.Response, error) {
			call := calls.Add(1)
			var response any
			if call == 1 {
				result, _ := json.Marshal(map[string]any{"prompt": drawing})
				response = map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": string(result)}, "finish_reason": "stop"}}}
			} else if call == 2 {
				response = map[string]any{"image": main}
			} else {
				response = map[string]any{"image": grid}
			}
			response.(map[string]any)["usage"] = map[string]any{"total_tokens": 18}
			raw, _ := json.Marshal(response)
			return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(bytes.NewReader(raw))}, nil
		})}
	}
	t.Cleanup(func() { gateway.ModelHTTP = previous })
	dimensions, _ := json.Marshal(map[string]any{"assetCreation": map[string]any{"referenceImageUrl": reference}})
	body := map[string]any{"key": "creation-crop-retry", "kind": "scene", "data": map[string]any{"title": "新空间", "coverUrl": "", "dimensions": string(dimensions)}, "generation": assetCreationTestGeneration(reference)}
	first := postAssetViewJob(t, cfg, body)
	failed := awaitAssetViewJob(t, cfg, db, first.ID)
	if failed.Status != "failed" || failed.Creation == nil || !strings.HasPrefix(failed.Creation.ImageURL, "/storage/mine/azhuo/refs/sales-main/scene/") || failed.Creation.Prompt != drawing {
		t.Fatal("creation checkpoint lost", failed)
	}
	if len(failed.UsageReceipts) != 3 {
		t.Fatal("crop failure lost paid stages", failed.UsageReceipts)
	}
	for _, receipt := range failed.UsageReceipts {
		if !receipt.Success || receipt.Usage["totalTokens"] != float64(18) {
			t.Fatal("paid image miscounted after crop failure", receipt)
		}
	}
	var savedDimensions, savedCover, savedSources string
	if err := db.QueryRow(`SELECT "dimensions","coverUrl","sourceImages" FROM "SceneAsset" WHERE "id"=?`, failed.AssetID).Scan(&savedDimensions, &savedCover, &savedSources); err != nil {
		t.Fatal(err)
	}
	if savedCover != failed.Creation.ImageURL || !strings.Contains(savedDimensions, drawing) || strings.Contains(savedSources, reference) {
		t.Fatal("main and prompt not durable after grid failure")
	}
	file := filepath.Join(os.Getenv("AZHUO_CACHE_DIR"), "mine", "azhuo", "refs", "creation-grid.png")
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, assetGridFixture(t, 1200, 900), 0o644); err != nil {
		t.Fatal(err)
	}
	postAssetViewJob(t, cfg, map[string]any{"key": first.Key, "kind": "scene", "assetId": first.AssetID, "data": map[string]any{}, "generation": map[string]any{"model": "gpt-image-1"}})
	complete := awaitAssetViewJob(t, cfg, db, first.ID)
	if complete.Status != "completed" || calls.Load() != 3 {
		t.Fatal("retry repeated creation", complete, calls.Load())
	}
}

func TestAssetCreationImageStoragePreservesResolutionAndJPEGAndScopesWorkspace(t *testing.T) {
	t.Setenv("AZHUO_CACHE_DIR", t.TempDir())
	canvas := image.NewNRGBA(image.Rect(0, 0, 301, 401))
	canvas.SetNRGBA(150, 200, color.NRGBA{R: 255, A: 128})
	var pngBuffer bytes.Buffer
	if err := png.Encode(&pngBuffer, canvas); err != nil {
		t.Fatal(err)
	}
	source := "data:image/png;base64," + base64.StdEncoding.EncodeToString(pngBuffer.Bytes())
	stored, err := storeAssetCreationImage(t.Context(), source, "persona", "mine")
	if err != nil {
		t.Fatal(err)
	}
	data, err := readAssetGrid(t.Context(), stored, "mine")
	if err != nil {
		t.Fatal(err)
	}
	decoded, kind, err := image.Decode(bytes.NewReader(data))
	if err != nil || kind != "jpeg" || decoded.Bounds().Dx() != 301 || decoded.Bounds().Dy() != 401 {
		t.Fatal("resolution/format changed", kind, err)
	}
	r, g, b, _ := decoded.At(0, 0).RGBA()
	if r < 65000 || g < 65000 || b < 65000 {
		t.Fatal("transparent pixels not composited white", r, g, b)
	}
	if replay, err := storeAssetCreationImage(t.Context(), source, "persona", "mine"); err != nil || replay != stored {
		t.Fatal("non-deterministic storage", replay, err)
	}
	other, err := storeAssetCreationImage(t.Context(), source, "persona", "other")
	if err != nil || other == stored || !strings.HasPrefix(other, "/storage/other/") {
		t.Fatal("workspace storage not isolated", other, err)
	}
	if _, err := storeAssetCreationImage(t.Context(), stored, "persona", "other"); err == nil {
		t.Fatal("cross-workspace source read allowed")
	}
	var jpegBuffer bytes.Buffer
	if err := jpeg.Encode(&jpegBuffer, decoded, &jpeg.Options{Quality: 87}); err != nil {
		t.Fatal(err)
	}
	jpegSource := "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(jpegBuffer.Bytes())
	jpegStored, err := storeAssetCreationImage(t.Context(), jpegSource, "scene", "mine")
	if err != nil {
		t.Fatal(err)
	}
	jpegBytes, err := readAssetGrid(t.Context(), jpegStored, "mine")
	if err != nil || !bytes.Equal(jpegBytes, jpegBuffer.Bytes()) {
		t.Fatal("original JPEG was recompressed", err)
	}
	if _, err := assetCreationJPEG(t.Context(), []byte("not an image")); err == nil {
		t.Fatal("invalid image accepted")
	}
	cancelled, cancel := context.WithCancel(t.Context())
	cancel()
	if _, err := assetCreationJPEG(cancelled, pngBuffer.Bytes()); err == nil {
		t.Fatal("cancelled storage continued")
	}
}

func TestAssetCreationStorageRetryKeepsProviderResultAndDoesNotGenerateAgain(t *testing.T) {
	cfg, db := setupAssetViewJobs(t)
	reference := "data:image/png;base64," + base64.StdEncoding.EncodeToString(assetGridFixture(t, 900, 1200))
	providerResult := "/storage/mine/azhuo/refs/main-provider.png"
	grid := "data:image/png;base64," + base64.StdEncoding.EncodeToString(assetGridFixture(t, 1200, 900))
	var calls atomic.Int32
	previous := gateway.ModelHTTP
	gateway.ModelHTTP = func() *http.Client {
		return &http.Client{Transport: gridFetchTransport(func(request *http.Request) (*http.Response, error) {
			call := calls.Add(1)
			var response any
			if call == 1 {
				result, _ := json.Marshal(map[string]any{"prompt": "一间独立设计的简洁客厅，真实自然光，明亮整洁，合理透视。"})
				response = map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": string(result)}, "finish_reason": "stop"}}}
			} else if call == 2 {
				response = map[string]any{"image": providerResult}
			} else {
				response = map[string]any{"image": grid}
			}
			raw, _ := json.Marshal(response)
			return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(bytes.NewReader(raw))}, nil
		})}
	}
	t.Cleanup(func() { gateway.ModelHTTP = previous })
	dimensions, _ := json.Marshal(map[string]any{"assetCreation": map[string]any{"referenceImageUrl": reference}})
	body := map[string]any{"key": "main-storage-retry", "kind": "scene", "data": map[string]any{"title": "空间", "coverUrl": "", "dimensions": string(dimensions)}, "generation": assetCreationTestGeneration(reference)}
	first := postAssetViewJob(t, cfg, body)
	failed := awaitAssetViewJob(t, cfg, db, first.ID)
	if failed.Status != "failed" || failed.Creation == nil || failed.Creation.ImageURL != "" || assetCreationText(assetCreationSettings(failed.generation)["resultUrl"]) != providerResult || calls.Load() != 2 {
		t.Fatal("provider checkpoint lost after storage failure", failed, calls.Load())
	}
	var public map[string]any
	rawPublic, _ := json.Marshal(failed)
	_ = json.Unmarshal(rawPublic, &public)
	if bytes.Contains(rawPublic, []byte(providerResult)) {
		t.Fatal("raw provider result leaked into public job metadata")
	}
	file := filepath.Join(os.Getenv("AZHUO_CACHE_DIR"), "mine", "azhuo", "refs", "main-provider.png")
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, assetGridFixture(t, 768, 1024), 0o644); err != nil {
		t.Fatal(err)
	}
	postAssetViewJob(t, cfg, map[string]any{"key": first.Key, "kind": "scene", "assetId": first.AssetID, "data": map[string]any{}, "generation": assetCreationTestGeneration(reference)})
	complete := awaitAssetViewJob(t, cfg, db, first.ID)
	if complete.Status != "completed" || complete.Creation == nil || !strings.HasPrefix(complete.Creation.ImageURL, "/storage/mine/azhuo/refs/sales-main/scene/") || calls.Load() != 3 {
		t.Fatal("storage retry repeated paid main generation", complete, calls.Load())
	}
	var cover string
	if err := db.QueryRow(`SELECT "coverUrl" FROM "SceneAsset" WHERE "id"=?`, complete.AssetID).Scan(&cover); err != nil || cover == providerResult || cover != complete.Creation.ImageURL {
		t.Fatal("provider URL persisted as main", cover, err)
	}
}

func TestAssetAnalysisUnknownContinuationDoesNotResubmit(t *testing.T) {
	cfg, db := setupAssetViewJobs(t)
	reference := "data:image/png;base64," + base64.StdEncoding.EncodeToString(assetGridFixture(t, 90, 120))
	var textCalls atomic.Int32
	old := gateway.ModelHTTP
	gateway.ModelHTTP = func() *http.Client {
		return &http.Client{Transport: gridFetchTransport(func(r *http.Request) (*http.Response, error) {
			if !strings.Contains(r.URL.Path, "chat/completions") {
				return nil, fmt.Errorf("unexpected image request")
			}
			textCalls.Add(1)
			return nil, fmt.Errorf("response lost after provider accepted and billed request")
		})}
	}
	t.Cleanup(func() { gateway.ModelHTTP = old })
	dims, _ := json.Marshal(map[string]any{"assetCreation": map[string]any{"referenceImageUrl": reference}})
	body := map[string]any{"key": "same-analysis-key", "kind": "scene", "data": map[string]any{"title": "scene", "coverUrl": "", "dimensions": string(dims)}, "generation": assetCreationTestGeneration(reference)}
	first := postAssetViewJob(t, cfg, body)
	failed := awaitAssetViewJob(t, cfg, db, first.ID)
	if failed.Status != "failed" || textCalls.Load() != 1 {
		t.Fatalf("first %#v calls=%d", failed, textCalls.Load())
	}
	second := postAssetViewJob(t, cfg, body)
	failed = awaitAssetViewJob(t, cfg, db, second.ID)
	if second.ID != first.ID || textCalls.Load() != 1 {
		t.Fatalf("continuation resubmitted: %s %s calls=%d", first.ID, second.ID, textCalls.Load())
	}
	t.Logf("unknown analysis remained single submission: calls=%d error=%s", textCalls.Load(), failed.Error)
}

func TestAssetAnalysisStageRecovery(t *testing.T) {
	for _, scenario := range []string{"completed", "disconnect", "malformed", "partial", "server-error", "settlement-failure", "interrupted", "legacy", "preflight", "claim-failure", "concurrent", "read-failure", "invalid-receipt"} {
		t.Run(scenario, func(t *testing.T) {
			cfg, db := setupAssetViewJobs(t)
			reference := "data:image/png;base64," + base64.StdEncoding.EncodeToString(assetGridFixture(t, 90, 120))
			job := &assetViewJob{ID: "stage-job", Kind: "scene", generation: assetCreationTestGeneration(reference), assetData: map[string]any{"title": "scene"}}
			state := assetCreationSettings(job.generation)
			state["analysisReceiptVersion"] = 1
			state["designPrompt"] = "Return a scene prompt"
			request := httptest.NewRequest("POST", "/", nil)
			request = request.WithContext(httpx.WithWorkspace(context.Background(), "mine"))
			var calls atomic.Int32
			old := gateway.ModelHTTP
			gateway.ModelHTTP = func() *http.Client {
				return &http.Client{Transport: gridFetchTransport(func(r *http.Request) (*http.Response, error) {
					calls.Add(1)
					if scenario == "disconnect" {
						return nil, fmt.Errorf("response lost")
					}
					raw := `{"choices":[{"message":{"content":"{\"prompt\":\"durable scene prompt\"}"},"finish_reason":"stop"}]}`
					status := 200
					switch scenario {
					case "malformed":
						raw = `{"choices":[]}`
					case "partial":
						raw = `{"choices":[{"finish_reason":"length"}]}`
					case "server-error":
						status = 503
					}
					return &http.Response{StatusCode: status, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(raw))}, nil
				})}
			}
			t.Cleanup(func() { gateway.ModelHTTP = old })
			switch scenario {
			case "legacy":
				delete(state, "analysisReceiptVersion")
			case "preflight":
				state["referenceImageUrl"] = "data:text/plain;base64,bm90IGFuIGltYWdl"
			case "interrupted":
				if _, owned, err := submission.Claim(t.Context(), cfg.SQLiteFile(), "mine", assetAnalysisStage, job.ID, submission.Hash(job.ID)); err != nil || !owned {
					t.Fatal(owned, err)
				}
			case "settlement-failure":
				if _, err := db.Exec(`CREATE TRIGGER fail_stage_settlement BEFORE UPDATE ON "GenerationSubmission" BEGIN SELECT RAISE(FAIL,'disk full'); END`); err != nil {
					t.Fatal(err)
				}
			case "read-failure":
				if _, err := db.Exec(`ALTER TABLE "GenerationSubmission" RENAME TO "UnavailableSubmission"`); err != nil {
					t.Fatal(err)
				}
			case "invalid-receipt":
				receipt, owned, err := submission.Claim(t.Context(), cfg.SQLiteFile(), "mine", assetAnalysisStage, job.ID, submission.Hash(job.ID))
				if err != nil || !owned {
					t.Fatal(owned, err)
				}
				if err := submission.Finish(t.Context(), cfg.SQLiteFile(), receipt, 200, map[string]any{"success": true, "prompt": ""}); err != nil {
					t.Fatal(err)
				}
			case "claim-failure":
				if _, err := db.Exec(`CREATE TRIGGER fail_stage_claim BEFORE INSERT ON "GenerationSubmission" BEGIN SELECT RAISE(FAIL,'disk full'); END`); err != nil {
					t.Fatal(err)
				}
			}
			if scenario == "concurrent" {
				var workers sync.WaitGroup
				for i := 0; i < 12; i++ {
					// Workers/processes own independent task snapshots; only the durable stage is shared.
					worker := *job
					encoded, _ := json.Marshal(job.generation)
					worker.generation = nil
					if err := json.Unmarshal(encoded, &worker.generation); err != nil {
						t.Fatal(err)
					}
					workers.Go(func() { _, _ = recoverAssetAnalysis(t.Context(), cfg, request, &worker) })
				}
				workers.Wait()
			}
			for attempt := 0; attempt < 2; attempt++ {
				prompt, err := recoverAssetAnalysis(t.Context(), cfg, request, job)
				if scenario == "completed" || scenario == "concurrent" {
					if err != nil || prompt != "durable scene prompt" {
						t.Fatal(prompt, err)
					}
					// Simulate losing the job prompt write and credentials after restart.
					delete(state, "customApiKey")
					state["referenceImageUrl"] = "unavailable"
				} else if err == nil {
					t.Fatal("unconfirmed stage accepted", prompt)
				}
			}
			expected := int32(1)
			if scenario == "legacy" || scenario == "interrupted" || scenario == "preflight" || scenario == "claim-failure" || scenario == "read-failure" || scenario == "invalid-receipt" {
				expected = 0
			}
			if calls.Load() != expected {
				t.Fatalf("calls=%d want=%d", calls.Load(), expected)
			}
			if scenario == "preflight" {
				if _, err := submission.Read(t.Context(), cfg.SQLiteFile(), "mine", assetAnalysisStage, job.ID); err != submission.ErrNotFound {
					t.Fatal("preflight claimed stage", err)
				}
				state["referenceImageUrl"] = reference
				if prompt, err := recoverAssetAnalysis(t.Context(), cfg, request, job); err != nil || prompt != "durable scene prompt" || calls.Load() != 1 {
					t.Fatal("preflight correction failed", prompt, err, calls.Load())
				}

			}
			if scenario == "completed" {
				if _, err := submission.Read(t.Context(), cfg.SQLiteFile(), "other", assetAnalysisStage, job.ID); err != submission.ErrNotFound {
					t.Fatal("receipt leaked workspace", err)
				}
			}
		})
	}
}

func TestAssetAnalysisPaidFailureRetainsUsageAcrossSameKeyRecovery(t *testing.T) {
	cfg, db := setupAssetViewJobs(t)
	reference := "data:image/png;base64," + base64.StdEncoding.EncodeToString(assetGridFixture(t, 90, 120))
	var calls atomic.Int32
	old := gateway.ModelHTTP
	gateway.ModelHTTP = func() *http.Client {
		return &http.Client{Transport: gridFetchTransport(func(r *http.Request) (*http.Response, error) {
			calls.Add(1)
			return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"choices":[],"usage":{"input_tokens":11,"output_tokens":7}}`))}, nil
		})}
	}
	t.Cleanup(func() { gateway.ModelHTTP = old })
	dims, _ := json.Marshal(map[string]any{"assetCreation": map[string]any{"referenceImageUrl": reference}})
	generation := assetCreationTestGeneration(reference)
	generation["usageScopes"] = map[string]any{"analysis": map[string]any{"workspaceId": strings.Repeat("a", 64), "channelId": strings.Repeat("b", 64), "mediaType": "vision", "epoch": "original-epoch"}}
	body := map[string]any{"key": "paid-analysis-failure", "kind": "scene", "data": map[string]any{"title": "scene", "coverUrl": "", "dimensions": string(dims)}, "generation": generation}
	first := postAssetViewJob(t, cfg, body)
	for attempt := 0; attempt < 2; attempt++ {
		if attempt > 0 {
			postAssetViewJob(t, cfg, map[string]any{"key": first.Key, "kind": "scene", "assetId": first.AssetID, "data": map[string]any{}, "generation": map[string]any{"model": "changed", "usageScopes": map[string]any{}}})
		}
		job := awaitAssetViewJob(t, cfg, db, first.ID)
		if job.Status != "failed" || len(job.UsageReceipts) != 1 || calls.Load() != 1 {
			t.Fatalf("receipt missing or resubmitted: %s entries=%d calls=%d", job.Status, len(job.UsageReceipts), calls.Load())
		}
		receipt := job.UsageReceipts[0]
		if receipt.Success || receipt.Stage != "analysis" || receipt.RecordID == "" || receipt.Usage["totalTokens"] != float64(18) || job.UsageScopes["analysis"].Epoch != "original-epoch" {
			t.Fatal("failed stage attribution lost", receipt, job.UsageScopes)
		}
	}
	receipt, err := submission.Read(t.Context(), cfg.SQLiteFile(), "mine", assetAnalysisStage, first.ID)
	if err != nil || gateway.NormalizeUsage(receipt.Body)["totalTokens"] != float64(18) {
		t.Fatal("durable analysis receipt lost usage", err)
	}
}

func TestAssetAnalysisUsageRecoversAfterPromptJobWriteFails(t *testing.T) {
	cfg, db := setupAssetViewJobs(t)
	reference := "data:image/png;base64," + base64.StdEncoding.EncodeToString(assetGridFixture(t, 90, 120))
	dims, _ := json.Marshal(map[string]any{"assetCreation": map[string]any{"referenceImageUrl": reference}})
	body := assetViewJobRequest{Key: "prompt-write-failure", Kind: "persona", Data: map[string]any{"name": "person", "avatarUrl": "", "dimensions": string(dims)}, Generation: assetCreationTestGeneration(reference)}
	job, err := prepareAssetViewJob(t.Context(), cfg, db, "mine", body)
	if err != nil {
		t.Fatal(err)
	}
	// Rehydrate the in-memory credential after preparing the durable safe snapshot.
	assetCreationSettings(job.generation)["customApiKey"] = "text-secret"
	var calls atomic.Int32
	old := gateway.ModelHTTP
	gateway.ModelHTTP = func() *http.Client {
		return &http.Client{Transport: gridFetchTransport(func(r *http.Request) (*http.Response, error) {
			calls.Add(1)
			return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"choices":[{"message":{"content":"{\"prompt\":\"durable person description\"}"},"finish_reason":"stop"}],"usage":{"total_tokens":19}}`))}, nil
		})}
	}
	t.Cleanup(func() { gateway.ModelHTTP = old })
	if _, err := db.Exec(`CREATE TRIGGER fail_prompt_write BEFORE UPDATE ON "SalesAssetViewJob" WHEN json_extract(NEW."generationJson",'$.assetCreation.prompt') IS NOT NULL BEGIN SELECT RAISE(FAIL,'disk full'); END`); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest("POST", "/", nil).WithContext(httpx.WithWorkspace(context.Background(), "mine"))
	advance := func(status string) error {
		job.Status = status
		return persistAssetViewJob(t.Context(), db, "mine", &job)
	}
	if err := runAssetCreation(t.Context(), cfg, db, request, &job, advance); err == nil {
		t.Fatal("expected prompt write failure")
	}
	if _, err := db.Exec(`DROP TRIGGER fail_prompt_write`); err != nil {
		t.Fatal(err)
	}
	job, err = loadAssetViewJob(t.Context(), db, "mine", "id", job.ID)
	if err != nil {
		t.Fatal(err)
	}
	if assetCreationText(assetCreationSettings(job.generation)["prompt"]) != "" {
		t.Fatal("prompt write unexpectedly succeeded")
	}
	if err := runAssetCreation(t.Context(), cfg, db, request, &job, advance); err != nil {
		t.Fatal(err)
	}
	restored, err := loadAssetViewJob(t.Context(), db, "mine", "id", job.ID)
	if err != nil || calls.Load() != 1 || len(restored.UsageReceipts) != 1 || restored.UsageReceipts[0].Usage["totalTokens"] != float64(19) {
		t.Fatal("usage or identity lost on recovery", err, calls.Load(), restored.UsageReceipts)
	}
}

func TestAssetViewPaidUnknownReplayKeepsStableGenerationInputs(t *testing.T) {
	cfg, db := setupAssetViewJobs(t)
	reference := "data:image/png;base64," + base64.StdEncoding.EncodeToString(assetGridFixture(t, 90, 120))
	generation := assetCreationTestGeneration(reference)
	delete(generation, "assetCreation")
	generation["referenceImageUrl"] = reference
	var calls atomic.Int32
	old := gateway.ModelHTTP
	gateway.ModelHTTP = func() *http.Client {
		return &http.Client{Transport: gridFetchTransport(func(r *http.Request) (*http.Response, error) {
			calls.Add(1)
			return &http.Response{StatusCode: 503, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"message":"unknown paid image","usage":{"total_tokens":23}}`))}, nil
		})}
	}
	t.Cleanup(func() { gateway.ModelHTTP = old })
	body := map[string]any{"key": "view-paid-unknown", "kind": "scene", "data": map[string]any{"title": "scene", "coverUrl": reference}, "generation": generation}
	first := postAssetViewJob(t, cfg, body)
	for attempt := 0; attempt < 2; attempt++ {
		if attempt > 0 {
			postAssetViewJob(t, cfg, body)
		}
		job := awaitAssetViewJob(t, cfg, db, first.ID)
		if calls.Load() != 1 || len(job.UsageReceipts) != 1 || job.UsageReceipts[0].Success || job.UsageReceipts[0].Usage["totalTokens"] != float64(23) {
			t.Fatal("paid unknown lost or repeated", job.Error, calls.Load(), job.UsageReceipts)
		}
		if strings.Contains(job.Error, "其他生图参数") {
			t.Fatal("receipt metadata changed original generation identity", job.Error)
		}
	}
}
