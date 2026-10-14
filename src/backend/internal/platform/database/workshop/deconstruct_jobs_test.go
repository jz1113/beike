package workshop

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	"context"
	"path/filepath"
	"testing"
)

func TestListDeconstructJobsOmitsItemPayload(t *testing.T) {
	db, err := database.OpenWrite(filepath.Join(t.TempDir(), "jobs.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.Exec(`CREATE TABLE "DeconstructJob" (
		"jobId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "status" TEXT NOT NULL, "configJson" TEXT NOT NULL,
		"concurrency" INTEGER NOT NULL, "reviewBeforeSave" INTEGER NOT NULL, "error" TEXT,
		"createdAt" TEXT NOT NULL, "updatedAt" TEXT NOT NULL, "finishedAt" TEXT
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "DeconstructJobItem" (
		"workspaceId" TEXT NOT NULL, "jobId" TEXT NOT NULL, "position" INTEGER NOT NULL,
		"inputJson" TEXT NOT NULL, "status" TEXT NOT NULL, "progressJson" TEXT, "resultJson" TEXT,
		"error" TEXT, "startedAt" TEXT, "finishedAt" TEXT
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "DeconstructJob" ("jobId","workspaceId","status","configJson","concurrency","reviewBeforeSave","createdAt","updatedAt") VALUES
		('running-job','local','running','{"model":"vision"}',2,1,'2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z'),
		('done-job','local','completed','{"model":"vision"}',1,0,'2026-02-01T00:00:00.000Z','2026-02-01T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "DeconstructJobItem" ("workspaceId","jobId","position","inputJson","status","resultJson") VALUES
		('local','done-job',0,'{"id":"item","customSubCategories":["x"]}','completed','{"ok":true,"data":{"secret":1}}')`); err != nil {
		t.Fatal(err)
	}
	jobs, err := ListDeconstructJobs(context.Background(), db, "local", "")
	if err != nil || len(jobs) != 2 || jobs[0]["jobId"] != "running-job" {
		t.Fatalf("jobs %#v err %v", jobs, err)
	}
	done := jobs[1]
	items, _ := done["items"].([]any)
	item, _ := items[0].(map[string]any)
	result, _ := item["result"].(map[string]any)
	if _, hidden := item["customSubCategories"]; hidden || result["data"] != nil {
		t.Fatalf("item %#v", item)
	}
}
