package sales

import (
	"context"
	"encoding/json"
	"path/filepath"
	"testing"

	"beike.local/cloud/src/backend/internal/platform/database"
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
	"beike.local/cloud/src/backend/internal/platform/database/migrate"
)

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
