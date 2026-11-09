package sales

import (
	"context"
	"database/sql"
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

func TestStudioMaterialsOnlyExposeUserWorkspace(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`
 CREATE TABLE "PersonaAsset" (
 "id" TEXT, "workspaceId" TEXT, "name" TEXT, "description" TEXT DEFAULT '', "tags" TEXT DEFAULT '',
 "avatarUrl" TEXT DEFAULT '', "sourceImages" TEXT DEFAULT '[]', "isFavorite" INTEGER DEFAULT 0,
 "usageCount" INTEGER DEFAULT 0, "createdAt" TEXT DEFAULT ''
 );
 CREATE TABLE "SceneAsset" (
	"dimensions" TEXT DEFAULT '',
 "id" TEXT, "workspaceId" TEXT, "title" TEXT, "description" TEXT DEFAULT '', "lighting" TEXT DEFAULT '',
 "category" TEXT DEFAULT '', "spatialType" TEXT DEFAULT '', "tags" TEXT DEFAULT '',
 "suitableCategories" TEXT DEFAULT '[]', "coverUrl" TEXT DEFAULT '', "sourceImages" TEXT DEFAULT '[]',
 "isFavorite" INTEGER DEFAULT 0, "usageCount" INTEGER DEFAULT 0, "createdAt" TEXT DEFAULT ''
 );
 INSERT INTO "PersonaAsset" ("id","workspaceId","name","avatarUrl","sourceImages") VALUES
 ('p','mine','我的人物','/face.jpg','["/body.jpg","/face.jpg"]'),
 ('official-p','official','官方人物','','[]'), ('other-p','other','其他工作区人物','','[]');
 INSERT INTO "SceneAsset" ("id","workspaceId","title") VALUES
 ('s','mine','我的场景'), ('official-s','official','官方场景'), ('other-s','other','其他工作区场景');
 INSERT INTO "AvatarCharacter" ("id","workspaceId","name","coverUrl") VALUES
 ('a','mine','我的数字人','/avatar.jpg'), ('other-a','other','其他数字人','');
 INSERT INTO "AvatarVoice" ("id","workspaceId","name","voiceId") VALUES
 ('v','mine','我的音色','custom-voice'), ('other-v','other','其他音色','');`)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	personas, err := queryStudioPersonas(ctx, db, "mine")
	if err != nil {
		t.Fatal(err)
	}
	if len(personas) != 2 {
		t.Fatalf("personas: %+v", personas)
	}
	for _, p := range personas {
		if p.DefaultVoiceID != "" {
			t.Fatalf("assigned unimported voice: %+v", p)
		}
		if p.ID == "p" && (p.FullBodyURL != "/body.jpg" || p.FaceURL != "/face.jpg" || p.IdentityURL != "/face.jpg") {
			t.Fatalf("lost image anchors: %+v", p)
		}
	}
	scenes, err := queryStudioScenes(ctx, db, "mine")
	if err != nil {
		t.Fatal(err)
	}
	if len(scenes) != 1 || scenes[0].ID != "s" {
		t.Fatalf("scenes: %+v", scenes)
	}
	voices, err := queryStudioVoices(ctx, db, "mine")
	if err != nil {
		t.Fatal(err)
	}
	if len(voices) != 1 || voices[0].ID != "v" || voices[0].TtsVoice != "custom-voice" {
		t.Fatalf("voices: %+v", voices)
	}
	emptyPersonas, pErr := queryStudioPersonas(ctx, db, "empty")
	emptyScenes, sErr := queryStudioScenes(ctx, db, "empty")
	emptyVoices, vErr := queryStudioVoices(ctx, db, "empty")
	if pErr != nil || sErr != nil || vErr != nil || len(emptyPersonas) != 0 || len(emptyScenes) != 0 || len(emptyVoices) != 0 {
		t.Fatal("empty workspace inherited materials")
	}
}

