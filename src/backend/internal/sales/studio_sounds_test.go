package sales

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func setupStudioSoundsTest(t *testing.T) (config.Config, *sql.DB, *http.ServeMux) {
	t.Helper()
	cfg := setupSalesTestConfig(t)
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	_, err = db.Exec(`ALTER TABLE "AvatarVoice" ADD COLUMN "audioUrl" TEXT NOT NULL DEFAULT '';
 ALTER TABLE "AvatarVoice" ADD COLUMN "type" INTEGER NOT NULL DEFAULT 1;
 ALTER TABLE "AvatarVoice" ADD COLUMN "statusMsg" TEXT NOT NULL DEFAULT '';
 ALTER TABLE "AvatarVoice" ADD COLUMN "promptNpyUrl" TEXT NOT NULL DEFAULT '';
 INSERT INTO "AvatarVoice" ("id","workspaceId","name","gender","tags","promptText","voiceId") VALUES ('voice_mine','local','我的人声','male','["沉稳"]','原描述','original-voice');
 INSERT INTO "SalesProductionPreset" ("id","workspaceId","name","category","configJson","createdAt","updatedAt") VALUES ('bgm_mine','local','我的配乐','studio_bgm_asset','{"audioUrl":"/storage/local/bgm.mp3","description":"原描述","moodTags":["轻快"]}','now','now');`)
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("PATCH /api/sales/studio-sounds/{id}", StudioSoundByID(cfg))
	mux.HandleFunc("DELETE /api/sales/studio-sounds/{id}", StudioSoundByID(cfg))
	return cfg, db, mux
}

func TestStudioSoundMutationsReportDatabaseFailures(t *testing.T) {
	for _, id := range []string{"voice_mine", "bgm_mine"} {
		for _, method := range []string{http.MethodPatch, http.MethodDelete} {
			t.Run(id+method, func(t *testing.T) {
				_, db, mux := setupStudioSoundsTest(t)
				table, operation := "AvatarVoice", "UPDATE"
				if id == "bgm_mine" {
					table = "SalesProductionPreset"
				}
				if method == http.MethodDelete {
					operation = "DELETE"
				}
				if _, err := db.Exec(`CREATE TRIGGER reject_sound BEFORE ` + operation + ` ON "` + table + `" BEGIN SELECT RAISE(ABORT,'write unavailable'); END`); err != nil {
					t.Fatal(err)
				}
				rec := httptest.NewRecorder()
				mux.ServeHTTP(rec, httptest.NewRequest(method, "/api/sales/studio-sounds/"+id, strings.NewReader(`{"name":"新名称"}`)))
				if rec.Code != 500 || !strings.Contains(rec.Body.String(), `"success":false`) {
					t.Fatalf("failure reported as success: %d %s", rec.Code, rec.Body.String())
				}
				var name string
				column := "name"
				if err := db.QueryRow(`SELECT "`+column+`" FROM "`+table+`" WHERE "id"=?`, id).Scan(&name); err != nil || name == "新名称" {
					t.Fatalf("mutation was not preserved: name=%s err=%v", name, err)
				}
			})
		}
	}
}

func TestStudioSoundPatchClearsFieldsAndPersistsVoiceSelection(t *testing.T) {
	_, db, mux := setupStudioSoundsTest(t)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPatch, "/api/sales/studio-sounds/voice_mine", strings.NewReader(`{"description":"","promptText":"","tags":[],"voiceId":"new-provider-voice"}`)))
	if rec.Code != 200 {
		t.Fatalf("patch: %d %s", rec.Code, rec.Body.String())
	}
	var prompt, tags, voice, gender string
	if err := db.QueryRow(`SELECT "promptText","tags","voiceId","gender" FROM "AvatarVoice" WHERE "id"='voice_mine'`).Scan(&prompt, &tags, &voice, &gender); err != nil {
		t.Fatal(err)
	}
	if prompt != "" || strings.Contains(tags, "沉稳") || voice != "new-provider-voice" || gender != "male" {
		t.Fatalf("fields lost or ignored: %q %q %q %q", prompt, tags, voice, gender)
	}
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPatch, "/api/sales/studio-sounds/bgm_mine", strings.NewReader(`{"description":"","moodTags":[]}`)))
	if rec.Code != 200 {
		t.Fatalf("patch: %d %s", rec.Code, rec.Body.String())
	}
	bgms, err := queryStudioBgms(t.Context(), db, "local")
	if err != nil || len(bgms) != 1 || bgms[0].Description != "" || len(bgms[0].MoodTags) != 0 {
		t.Fatalf("empty edits did not survive reload: %#v %v", bgms, err)
	}
}

func TestStudioSoundPatchOmittedFieldsRemainAndMissingIs404(t *testing.T) {
	_, db, mux := setupStudioSoundsTest(t)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPatch, "/api/sales/studio-sounds/voice_mine", strings.NewReader(`{"name":"新名称"}`)))
	var prompt, voice string
	if err := db.QueryRow(`SELECT "promptText","voiceId" FROM "AvatarVoice" WHERE "id"='voice_mine'`).Scan(&prompt, &voice); err != nil {
		t.Fatal(err)
	}
	if rec.Code != 200 || prompt != "原描述" || voice != "original-voice" {
		t.Fatalf("omitted fields overwritten: %d %q %q", rec.Code, prompt, voice)
	}
	for _, method := range []string{http.MethodPatch, http.MethodDelete} {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest(method, "/api/sales/studio-sounds/missing", strings.NewReader(`{"name":"x"}`)))
		var body map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &body)
		if rec.Code != 404 || body["success"] != false {
			t.Fatalf("missing mutation: %d %s", rec.Code, rec.Body.String())
		}
	}
}

func TestStudioSoundDeleteRollsBackBothTablesOnFailure(t *testing.T) {
	_, db, mux := setupStudioSoundsTest(t)
	if _, err := db.Exec(`INSERT INTO "AvatarVoice" ("id","workspaceId","name") VALUES ('bgm_mine','local','旧重复编号'); CREATE TRIGGER reject_bgm_delete BEFORE DELETE ON "SalesProductionPreset" BEGIN SELECT RAISE(ABORT,'write unavailable'); END`); err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodDelete, "/api/sales/studio-sounds/bgm_mine", nil))
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM "AvatarVoice" WHERE "id"='bgm_mine'`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if rec.Code != 500 || count != 1 {
		t.Fatalf("delete partially committed: code=%d count=%d", rec.Code, count)
	}
}
