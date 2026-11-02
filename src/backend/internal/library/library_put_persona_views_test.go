package library

import (
	"context"
	"encoding/json"
	"net/http"
	"path/filepath"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/database"
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
	"beike.local/cloud/src/backend/internal/platform/database/migrate"
)

func TestLibraryPutPersonaViewsPreservesExistingDescription(t *testing.T) {
	root, err := filepath.Abs(filepath.Join("..", "..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "personas.db")
	if err := migrate.Run(path, root, false); err != nil {
		t.Fatal(err)
	}
	db, err := database.OpenWrite(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	raw, err := dblibrary.CreateLibraryAsset(context.Background(), db, "local", "persona", map[string]any{
		"name": "人物", "description": "保留历史描述", "avatarUrl": "/old-face", "sourceImages": `["/main","/old-face"]`,
	})
	if err != nil {
		t.Fatal(err)
	}
	var created struct{ ID string }
	if err := json.Unmarshal(raw, &created); err != nil {
		t.Fatal(err)
	}
	dimensions := `{"audience":"adult_female","personaViews":{"main":"/main","face":"/face","side":"/side","front":"/front"}}`
	images := `["/main","/face","/side","/front"]`
	payload, _ := json.Marshal(map[string]any{"assetType": "persona", "id": created.ID, "data": map[string]any{
		"name": "已更新人物", "avatarUrl": "/face", "sourceImages": images, "dimensions": dimensions,
	}})
	status, body := putLibrary(t, libraryPutHandler(config.Config{DatabaseURL: "file:" + path, Root: root}), string(payload))
	if status != http.StatusOK || body["success"] != true {
		t.Fatalf("save: %d %#v", status, body)
	}
	var avatar, sources, dims, description string
	err = db.QueryRow(`SELECT "avatarUrl","sourceImages","dimensions","description" FROM "PersonaAsset" WHERE "id"=?`, created.ID).Scan(&avatar, &sources, &dims, &description)
	if err != nil {
		t.Fatal(err)
	}
	if avatar != "/face" || sources != images || dims != dimensions || description != "保留历史描述" {
		t.Fatalf("lost persona fields: %s %s %s %s", avatar, sources, dims, description)
	}
}