func TestStudioPersonaDTOIncludesOriginalIdentityAfterGridGeneration(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`CREATE TABLE "PersonaAsset" (
 "id" TEXT, "workspaceId" TEXT, "name" TEXT, "description" TEXT DEFAULT '', "tags" TEXT DEFAULT '',
 "avatarUrl" TEXT DEFAULT '', "sourceImages" TEXT DEFAULT '[]', "dimensions" TEXT DEFAULT '{}',
 "isFavorite" INTEGER DEFAULT 0, "usageCount" INTEGER DEFAULT 0, "createdAt" TEXT DEFAULT ''
 );
 INSERT INTO "PersonaAsset" ("id","workspaceId","name","avatarUrl","sourceImages","dimensions") VALUES
 ('grid','mine','出镜人物','/derived-face.jpg','["/original.jpg","/derived-face.jpg","/derived-front.jpg"]',
 '{"personaViews":{"main":"/original.jpg","face":"/derived-face.jpg","front":"/derived-front.jpg"}}'),
 ('unlabelled','mine','未标记人物','','["/unlabelled-first.jpg"]','{}');`)
	if err != nil {
		t.Fatal(err)
	}
	personas, err := queryStudioPersonas(context.Background(), db, "mine")
	if err != nil {
		t.Fatal(err)
	}
	if len(personas) != 2 {
		t.Fatalf("personas: %+v", personas)
	}
	for _, item := range personas {
		if item.ID == "unlabelled" && item.IdentityURL != "" {
			t.Fatalf("guessed identity from first source image: %+v", item)
		}
		if item.ID != "grid" {
			continue
		}
		raw, _ := json.Marshal(item)
		var dto map[string]any
		if err := json.Unmarshal(raw, &dto); err != nil {
			t.Fatal(err)
		}
		if dto["identityUrl"] != "/original.jpg" || dto["faceUrl"] != "/derived-face.jpg" || dto["fullBodyUrl"] != "/derived-front.jpg" {
			t.Fatalf("lost original identity in DTO: %s", raw)
		}
	}
}

func TestStudioActionsOnlyIncludeWorkspaceMaterials(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`CREATE TABLE "ActionAsset" (
 "id" TEXT, "workspaceId" TEXT, "title" TEXT, "action" TEXT, "shotType" TEXT,
 "camera" TEXT, "tags" TEXT, "coverUrl" TEXT,
 "mediaType" TEXT DEFAULT 'image', "mediaUrl" TEXT DEFAULT '', "sourceUrl" TEXT DEFAULT '',
 "productCategoryIds" TEXT DEFAULT '[]', "isFavorite" INTEGER, "usageCount" INTEGER, "createdAt" TEXT
 );
 INSERT INTO "ActionAsset" ("id","workspaceId","title","action","shotType","productCategoryIds","isFavorite") VALUES
 ('local','mine','本地动作','转身展示{{商品}}','全景','["taxonomy_cat1"]',1),
 ('public','official','预置动作','手部展示{{商品}}','近景','[]',0),
 ('private','other','私有动作','不可读取','近景','[]',0)`)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`INSERT INTO "ActionAsset" ("id","workspaceId","title","action","shotType","mediaType","mediaUrl","sourceUrl")
 VALUES ('depth','mine','深度转身','','全景','depth-video','/depth.mp4','/original.mp4')`)
	if err != nil {
		t.Fatal(err)
	}
	actions, err := queryStudioActions(context.Background(), db, "mine")
	if err != nil {
		t.Fatal(err)
	}
	if len(actions) != 2 || actions[0].ID != "local" || actions[0].Action != "转身展示{{商品}}" || actions[0].CategoryID != "taxonomy_cat1" {
		t.Fatalf("unexpected actions: %+v", actions)
	}
	if actions[0].MediaType != "image" || actions[1].MediaType != "depth-video" || actions[1].MediaURL != "/depth.mp4" || actions[1].SourceURL != "/original.mp4" {
		t.Fatalf("media not preserved: %+v", actions)
	}
}

