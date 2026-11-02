package sales

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func setupAtlasTestFixture(t *testing.T) (config.Config, *sql.DB) {
	t.Helper()
	cfg := setupSalesTestConfig(t)
	cfg.Root = t.TempDir()
	t.Setenv("AZHUO_DATA_DIR", t.TempDir())
	t.Setenv("AZHUO_CACHE_DIR", t.TempDir())

	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })

	_, err = db.Exec(`
CREATE TABLE "PersonaAsset" (
  "id" TEXT NOT NULL PRIMARY KEY, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '', "tags" TEXT NOT NULL DEFAULT '', "avatarUrl" TEXT NOT NULL DEFAULT '',
  "sourceImages" TEXT NOT NULL DEFAULT '[]', "dimensions" TEXT NOT NULL DEFAULT '{}',
  "provenance" TEXT NOT NULL DEFAULT 'manual', "usageCount" INTEGER NOT NULL DEFAULT 0,
  "isFavorite" INTEGER NOT NULL DEFAULT 0, "createdAt" TEXT NOT NULL, "updatedAt" TEXT NOT NULL,
  "albumId" TEXT, "productCategoryIds" TEXT NOT NULL DEFAULT '[]', "isUniversal" INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE "ActionAsset" (
  "id" TEXT NOT NULL PRIMARY KEY, "workspaceId" TEXT NOT NULL, "title" TEXT NOT NULL,
  "action" TEXT NOT NULL DEFAULT '', "shotType" TEXT NOT NULL DEFAULT '', "spatialType" TEXT NOT NULL DEFAULT 'general',
  "camera" TEXT NOT NULL DEFAULT '', "suitableAnatomy" TEXT NOT NULL DEFAULT '["all"]',
  "tags" TEXT NOT NULL DEFAULT '', "coverUrl" TEXT NOT NULL DEFAULT '', "sourceImages" TEXT NOT NULL DEFAULT '[]',
  "dimensions" TEXT NOT NULL DEFAULT '{}', "provenance" TEXT NOT NULL DEFAULT 'manual',
  "sceneId" TEXT, "shotOrder" INTEGER NOT NULL DEFAULT 0, "usageCount" INTEGER NOT NULL DEFAULT 0,
  "isFavorite" INTEGER NOT NULL DEFAULT 0, "createdAt" TEXT NOT NULL, "updatedAt" TEXT NOT NULL,
  "productCategoryIds" TEXT NOT NULL DEFAULT '[]', "isUniversal" INTEGER NOT NULL DEFAULT 0,
  "mediaType" TEXT NOT NULL DEFAULT 'image', "mediaUrl" TEXT NOT NULL DEFAULT '', "sourceUrl" TEXT NOT NULL DEFAULT ''
);
CREATE TABLE "SalesScriptTaxonomy" (
  "id" TEXT NOT NULL PRIMARY KEY, "workspaceId" TEXT NOT NULL, "kind" TEXT NOT NULL,
  "name" TEXT NOT NULL, "createdAt" TEXT NOT NULL, "updatedAt" TEXT NOT NULL
);
CREATE TABLE "PromptAssetRegistry" (
  "id" TEXT NOT NULL PRIMARY KEY, "workspaceId" TEXT NOT NULL, "assetType" TEXT NOT NULL,
  "sourceAssetId" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'published', "version" INTEGER NOT NULL DEFAULT 1,
  "provenance" TEXT NOT NULL DEFAULT 'manual', "sourceRef" TEXT, "qualityScore" REAL, "confidence" REAL,
  "publishedAt" TEXT, "disabledReason" TEXT, "createdAt" TEXT NOT NULL, "updatedAt" TEXT NOT NULL,
  UNIQUE("workspaceId", "assetType", "sourceAssetId")
);`)
	if err != nil {
		t.Fatal(err)
	}
	return cfg, db
}

