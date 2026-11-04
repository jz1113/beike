package sales

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/platform/database"
	"beike.local/cloud/src/backend/internal/platform/storage"
)

func TestSharedMaterialImportBetweenWorkspaces(t *testing.T) {
	cfg := mediaJobConfig(t)
	db, err := database.OpenWrite(cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	mediaRoot := storage.ResolveRoot()
	if err = os.MkdirAll(filepath.Join(mediaRoot, "source"), 0700); err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(filepath.Join(mediaRoot, "source", "main.png"), []byte("image bytes"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`INSERT INTO PersonaAsset(id,workspaceId,name,description,tags,avatarUrl,sourceImages,dimensions,updatedAt)
		VALUES ('p','source','共享人物','','','/storage/source/main.png','["/storage/source/main.png"]','{"personaViews":{"main":"/storage/source/main.png"}}',CURRENT_TIMESTAMP),
		('bad','source','无权读取','','','/storage/other/secret.png','[]','',CURRENT_TIMESTAMP),
		('missing','source','残缺素材','','','/storage/source/main.png','["/storage/source/missing.png"]','',CURRENT_TIMESTAMP)`); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`INSERT INTO SalesReferenceScript (id,workspaceId,title,status,scriptJson,createdAt,updatedAt)
		VALUES ('draft','source','私人草稿','draft','{}','',''),('script','source','共享脚本','verified','{"taxonomy":{"styleId":"source-style"}}','','')`); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`INSERT INTO SceneAsset(id,workspaceId,title,description,lighting,updatedAt) VALUES ('room','source','场景','','',CURRENT_TIMESTAMP);
INSERT INTO ActionAsset(id,workspaceId,title,action,shotType,updatedAt) VALUES ('move','source','动作','','',CURRENT_TIMESTAMP);
INSERT INTO AvatarVoice(id,workspaceId,name,audioUrl) VALUES ('voice','source','人声','');
INSERT INTO SalesProductionPreset(id,workspaceId,name,category,configJson,createdAt,updatedAt) VALUES ('music','source','配乐','studio_bgm_asset','{"audioUrl":"/storage/source/music.mp3"}','','');`); err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(filepath.Join(mediaRoot, "source", "music.mp3"), []byte("audio bytes"), 0600); err != nil {
		t.Fatal(err)
	}

	const endpoint = "/api/library/shared-materials"
	mux := http.NewServeMux()
	mux.Handle(endpoint, SharedMaterials(cfg))
	mux.Handle("/api/library/preferences", LibraryPreferences(cfg))
	mux.Handle("GET /api/sales/studio-assets", StudioAssets(cfg))
	const settings = "/api/library/preferences"
	if taxonomyRequest(t, mux, "GET", settings, "", "target", 200)["sharingEnabled"] != false {
		t.Fatal("expected opt-in")
	}
	taxonomyRequest(t, mux, "GET", endpoint, "", "target", 403)
	taxonomyRequest(t, mux, "PATCH", settings, `{"sharingEnabled":true}`, "target", 200)
	prefs := taxonomyRequest(t, mux, "PATCH", settings, `{"showEntry":false}`, "target", 200)
	if prefs["showEntry"] != false || prefs["sharingEnabled"] != true {
		t.Fatal("hiding entry changed sharing", prefs)
	}
	if other := taxonomyRequest(t, mux, "GET", settings, "", "source", 200); other["showEntry"] != true || other["sharingEnabled"] != false {
		t.Fatal("preferences crossed workspace", other)
	}
	if items := taxonomyRequest(t, mux, "GET", endpoint, "", "target", 200)["items"].([]any); len(items) != 0 {
		t.Fatal("unpublished source", items)
	}
	taxonomyRequest(t, mux, "POST", endpoint, `{"kind":"persona","id":"p"}`, "target", 404)
	taxonomyRequest(t, mux, "PATCH", settings, `{"sharingEnabled":true}`, "source", 200)
	taxonomyRequest(t, mux, "PATCH", settings, `{"sharingEnabled":true}`, "third", 200)
	list := taxonomyRequest(t, mux, "GET", endpoint+"?q=共享", "", "target", 200)
	if len(list["items"].([]any)) != 2 {
		t.Fatal(list)
	}
	importOne := func(id string, status int) map[string]any {
		return taxonomyRequest(t, mux, "POST", endpoint, `{"kind":"persona","id":"`+id+`"}`, "target", status)
	}
	id := importOne("p", 200)["id"]
	if id != importOne("p", 200)["id"] {
		t.Fatal("retry duplicated asset")
	}
	importOne("bad", 500)
	importOne("missing", 500)
	after := taxonomyRequest(t, mux, "GET", endpoint+"?kind=persona&q=共享", "", "target", 200)
	first := after["items"].([]any)[0].(map[string]any)
	if first["importedId"] != id {
		t.Fatal("missing imported state", first)
	}
	var url string
	if err = db.QueryRow(`SELECT avatarUrl FROM PersonaAsset WHERE id=? AND workspaceId='target'`, id).Scan(&url); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(url, "/storage/target/") {
		t.Fatal(url)
	}
	bytes, err := os.ReadFile(filepath.Join(mediaRoot, strings.TrimPrefix(url, "/storage/")))
	if err != nil || string(bytes) != "image bytes" {
		t.Fatal(err, string(bytes))
	}
	catalog := taxonomyRequest(t, mux, "GET", "/api/sales/studio-assets", "", "target", 200)
	if len(catalog["personas"].([]any)) != 1 {
		t.Fatal(catalog["personas"])
	}
	dirs, err := os.ReadDir(filepath.Join(mediaRoot, "target", "shared-materials"))
	if err != nil || len(dirs) != 1 {
		t.Fatal("partial files", err, dirs)
	}
	var original string
	if err = db.QueryRow(`SELECT avatarUrl FROM PersonaAsset WHERE id='p' AND workspaceId='source'`).Scan(&original); err != nil || original != "/storage/source/main.png" {
		t.Fatal(err, original)
	}
	taxonomyRequest(t, mux, "POST", endpoint, `{"kind":"script","id":"draft"}`, "target", 404)
	taxonomyRequest(t, mux, "POST", endpoint, `{"kind":"script","id":"script"}`, "target", 200)
	for kind, id := range map[string]string{"scene": "room", "action": "move", "voice": "voice", "bgm": "music"} {
		taxonomyRequest(t, mux, "POST", endpoint, `{"kind":"`+kind+`","id":"`+id+`"}`, "target", 200)
	}
	available := taxonomyRequest(t, mux, "GET", "/api/sales/studio-assets", "", "target", 200)
	for _, kind := range []string{"scenes", "actions", "voices", "bgms"} {
		if len(available[kind].([]any)) != 1 {
			t.Fatal(kind, available[kind])
		}
	}

	third := taxonomyRequest(t, mux, "GET", endpoint+"?q=共享", "", "third", 200)
	if len(third["items"].([]any)) != 2 {
		t.Fatal("imported copies republished", third)
	}
	taxonomyRequest(t, mux, "PATCH", settings, `{"sharingEnabled":false}`, "source", 200)
	if items := taxonomyRequest(t, mux, "GET", endpoint, "", "third", 200)["items"].([]any); len(items) != 0 {
		t.Fatal("disabled source still visible", items)
	}
	taxonomyRequest(t, mux, "POST", endpoint, `{"kind":"persona","id":"p"}`, "third", 404)
	taxonomyRequest(t, mux, "PATCH", settings, `{"sharingEnabled":false}`, "target", 200)
	taxonomyRequest(t, mux, "POST", endpoint, `{"kind":"persona","id":"p"}`, "target", 403)
	prefs = taxonomyRequest(t, mux, "GET", settings, "", "target", 200)
	if prefs["showEntry"] != false || prefs["sharingEnabled"] != false {
		t.Fatal("disabling sharing changed hidden entry", prefs)
	}
	prefs = taxonomyRequest(t, mux, "PATCH", settings, `{"showEntry":true}`, "target", 200)
	if prefs["showEntry"] != true || prefs["sharingEnabled"] != false {
		t.Fatal("restoring entry enabled sharing", prefs)
	}

	if len(taxonomyRequest(t, mux, "GET", "/api/sales/studio-assets", "", "target", 200)["personas"].([]any)) != 1 {
		t.Fatal("lost imported asset")
	}

}
