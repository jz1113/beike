package generate

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestLateSuccessRecoversOnlyItsFailedReceipt(t *testing.T) {
	for _, usage := range []string{"", `{"totalTokens":12}`} {
		t.Run("usage="+usage, func(t *testing.T) {
			server := httptest.NewServer(http.NotFoundHandler())
			defer server.Close()
			cfg := videoSubmissionTestConfig(t, server)
			db, err := openTaskDB(cfg)
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			_, err = db.Exec(`ALTER TABLE "ImageTask" ADD COLUMN "usage" TEXT;
				INSERT INTO "ImageTask" ("id","workspaceId","taskId","status","mediaType","failReason") VALUES
				('owned','owner','same-task','FAILURE','video','old timeout'),
				('other','other','same-task','FAILURE','video','old timeout'),
				('image','owner','same-task','FAILURE','image','old timeout')`)
			if err != nil {
				t.Fatal(err)
			}
			ctx := context.Background()
			scope := taskScope{"owner", "video"}
			updateTaskTerminal(ctx, db, scope, "same-task", "SUCCESS", "", "", usage)
			status, _, _, _, _, _ := taskStatus(ctx, db, scope, "same-task")
			if status != "FAILURE" {
				t.Fatal("a success without a result recovered the failed receipt")
			}
			updateTaskTerminal(ctx, db, scope, "same-task", "SUCCESS", "/storage/recovered.mp4", "", usage)
			updateTaskTerminal(ctx, db, scope, "same-task", "FAILURE", "", "late failed response", "")
			status, result, reason, storedUsage, _, err := taskStatus(ctx, db, scope, "same-task")
			if err != nil || status != "SUCCESS" || result != "/storage/recovered.mp4" || reason != "" || storedUsage != usage {
				t.Fatalf("completion was lost: %s %s %s %s %v", status, result, reason, storedUsage, err)
			}
			var changed int
			err = db.QueryRow(`SELECT COUNT(*) FROM "ImageTask" WHERE "id" != 'owned' AND ("status" != 'FAILURE' OR "resultUrl" IS NOT NULL OR "usage" IS NOT NULL)`).Scan(&changed)
			if err != nil || changed != 0 {
				t.Fatalf("unrelated receipts changed: %d %v", changed, err)
			}
		})
	}
}