func setupStudioCatalogTestConfig(t *testing.T) config.Config {
	t.Helper()
	cfg := setupSalesTestConfig(t)
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`
CREATE TABLE "PersonaAsset" (
 "id" TEXT, "workspaceId" TEXT, "name" TEXT, "description" TEXT DEFAULT '', "tags" TEXT DEFAULT '',
 "avatarUrl" TEXT DEFAULT '', "sourceImages" TEXT DEFAULT '[]', "dimensions" TEXT DEFAULT '',
 "isFavorite" INTEGER DEFAULT 0, "usageCount" INTEGER DEFAULT 0, "createdAt" TEXT DEFAULT ''
);
CREATE TABLE "SceneAsset" (
 "id" TEXT, "workspaceId" TEXT, "title" TEXT, "description" TEXT DEFAULT '', "lighting" TEXT DEFAULT '',
 "category" TEXT DEFAULT '', "spatialType" TEXT DEFAULT '', "tags" TEXT DEFAULT '',
 "suitableCategories" TEXT DEFAULT '[]', "coverUrl" TEXT DEFAULT '', "sourceImages" TEXT DEFAULT '[]',
 "dimensions" TEXT DEFAULT '', "isFavorite" INTEGER DEFAULT 0, "usageCount" INTEGER DEFAULT 0, "createdAt" TEXT DEFAULT ''
);
CREATE TABLE "ActionAsset" (
 "id" TEXT, "workspaceId" TEXT, "title" TEXT, "action" TEXT DEFAULT '', "shotType" TEXT DEFAULT '',
 "camera" TEXT DEFAULT '', "tags" TEXT DEFAULT '', "coverUrl" TEXT DEFAULT '',
 "mediaType" TEXT DEFAULT 'image', "mediaUrl" TEXT DEFAULT '', "sourceUrl" TEXT DEFAULT '',
 "productCategoryIds" TEXT DEFAULT '[]', "isFavorite" INTEGER DEFAULT 0, "usageCount" INTEGER DEFAULT 0, "createdAt" TEXT DEFAULT ''
);`)
	if err != nil {
		t.Fatal(err)
	}
	return cfg
}

func TestStudioAssetsDistinguishesEmptyCatalogFromReadFailure(t *testing.T) {
	for _, table := range []string{"", "PersonaAsset", "AvatarCharacter", "SceneAsset", "ActionAsset", "AvatarVoice", "SalesProductionPreset"} {
		name := table
		if name == "" {
			name = "empty"
		}
		t.Run(name, func(t *testing.T) {
			cfg := setupStudioCatalogTestConfig(t)
			if table != "" {
				db, err := sql.Open("sqlite", cfg.SQLiteFile())
				if err != nil {
					t.Fatal(err)
				}
				defer db.Close()
				if _, err := db.Exec(`DROP TABLE "` + table + `"`); err != nil {
					t.Fatal(err)
				}
			}
			rec := httptest.NewRecorder()
			StudioAssets(cfg).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/sales/studio-assets", nil))
			var response map[string]any
			_ = json.Unmarshal(rec.Body.Bytes(), &response)
			if table != "" {
				if rec.Code != 500 || response["success"] != false || response["personas"] != nil || strings.Contains(rec.Body.String(), "SQL") {
					t.Fatalf("broken %s must not masquerade as empty/deleted assets: %d %s", table, rec.Code, rec.Body.String())
				}
				return
			}
			if rec.Code != 200 || response["success"] != true {
				t.Fatalf("empty workspace should succeed: %d %s", rec.Code, rec.Body.String())
			}
			for _, key := range []string{"personas", "scenes", "actions", "voices", "bgms"} {
				if items, ok := response[key].([]any); !ok || len(items) != 0 {
					t.Fatalf("expected empty %s array: %s", key, rec.Body.String())
				}
			}
		})
	}
}

func TestStudioAssetsDoesNotSilentlyDropUnreadableRows(t *testing.T) {
	cfg := setupStudioCatalogTestConfig(t)
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	// A malformed stored row used to be skipped, clearing a previously selected action.
	if _, err := db.Exec(`INSERT INTO "ActionAsset" ("id","workspaceId","title","action") VALUES ('a','local','动作',NULL)`); err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	StudioAssets(cfg).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/sales/studio-assets", nil))
	if rec.Code != 500 {
		t.Fatalf("scan failure must fail the catalog: %d %s", rec.Code, rec.Body.String())
	}
}

