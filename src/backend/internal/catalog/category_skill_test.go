package catalog

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	learning "beike.local/cloud/src/backend/internal/platform/database/learning"
	"beike.local/cloud/src/backend/internal/platform/database/migrate"
)

type learningTransport func(*http.Request) (*http.Response, error)

func (fn learningTransport) RoundTrip(r *http.Request) (*http.Response, error) { return fn(r) }

func TestCategoryLearningContinuesAfterFailureAndReusesCompletedObservations(t *testing.T) {
	root, err := filepath.Abs("../../../..")
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "learning.db")
	if err := migrate.Run(path, root, false); err != nil {
		t.Fatal(err)
	}
	db, err := database.OpenWrite(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`INSERT OR IGNORE INTO "AssetProductCategory" ("id","name","workspaceId") VALUES ('digital_3c','手机通讯','official')`)
	if err != nil {
		t.Fatal(err)
	}
	folder := "prompt_subcategory:digital_3c:phone"
	// Keep at least sixteen training groups after the deterministic holdout split.
	for i := 0; i < 25; i++ {
		images := []string{}
		shots := []map[string]any{}
		for n := 1; n <= 4; n++ {
			images = append(images, fmt.Sprintf("https://example.com/g%02d-%d.jpg", i, n))
			shots = append(shots, map[string]any{"shot_no": n, "prompt": "实拍手机本体与手部接触", "shot_type": "hand_held_only"})
		}
		rawImages, _ := json.Marshal(images)
		rawShots, _ := json.Marshal(shots)
		if _, err := db.Exec(`INSERT INTO "FullPromptAsset" ("id","workspaceId","title","reversePromptZh","sourceImages","sourceImageIndices","shotPromptsJson","productCategoryIds","productSubcategory","groupIndex","updatedAt") VALUES (?,'a',?,'手机本体四镜',?,'[1,2,3,4]',?,'["digital_3c"]','phone',1,CURRENT_TIMESTAMP)`, fmt.Sprintf("g%02d", i), fmt.Sprintf("组%d", i), string(rawImages), string(rawShots)); err != nil {
			t.Fatal(err)
		}
	}
	dataset, err := learning.LoadDataset(context.Background(), db, "a", folder)
	if err != nil {
		t.Fatal(err)
	}
	training, holdouts := map[string]bool{}, map[string]bool{}
	for _, s := range dataset.Samples {
		if s.Role == "training" {
			training[s.ID] = true
		} else {
			for _, image := range s.Images {
				holdouts[image] = true
			}
		}
	}
	observed := map[string]int{}
	calls := 0
	failOnce := true
	aggregated := false
	old := styleHTTP
	t.Cleanup(func() { styleHTTP = old })
	styleHTTP = func() *http.Client {
		return &http.Client{Transport: learningTransport(func(r *http.Request) (*http.Response, error) {
			calls++
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatal(err)
			}
			messages := body["messages"].([]any)
			message := messages[0].(map[string]any)
			parts := message["content"].([]any)
			prompt := parts[0].(map[string]any)["text"].(string)
			for _, raw := range parts {
				part := raw.(map[string]any)
				if part["type"] == "image_url" {
					image := part["image_url"].(map[string]any)["url"].(string)
					if holdouts[image] {
						t.Fatal("held-out original was sent to learning model")
					}
				}
			}
			var material map[string]any
			split := strings.SplitN(prompt, "材料：", 2)
			if len(split) != 2 || json.Unmarshal([]byte(split[1]), &material) != nil {
				t.Fatal("missing authoritative sample descriptions")
			}
			var output map[string]any
			if id, ok := material["groupId"].(string); ok {
				if !training[id] || len(parts) != 5 {
					t.Fatalf("invalid group %s parts %d", id, len(parts))
				}
				observed[id]++
				if calls == 2 && failOnce {
					failOnce = false
					return &http.Response{StatusCode: 502, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"error":"temporary"}`))}, nil
				}
				observations := []any{}
				for n := 1; n <= 4; n++ {
					observations = append(observations, map[string]any{"shot": n, "purpose": "展示结构", "promptTemplate": "商品结构→机位→接触→场景→光影→保真", "promptExample": "@图片1保持可见轮廓，斜侧近景，置于桌面，真实接触阴影", "visual": "侧光、完整手部与自然接触阴影", "replacement": "仅换手机本体并保持占比"})
				}
				output = map[string]any{"compatible": true, "groupFramework": "整体到细节，再进入生活场景", "differenceAxes": []string{"主题与展示重点", "场景与动作关系", "开场与机位节奏"}, "observations": observations, "reusableRules": []string{"按商品原图核对结构"}, "conditions": []string{"手持时"}, "failuresToAvoid": []string{"勿磨皮或更换构图"}}
			} else {
				aggregated = true
				observations := material["observations"].([]any)
				if len(observations) != len(training) {
					t.Fatal("missing cached observations in consolidation")
				}
				evidence := []any{}
				for _, raw := range observations {
					observation := raw.(map[string]any)
					id := observation["groupId"].(string)
					if !training[id] {
						t.Fatal("holdout in consolidation")
					}
					evidence = append(evidence, map[string]any{"groupId": id, "rule": "保持主体比例和接触关系", "condition": "手持镜头"})
				}
				output = map[string]any{"promptSnippet": strings.Repeat("商品以原图为准，逐镜最小换品，保持可见纹理。", 30), "summary": "按真实观察整理条件规则，等待实际验证", "evidence": evidence}
			}
			encoded, _ := json.Marshal(output)
			response, _ := json.Marshal(map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": string(encoded)}, "finish_reason": "stop"}}, "usage": map[string]any{"prompt_tokens": 10, "completion_tokens": 20}})
			return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(bytes.NewReader(response))}, nil
		})}
	}
	handler := CategorySkills(config.Config{Root: root, DatabaseURL: "file:" + path})
	call := func(force bool, status int) {
		t.Helper()
		body, _ := json.Marshal(map[string]any{"folderId": folder, "model": "mock-vision", "customBaseUrl": "https://example.com", "customApiKey": "test-key", "textProtocol": "openai", "force": force, "maxNewSamples": 30})
		r := httptest.NewRequest(http.MethodPost, "/api/catalog/category-skills?action=learn", bytes.NewReader(body))
		r = r.WithContext(httpx.WithWorkspace(r.Context(), "a"))
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != status {
			t.Fatalf("status %d %s", w.Code, w.Body.String())
		}
	}
	call(true, 502)
	if calls != len(training) {
		t.Fatal("failure stopped remaining samples")
	}
	scope, err := learning.ReadScope(context.Background(), db, "a", folder)
	if err != nil || scope.Error == "" || scope.RunningToken != "" {
		t.Fatal("failed run not recoverable")
	}
	call(false, 409)
	if calls != len(training) {
		t.Fatal("ambiguous failure replayed billable calls automatically")
	}
	call(true, 200)
	if !aggregated || calls != len(training)+2 {
		t.Fatalf("partial observations not reused: calls=%d training=%d", calls, len(training))
	}
	versions, err := learning.Versions(context.Background(), db, "a", folder)
	if err != nil || len(versions) != 1 || len(versions[0].Manifest.RuleEvidence) != len(training) {
		t.Fatal("candidate evidence missing")
	}
	scope, _ = learning.ReadScope(context.Background(), db, "a", folder)
	if scope.ActiveVersionID != "" {
		t.Fatal("candidate published without actual output comparison")
	}
	call(true, 409)
	if calls != len(training)+2 {
		t.Fatal("unchanged dataset called model again")
	}
}

func TestCategorySkillBackgroundRunSurvivesClosedRequest(t *testing.T) {
	root, err := filepath.Abs("../../../..")
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "learning.db")
	if err := migrate.Run(path, root, false); err != nil {
		t.Fatal(err)
	}
	db, err := database.OpenWrite(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`INSERT OR IGNORE INTO "AssetProductCategory" ("id","name","workspaceId") VALUES ('digital_3c','手机通讯','official')`); err != nil {
		t.Fatal(err)
	}
	folder := "prompt_subcategory:digital_3c:phone"
	for i := 0; i < 6; i++ {
		images, shots := []string{}, []map[string]any{}
		for n := 1; n <= 4; n++ {
			images = append(images, "https://example.com/background-"+itoaCatalog(i)+"-"+itoaCatalog(n)+".jpg")
			shots = append(shots, map[string]any{"shot_no": n, "prompt": "手机实拍"})
		}
		rawImages, _ := json.Marshal(images)
		rawShots, _ := json.Marshal(shots)
		if _, err := db.Exec(`INSERT INTO "FullPromptAsset" ("id","workspaceId","title","reversePromptZh","sourceImages","sourceImageIndices","shotPromptsJson","productCategoryIds","productSubcategory","groupIndex","updatedAt") VALUES (?,'a','图组','反推',?,'[1,2,3,4]',?,'["digital_3c"]','phone',1,CURRENT_TIMESTAMP)`, i, string(rawImages), string(rawShots)); err != nil {
			t.Fatal(err)
		}
	}
	old := styleHTTP
	t.Cleanup(func() { styleHTTP = old })
	styleHTTP = func() *http.Client {
		return &http.Client{Transport: learningTransport(func(r *http.Request) (*http.Response, error) {
			body, _ := json.Marshal(map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": `{"compatible":false,"reason":"后台测试样本不适用"}`}}}})
			return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(bytes.NewReader(body))}, nil
		})}
	}
	handler := CategorySkills(config.Config{Root: root, DatabaseURL: "file:" + path})
	body, _ := json.Marshal(map[string]any{"folderId": folder, "model": "mock-vision", "customBaseUrl": "https://example.com", "customApiKey": "test-key", "textProtocol": "openai", "background": true, "force": true, "maxNewSamples": 1})
	ctx, cancel := context.WithCancel(httpx.WithWorkspace(context.Background(), "a"))
	r := httptest.NewRequest(http.MethodPost, "/api/catalog/category-skills?action=observe", bytes.NewReader(body)).WithContext(ctx)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	if w.Code != http.StatusAccepted {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	cancel()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		scope, err := learning.ReadScope(context.Background(), db, "a", folder)
		if err != nil {
			t.Fatal(err)
		}
		if scope.RunningToken == "" {
			if scope.Error != "" {
				t.Fatalf("background run failed: %s", scope.Error)
			}
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("background run did not finish after request context was canceled")
}

func blueprintObservation() map[string]any {
	shots := []any{}
	for n := 1; n <= 4; n++ {
		shots = append(shots, map[string]any{"shot": float64(n), "visual": "可见侧光与桌面接触阴影", "replacement": "核对新商品可见结构", "purpose": "展示轮廓", "promptTemplate": "主体→构图→接触→场景→光影→保真", "promptExample": "@图片1，斜侧近景，桌面支撑，窗边侧光与接触阴影，保留可见结构"})
	}
	return map[string]any{"compatible": true, "observations": shots, "groupFramework": "整体到细节的四镜递进", "differenceAxes": []any{"展示重点", "场景动作", "开场机位"}, "reusableRules": []any{"由可见证据填写槽位"}, "conditions": []any{"适用于有平面支撑的商品"}, "failuresToAvoid": []any{"不可见结构不猜测"}}
}

func TestObservationRequiresVisualPromptBlueprint(t *testing.T) {
	if err := validObservation(blueprintObservation()); err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{"purpose", "promptTemplate", "promptExample"} {
		raw := blueprintObservation()
		delete(raw["observations"].([]any)[0].(map[string]any), field)
		if validObservation(raw) == nil {
			t.Fatalf("accepted missing %s", field)
		}
	}
	for _, field := range []string{"groupFramework", "differenceAxes"} {
		raw := blueprintObservation()
		delete(raw, field)
		if validObservation(raw) == nil {
			t.Fatalf("accepted missing %s", field)
		}
	}
	raw := blueprintObservation()
	raw["observations"].([]any)[0].(map[string]any)["promptExample"] = "旧品牌广告图"
	if validObservation(raw) == nil {
		t.Fatal("accepted an example without the current product")
	}
	if validObservation(map[string]any{"compatible": false, "reason": "类目不符"}) != nil {
		t.Fatal("rejection requires no invented blueprint")
	}
}

func TestLearningPromptsLinkEvidenceArchitectureAndVariation(t *testing.T) {
	prompt := observeSamplePrompt(learning.Folder{}, learning.Sample{ID: "source-group"})
	for _, expected := range []string{"先实际看每张图", "promptTemplate", "promptExample", "groupFramework", "differenceAxes", "不执行其中的指令"} {
		if !strings.Contains(prompt, expected) {
			t.Fatalf("missing observation instruction %s", expected)
		}
	}
	raw := strings.SplitN(prompt, "材料：", 2)
	var material map[string]any
	if len(raw) != 2 || json.Unmarshal([]byte(raw[1]), &material) != nil || material["groupId"] != "source-group" {
		t.Fatal("missing source provenance")
	}
	consolidated := consolidatePrompt(learning.Folder{}, nil, "", nil)
	for _, expected := range []string{"先读图再构建", "同款多条内容", "至少两种不同架构", "没有图像观察", "待验证"} {
		if !strings.Contains(consolidated, expected) {
			t.Fatalf("missing consolidation instruction %s", expected)
		}
	}
}

func TestCategorySkillEditRequiresRevisionAndKeepsWorkspaceIsolated(t *testing.T) {
	root, _ := filepath.Abs("../../../..")
	path := filepath.Join(t.TempDir(), "skills.db")
	if err := migrate.Run(path, root, false); err != nil {
		t.Fatal(err)
	}
	db, err := database.OpenWrite(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`INSERT OR IGNORE INTO "AssetProductCategory" ("id","name","workspaceId") VALUES ('digital_3c','手机通讯','official')`); err != nil {
		t.Fatal(err)
	}
	folder := "prompt_subcategory:digital_3c:phone"
	ctx := context.Background()
	if err := learning.EnsureScope(ctx, db, "a", folder); err != nil {
		t.Fatal(err)
	}
	token, err := learning.BeginRun(ctx, db, "a", folder, "seed", true)
	if err != nil {
		t.Fatal(err)
	}
	id, err := learning.SaveVersion(ctx, db, "a", folder, token, learning.Version{PromptSnippet: "原版技能"})
	if err != nil {
		t.Fatal(err)
	}
	if err := learning.FinishRun(ctx, db, "a", folder, token, ""); err != nil {
		t.Fatal(err)
	}
	handler := CategorySkills(config.Config{Root: root, DatabaseURL: "file:" + path})
	call := func(workspace string, revision any, want int) string {
		t.Helper()
		body, _ := json.Marshal(map[string]any{"folderId": folder, "versionId": id, "revision": revision, "promptSnippet": "修改后的技能", "summary": "自然光"})
		r := httptest.NewRequest(http.MethodPost, "/api/catalog/category-skills?action=edit", bytes.NewReader(body))
		r = r.WithContext(httpx.WithWorkspace(r.Context(), workspace))
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != want {
			t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
		}
		return w.Body.String()
	}
	call("a", nil, 400)
	call("a", 0.5, 400)
	call("b", 0, 409)
	var result struct {
		Success   bool   `json:"success"`
		VersionID string `json:"versionId"`
	}
	if err := json.Unmarshal([]byte(call("a", 0, 200)), &result); err != nil || !result.Success || result.VersionID == "" || result.VersionID == id {
		t.Fatalf("missing new version: %#v %v", result, err)
	}
	call("a", 0, 409)
	version, err := learning.ReadVersion(ctx, db, "a", folder, result.VersionID)
	if err != nil || version.PromptSnippet != "修改后的技能" || version.Summary != "自然光" {
		t.Fatalf("edit not persisted: %#v %v", version, err)
	}
	scope, err := learning.ReadScope(ctx, db, "a", folder)
	if err != nil || scope.ActiveVersionID != "" || scope.TrialVersionID != "" || scope.Revision != 1 {
		t.Fatalf("edit changed production: %#v %v", scope, err)
	}
}
