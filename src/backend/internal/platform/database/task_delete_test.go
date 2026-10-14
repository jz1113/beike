package database

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestRemoveImageTasksKeepsReferencedMedia(t *testing.T) {
	db, err := OpenWrite(filepath.Join(t.TempDir(), "tasks.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.Exec(`CREATE TABLE "ImageTask" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "taskId" TEXT, "status" TEXT NOT NULL,
		"resultUrl" TEXT, "prompt" TEXT NOT NULL, "createdAt" TEXT NOT NULL
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "ImageTask" ("id","workspaceId","taskId","status","resultUrl","prompt","createdAt") VALUES
		('a','local','task-a','SUCCESS','/storage/azhuo/a.jpg','提示','2026-01-01T00:00:00.000Z'),
		('b','local','task-b','SUCCESS','/storage/azhuo/a.jpg','提示','2026-01-02T00:00:00.000Z'),
		('c','local','task-c','FAILURE','/storage/azhuo/c.jpg','提示','2026-01-03T00:00:00.000Z'),
		('d','other','task-d','SUCCESS','/storage/azhuo/a.jpg','提示','2026-01-04T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	result, err := RemoveImageTasks(context.Background(), db, "local", TaskRemovalSelection{IDs: []string{"a"}}, nil, root, false)
	if err != nil || result.Count != 1 || result.MediaCleanup.Skipped != 1 || result.MediaCleanup.Deferred != 0 {
		t.Fatalf("referenced %#v err %v", result, err)
	}
	result, err = RemoveImageTasks(context.Background(), db, "local", TaskRemovalSelection{Failed: true}, nil, root, false)
	if err != nil || result.Count != 1 || result.MediaCleanup.Deferred != 1 {
		t.Fatalf("failed %#v err %v", result, err)
	}
	entries, err := os.ReadDir(filepath.Join(root, "local"))
	if err != nil || len(entries) != 1 {
		t.Fatalf("reviews %v err %v", entries, err)
	}
	var left int
	if err := db.QueryRow(`SELECT COUNT(*) FROM "ImageTask" WHERE "workspaceId" = 'other'`).Scan(&left); err != nil || left != 1 {
		t.Fatalf("other workspace %d err %v", left, err)
	}
}
