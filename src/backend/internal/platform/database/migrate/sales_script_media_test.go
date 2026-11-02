package migrate

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
)

func TestScriptMediaMigrationRetainsExistingScripts(t *testing.T) {
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "scripts.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	if err := execScript(ctx, db, sourceText("sales_reference_scripts.sql"), false); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "SalesReferenceScript" ("id","workspaceId","title","videoUrl","videoHash","scriptJson","status","createdAt","updatedAt") VALUES ('existing','local','保留原脚本','/storage/local/original.mp4','hash','{"original":true}','verified','created','updated')`); err != nil {
		t.Fatal(err)
	}
	if err := execScript(ctx, db, sourceText("sales_script_media.sql"), false); err != nil {
		t.Fatal(err)
	}
	var title, video, raw, status, depth, task, operation string
	if err := db.QueryRow(`SELECT "title","videoUrl","scriptJson","status","depthVideoUrl","depthTaskId","depthOperationId" FROM "SalesReferenceScript" WHERE "id"='existing'`).Scan(&title, &video, &raw, &status, &depth, &task, &operation); err != nil {
		t.Fatal(err)
	}
	if title != "保留原脚本" || video != "/storage/local/original.mp4" || raw != `{"original":true}` || status != "verified" || depth != "" || task != "" || operation != "" {
		t.Fatalf("migration changed existing script: %q %q %q %q %q %q %q", title, video, raw, status, depth, task, operation)
	}
}
