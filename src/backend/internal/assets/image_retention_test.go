package assets

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/database"
	"beike.local/cloud/src/backend/internal/platform/database/migrate"
)

func TestImageRetentionPreviewAndExpiry(t *testing.T) {
	root := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", root)
	now := time.Now().UTC()
	old := now.Add(-25 * time.Hour)
	for _, name := range []string{"old.png", "old.mp4", "fresh.jpg"} {
		path := filepath.Join(root, name)
		if err := os.WriteFile(path, []byte("fixture"), 0600); err != nil {
			t.Fatal(err)
		}
		if name != "fresh.jpg" {
			if err := os.Chtimes(path, old, old); err != nil {
				t.Fatal(err)
			}
		}
	}
	path := filepath.Join(root, "test.db")
	if err := migrate.Run(path, "../../../..", false); err != nil {
		t.Fatal(err)
	}
	db, err := database.OpenRequired(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`INSERT INTO "ImageTask" (id,prompt,mediaType,status,updatedAt) VALUES
		('old-image','','image','SUCCESS',?), ('fresh-image','','image','SUCCESS',?),
		('old-video','','video','SUCCESS',?), ('pending-image','','image','IN_PROGRESS',?)`,
		old.Format(time.RFC3339Nano), now.Format(time.RFC3339Nano), old.Format(time.RFC3339Nano), old.Format(time.RFC3339Nano)); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "SceneAsset" (id,title,description,lighting,coverUrl,createdAt,updatedAt)
		VALUES ('old-scene','scene','','','/storage/old.png',?,?)`, old.Format(time.RFC3339Nano), old.Format(time.RFC3339Nano)); err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{DatabaseURL: "file:" + path}
	for _, preview := range []bool{true, false} {
		files, records, err := ExpireImages(context.Background(), cfg, now, preview)
		if err != nil || files != 1 || records != 2 {
			t.Fatalf("preview=%v: files=%d records=%d err=%v", preview, files, records, err)
		}
		var images int
		if err := db.QueryRow(`SELECT COUNT(*) FROM "ImageTask" WHERE id = 'old-image'`).Scan(&images); err != nil {
			t.Fatal(err)
		}
		_, fileErr := os.Stat(filepath.Join(root, "old.png"))
		if preview && (images != 1 || fileErr != nil) || !preview && (images != 0 || !os.IsNotExist(fileErr)) {
			t.Fatalf("preview=%v: history=%d file=%v", preview, images, fileErr)
		}
	}
	for _, name := range []string{"old.mp4", "fresh.jpg"} {
		if _, err := os.Stat(filepath.Join(root, name)); err != nil {
			t.Fatal(err)
		}
	}
	var remaining int
	if err := db.QueryRow(`SELECT COUNT(*) FROM "ImageTask"`).Scan(&remaining); err != nil || remaining != 3 {
		t.Fatalf("remaining tasks=%d err=%v", remaining, err)
	}
}
