package workshop

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	"context"
	"path/filepath"
	"strings"
	"testing"
)

func TestListImageTasksTruncatesAndFilters(t *testing.T) {
	db, err := database.OpenWrite(filepath.Join(t.TempDir(), "tasks.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.Exec(`CREATE TABLE "ImageTask" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "productId" TEXT, "prompt" TEXT NOT NULL,
		"taskId" TEXT, "status" TEXT NOT NULL, "resultUrl" TEXT, "failReason" TEXT, "model" TEXT,
		"mediaType" TEXT, "size" TEXT, "quality" TEXT, "createdAt" TEXT NOT NULL
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "Product" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "platform" TEXT NOT NULL, "title" TEXT, "picUrl" TEXT
	)`); err != nil {
		t.Fatal(err)
	}
	longPrompt := strings.Repeat("甲", 130)
	if _, err := db.Exec(`INSERT INTO "Product" ("id","workspaceId","platform","title") VALUES ('p1','local','jd','手机')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "ImageTask" ("id","workspaceId","productId","prompt","status","failReason","createdAt") VALUES
		('a','local','p1',?,'FAILURE',?,'2026-02-01T00:00:00.000Z'),
		('b','local',NULL,'别的提示词','SUCCESS',NULL,'2026-01-01T00:00:00.000Z')`, longPrompt, strings.Repeat("乙", 130)); err != nil {
		t.Fatal(err)
	}
	_, tasks, err := ListImageTasks(context.Background(), db, "local", TaskQuery{Search: "甲", Page: 1, PageSize: 100})
	if err != nil {
		t.Fatal(err)
	}
	if len(tasks) != 1 || tasks[0]["id"] != "a" || tasks[0]["promptSnippet"] == longPrompt {
		t.Fatalf("tasks %#v", tasks)
	}
	if snippet, _ := tasks[0]["promptSnippet"].(string); !strings.HasSuffix(snippet, "…") || len([]rune(snippet)) != 121 {
		t.Fatalf("snippet %q", snippet)
	}
}
