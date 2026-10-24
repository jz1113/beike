package generate

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestImageRecheckKeepsSavedSuccess(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("saved image recovery must not query upstream: %s", r.URL)
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	db, err := openTaskDB(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`ALTER TABLE "ImageTask" ADD COLUMN "usage" TEXT;
		INSERT INTO "ImageTask" ("id", "workspaceId", "taskId", "status", "resultUrl")
		VALUES ('saved', 'local', 'original-image', 'SUCCESS', '/storage/generated/original.png')`)
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/api/generate/image?taskId=original-image&recheck_failed=1", nil)
	body, status, ok := savedTerminal(cfg, request, "original-image", "failed")
	if !ok || status != http.StatusOK || body["status"] != "SUCCESS" || body["resultUrl"] != "/storage/generated/original.png" {
		t.Fatalf("saved image not recovered: %v %d %v", body, status, ok)
	}
	_, err = db.Exec(`UPDATE "ImageTask" SET "status" = 'FAILURE', "resultUrl" = NULL, "failReason" = 'old failure'`)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, ok := savedTerminal(cfg, request, "original-image", "failed"); ok {
		t.Fatal("explicit failed-task recheck must reach upstream")
	}
}
