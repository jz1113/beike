package sales

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
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
	if _, err := analyzeAssetCreation(t.Context(), cfg, r, "persona", state, data); err == nil || !strings.Contains(err.Error(), "未完整") {
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