func seedAtlasCatalogFiles(t *testing.T, dir string) {
	t.Helper()
	for _, rel := range []string{
		"thumbs/p1_front.jpg", "img/p1_front.png", "img/p1_diagonal.png", "img/p1_side.png",
		"portrait/thumbs/f001.webp",
	} {
		full := filepath.Join(dir, rel)
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte("fake-image-payload-"+rel), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	posesJSON := `{
  "angles":[{"key":"front","names":{"zh":"正面","en":"Front","ja":"正面"}}],
  "series":[{"key":"full_std","names":{"zh":"标准全身","en":"Full","ja":"全身"},"short":{"zh":"标准","en":"Std","ja":"標準"},"poseCount":1,"imageCount":3}],
  "categories":[{"key":"站姿","names":{"zh":"站姿","en":"Standing","ja":"立ち姿"}}],
  "categoriesBySeries":{"full_std":["站姿"]},
  "poses":[{
    "id":"full_std__站姿__001","series":"full_std","category":"站姿","no":"001",
    "names":{"zh":"自然站立叉腰","en":"Standing Hands on Hips","ja":"腰に手を当てる"},
    "variants":[
      {"angle":"front","thumb":"thumbs/p1_front.jpg","full":"img/p1_front.png"},
      {"angle":"diagonal","thumb":"thumbs/p1_front.jpg","full":"img/p1_diagonal.png"},
      {"angle":"side","thumb":"thumbs/p1_front.jpg","full":"img/p1_side.png"}
    ]
  }]
}`
	facesJSON := `{
  "sections":[{"key":"face","names":{"zh":"脸部","en":"Face","ja":"顔"},"note":{"zh":"正脸","en":"Face","ja":"顔"},"count":1}],
  "hairs":[{"key":"long","names":{"zh":"长发","en":"Long","ja":"ロング"},"count":1}],
  "images":[{
    "id":"face_abc123","sec":"face","hair":"long","style":"清透自然妆",
    "w":400,"h":500,"thumb":"portrait/thumbs/f001.webp","full":"portrait/img/f001.png",
    "thumb_remote":"","full_remote":""
  }]
}`
	if err := os.WriteFile(filepath.Join(dir, "poses.json"), []byte(posesJSON), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "faces.json"), []byte(facesJSON), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestAtlasCatalogGracefulUnsyncedAndMediaSecurity(t *testing.T) {
	cfg, _ := setupAtlasTestFixture(t)

	// 未执行同步时应优雅返回 synced=false
	rec := httptest.NewRecorder()
	AtlasCatalog(cfg).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/sales/atlas/catalog", nil))
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"synced":false`) {
		t.Fatalf("expected graceful unsynced payload, got %d: %s", rec.Code, rec.Body.String())
	}

	// 写入图鉴后应正常返回清单且拦截目录穿越
	seedAtlasCatalogFiles(t, cfg.AtlasCatalogDir())
	rec2 := httptest.NewRecorder()
	AtlasCatalog(cfg).ServeHTTP(rec2, httptest.NewRequest(http.MethodGet, "/api/sales/atlas/catalog", nil))
	if rec2.Code != http.StatusOK || !strings.Contains(rec2.Body.String(), `"synced":true`) {
		t.Fatalf("expected synced=true, got %d: %s", rec2.Code, rec2.Body.String())
	}

	mediaRec := httptest.NewRecorder()
	AtlasMedia(cfg).ServeHTTP(mediaRec, httptest.NewRequest(http.MethodGet, "/api/sales/atlas/media?path=thumbs%2Fp1_front.jpg", nil))
	if mediaRec.Code != http.StatusOK || mediaRec.Header().Get("Content-Type") != "image/jpeg" {
		t.Fatalf("expected 200 image/jpeg, got %d (%s)", mediaRec.Code, mediaRec.Header().Get("Content-Type"))
	}

	traverseRec := httptest.NewRecorder()
	AtlasMedia(cfg).ServeHTTP(traverseRec, httptest.NewRequest(http.MethodGet, "/api/sales/atlas/media?path=..%2F..%2Fsecret.png", nil))
	if traverseRec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for path traversal, got %d", traverseRec.Code)
	}
}

func TestAtlasImportFaceAndPoseOptInIdempotentAndIsolated(t *testing.T) {
	cfg, db := setupAtlasTestFixture(t)
	seedAtlasCatalogFiles(t, cfg.AtlasCatalogDir())
	handler := atlasImportHandler(cfg, nil)

	// 1. 导入人脸到 PersonaAsset，验证 personaViews.main 锚点与幂等性
	reqFace := httptest.NewRequest(http.MethodPost, "/api/sales/atlas/import", strings.NewReader(`{"kind":"face","ids":["face_abc123"],"audience":"adult_female"}`))
	reqFace = reqFace.WithContext(httpx.WithWorkspace(reqFace.Context(), "ws_alpha"))
	recFace := httptest.NewRecorder()
	handler.ServeHTTP(recFace, reqFace)
	if recFace.Code != http.StatusOK {
		t.Fatalf("face import failed: %d %s", recFace.Code, recFace.Body.String())
	}

	personas, err := queryStudioPersonas(t.Context(), db, "ws_alpha")
	if err != nil || len(personas) != 1 {
		t.Fatalf("expected 1 imported persona, got %+v (%v)", personas, err)
	}
	if personas[0].IdentityURL == "" || personas[0].FaceURL == "" || !strings.HasPrefix(personas[0].IdentityURL, "/storage/ws_alpha/") {
		t.Fatalf("persona missing main identity anchor or workspace prefix: %+v", personas[0])
	}

	// 重复导入同一人脸应跳过而非新增重复记录
	reqFaceDup := httptest.NewRequest(http.MethodPost, "/api/sales/atlas/import", strings.NewReader(`{"kind":"face","ids":["face_abc123"]}`))
	reqFaceDup = reqFaceDup.WithContext(httpx.WithWorkspace(reqFaceDup.Context(), "ws_alpha"))
	recFaceDup := httptest.NewRecorder()
	handler.ServeHTTP(recFaceDup, reqFaceDup)
	if !strings.Contains(recFaceDup.Body.String(), `"skipped":1`) {
		t.Fatalf("expected skipped=1 on duplicate import: %s", recFaceDup.Body.String())
	}

	// 2. 导入多视角姿态组到 ActionAsset，验证 3 个视角聚合与自动分类创建
	reqPose := httptest.NewRequest(http.MethodPost, "/api/sales/atlas/import", strings.NewReader(`{"kind":"pose","ids":["full_std__站姿__001"],"preferredAngle":"diagonal"}`))
	reqPose = reqPose.WithContext(httpx.WithWorkspace(reqPose.Context(), "ws_alpha"))
	recPose := httptest.NewRecorder()
	handler.ServeHTTP(recPose, reqPose)
	if recPose.Code != http.StatusOK {
		t.Fatalf("pose import failed: %d %s", recPose.Code, recPose.Body.String())
	}

	actions, err := queryStudioActions(t.Context(), db, "ws_alpha")
	if err != nil || len(actions) != 1 {
		t.Fatalf("expected 1 imported pose action, got %+v (%v)", actions, err)
	}
	if len(actions[0].SourceImages) != 3 || actions[0].CategoryID == "" || !strings.Contains(actions[0].CoverURL, "_diagonal.png") {
		t.Fatalf("pose multi-angle aggregation or preferredAngle cover failed: %+v", actions[0])
	}
	var dims struct {
		ActionViews map[string]string `json:"actionViews"`
	}
	if err := json.Unmarshal([]byte(actions[0].Dimensions), &dims); err != nil || len(dims.ActionViews) != 3 {
		t.Fatalf("expected 3 actionViews in dimensions, got %s (%v)", actions[0].Dimensions, err)
	}

	// 另一工作区完全隔离，不会看到 ws_alpha 导入的资产
	otherActions, err := queryStudioActions(t.Context(), db, "ws_beta")
	if err != nil || len(otherActions) != 0 {
		t.Fatalf("workspace isolation violated: %+v", otherActions)
	}
}
