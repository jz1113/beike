package sales

import (
	"context"
	"database/sql"
	"encoding/json"
	"testing"
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