func TestStudioPersonaExplicitViews(t *testing.T) {
	images := []string{"/main", "/side", "/face", "/front"}
	face, body, voice := studioPersonaAnchors(`{"personaViews":{"main":"/main","face":"/face","side":"/side","front":"/front"},"defaultVoiceId":"voice-1"}`, images, "/old-face", "/side")
	if face != "/face" || body != "/front" || voice != "voice-1" {
		t.Fatalf("wrong production anchors: %s %s %s", face, body, voice)
	}
	face, body, _ = studioPersonaAnchors(`{"personaViews":{"main":"/main","face":"","front":"/removed"}}`, images, "/old-face", "/side")
	if face != "/main" || body != "/main" {
		t.Fatalf("missing views must use main image: %s %s", face, body)
	}
	face, body, _ = studioPersonaAnchors(`{}`, images, "/old-face", "/old-body")
	if face != "/old-face" || body != "/old-body" {
		t.Fatalf("legacy anchors changed: %s %s", face, body)
	}
}

func TestStudioPersonaIdentitySource(t *testing.T) {
	for _, tc := range []struct {
		name, dimensions, avatar, want string
	}{
		{"main survives generated views", `{"personaViews":{"main":"/main","face":"/face","front":"/front"}}`, "/face", "/main"},
		{"deleted main is not a derived avatar", `{"personaViews":{"main":"/removed","face":"/face"}}`, "/face", ""},
		{"unlabelled main is not guessed", `{"personaViews":{"face":"/face"}}`, "/face", ""},
		{"empty explicit views are not legacy", `{"personaViews":{}}`, "/face", ""},
		{"null explicit views are not legacy", `{"personaViews":null}`, "/face", ""},
		{"malformed explicit views are not legacy", `{"personaViews":"removed"}`, "/face", ""},
		{"legacy original avatar", `{}`, "/original-avatar", "/original-avatar"},
		{"legacy no avatar is not first source", `{}`, "", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := studioPersonaIdentityURL(tc.dimensions, []string{"/first", "/main", "/face", "/front"}, tc.avatar)
			if got != tc.want {
				t.Fatalf("identity = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestStudioSceneViewsPersistAndReload(t *testing.T) {
	root, err := filepath.Abs(filepath.Join("..", "..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "scene.db")
	if err := migrate.Run(path, root, false); err != nil {
		t.Fatal(err)
	}
	db, err := database.OpenWrite(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	dimensions := `{"sceneViews":{"main":"/main.jpg","left":"","right":"/right.jpg"},"room":"living"}`
	raw, err := dblibrary.CreateLibraryAsset(ctx, db, "local", "scene", map[string]any{
		"title": "客厅", "description": "保留原有描述", "coverUrl": "/main.jpg",
		"dimensions": dimensions, "sourceImages": `["/main.jpg","/right.jpg"]`,
	})
	if err != nil {
		t.Fatal(err)
	}
	var created struct{ ID string }
	if err := json.Unmarshal(raw, &created); err != nil {
		t.Fatal(err)
	}
	items, err := queryStudioScenes(ctx, db, "local")
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].Dimensions != dimensions || items[0].CoverURL != "/main.jpg" || len(items[0].SourceImages) != 2 {
		t.Fatalf("lost created views: %+v", items)
	}
	next := `{"sceneViews":{"main":"/main.jpg","left":"/left.jpg","right":"/right.jpg","reverse":"/reverse.jpg"},"room":"living"}`
	_, err = dblibrary.UpdateLibraryAsset(ctx, db, "local", "scene", created.ID, map[string]any{
		"dimensions": next, "sourceImages": `["/main.jpg","/left.jpg","/right.jpg","/reverse.jpg"]`,
	})
	if err != nil {
		t.Fatal(err)
	}
	items, err = queryStudioScenes(ctx, db, "local")
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].Dimensions != next || len(items[0].SourceImages) != 4 || items[0].Description != "保留原有描述" {
		t.Fatalf("lost edited views: %+v", items)
	}
	other, err := queryStudioScenes(ctx, db, "other")
	if err != nil {
		t.Fatal(err)
	}
	if len(other) != 0 {
		t.Fatal("scene views leaked to another workspace")
	}
}
