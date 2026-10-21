package library

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/database"
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
	"beike.local/cloud/src/backend/internal/platform/database/migrate"
)

func TestDeconstructGroupsPersistThroughDirectAndReviewedImports(t *testing.T) {
	for _, review := range []bool{false, true} {
		t.Run(map[bool]string{false: "direct", true: "reviewed"}[review], func(t *testing.T) {
			root, _ := filepath.Abs(filepath.Join("..", "..", "..", ".."))
			path := filepath.Join(t.TempDir(), "groups.db")
			if err := migrate.Run(path, root, false); err != nil {
				t.Fatal(err)
			}
			cfg := config.Config{DatabaseURL: "file:" + path, Root: root, NodeEnv: "development"}
			db, err := database.OpenWrite(path)
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			perImage := []any{}
			for i := 1; i <= 4; i++ {
				perImage = append(perImage, map[string]any{"image_index": i, "title": "手机桌面参考", "reverse_prompt_zh": strings.Repeat("木桌自然侧光，手机主体真实纹理，", 15), "shot_type": "pure_product", "has_human": false})
			}
			parsed := map[string]any{"per_image": perImage, "content_groups": []any{map[string]any{"source_image_indices": []int{1, 2, 3, 4}, "title": "测试参考组"}}}
			calls := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				text, _ := json.Marshal(parsed)
				_ = json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": string(text)}}}})
			}))
			defer server.Close()
			image := "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
			request := map[string]any{"imageUrls": []string{image, image, image, image}, "customApiKey": "test-key", "customBaseUrl": server.URL, "model": "gpt-5.6-luna", "reviewBeforeSave": review}
			body, _ := json.Marshal(request)
			rec := httptest.NewRecorder()
			deconstructRequestHandler(cfg).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/catalog/assets/deconstruct", strings.NewReader(string(body))))
			if rec.Code != 200 {
				t.Fatalf("import %d %s", rec.Code, rec.Body.String())
			}
			var result map[string]any
			_ = json.Unmarshal(rec.Body.Bytes(), &result)
			var count int
			if err := db.QueryRow(`SELECT count(*) FROM "FullPromptAsset" WHERE "workspaceId"='local' AND "title"='测试参考组'`).Scan(&count); err != nil {
				t.Fatal(err)
			}
			if review {
				if count != 0 {
					t.Fatal("pending review created an asset")
				}
				var receipt string
				if err := db.QueryRow(`SELECT "payload" FROM "DeconstructReview" WHERE "id"=?`, result["reviewId"]).Scan(&receipt); err != nil {
					t.Fatal(err)
				}
				var stored map[string]any
				_ = json.Unmarshal([]byte(receipt), &stored)
				drafts, err := deconstructGroupDrafts(stored)
				if err != nil {
					t.Fatal(err)
				}
				broken := map[string]any{}
				for key, value := range drafts[0] {
					broken[key] = value
				}
				broken["productCategoryIds"] = `["missing-category"]`
				if _, err := dblibrary.CommitDeconstructGroups(httptest.NewRequest(http.MethodGet, "/", nil).Context(), db, "local", result["reviewId"].(string), append(drafts, broken)); err == nil {
					t.Fatal("invalid second draft accepted")
				}
				if err := db.QueryRow(`SELECT count(*) FROM "FullPromptAsset" WHERE "workspaceId"='local' AND "title"='测试参考组'`).Scan(&count); err != nil || count != 0 {
					t.Fatal("partial asset escaped failed transaction")
				}
				approve, _ := json.Marshal(map[string]any{"id": result["reviewId"], "action": "approve"})
				for i := 0; i < 2; i++ {
					rec = httptest.NewRecorder()
					deconstructReviewsPostHandler(cfg).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/catalog/assets/reviews", strings.NewReader(string(approve))))
					if rec.Code != 200 {
						t.Fatalf("approve %d %s", rec.Code, rec.Body.String())
					}
				}
			} else {
				rec = httptest.NewRecorder()
				deconstructRequestHandler(cfg).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/catalog/assets/deconstruct", strings.NewReader(string(body))))
				if rec.Code != 200 {
					t.Fatal(rec.Body.String())
				}
			}
			var indices, shots, sources string
			if err := db.QueryRow(`SELECT "sourceImageIndices","shotPromptsJson","sourceImages" FROM "FullPromptAsset" WHERE "workspaceId"='local' AND "title"='测试参考组'`).Scan(&indices, &shots, &sources); err != nil {
				t.Fatal(err)
			}
			if indices != "[1,2,3,4]" || !strings.Contains(shots, "pure_product") || !strings.Contains(shots, "木桌自然侧光") || !strings.Contains(sources, image) {
				t.Fatal("source evidence lost")
			}
			if err := db.QueryRow(`SELECT count(*) FROM "FullPromptAsset" WHERE "workspaceId"='local' AND "title"='测试参考组'`).Scan(&count); err != nil {
				t.Fatal(err)
			}
			if count != 1 || calls != 1 {
				t.Fatalf("duplicate assets=%d paid calls=%d", count, calls)
			}
		})
	}
}
