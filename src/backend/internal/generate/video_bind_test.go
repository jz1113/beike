package generate

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func TestVideoBindOnlyAttachesUnknownReceipts(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "videos.db")
	db, err := database.OpenWrite(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	workspace := workspaceOf(httptest.NewRequest(http.MethodPost, "/", nil))
	if _, err = db.Exec(`CREATE TABLE "ImageTask" (
		"id" TEXT, "workspaceId" TEXT, "productId" TEXT, "prompt" TEXT, "taskId" TEXT, "status" TEXT,
		"resultUrl" TEXT, "failReason" TEXT, "model" TEXT, "mediaType" TEXT, "size" TEXT, "quality" TEXT,
		"idempotencyKey" TEXT, "createdAt" TEXT, "updatedAt" TEXT
	)`); err != nil {
		t.Fatal(err)
	}
	for _, row := range [][]any{
		{"video_a_x", "pending_a", "SUBMISSION_UNKNOWN", "unknown-key"},
		{"video_b_x", "vid-ok", "IN_PROGRESS", "accepted-key"},
	} {
		if _, err = db.Exec(`INSERT INTO "ImageTask" ("id","workspaceId","prompt","taskId","status","failReason","mediaType","idempotencyKey","createdAt","updatedAt")
			VALUES (?, ?, 'p', ?, ?, '视频提交响应未确认', 'video', ?, '2026-01-01', '2026-01-01')`, row[0], workspace, row[1], row[2], row[3]); err != nil {
			t.Fatal(err)
		}
	}
	_ = db.Close()
	handler := VideoBind(config.Config{DatabaseURL: "file:" + dbPath, NodeEnv: "development"})
	bind := func(body string) *httptest.ResponseRecorder {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/video/bind", strings.NewReader(body)))
		return response
	}
	if response := bind(`{"taskKey":"unknown-key","taskId":"pending_x"}`); response.Code != http.StatusBadRequest {
		t.Fatalf("pending id accepted %d %s", response.Code, response.Body.String())
	}
	if response := bind(`{"taskKey":"unknown-key","taskId":"vid-found"}`); response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"taskId":"vid-found"`) || !strings.Contains(response.Body.String(), `"status":"IN_PROGRESS"`) {
		t.Fatalf("bind %d %s", response.Code, response.Body.String())
	}
	if response := bind(`{"taskKey":"unknown-key","taskId":"vid-other"}`); response.Code != http.StatusConflict {
		t.Fatalf("rebind %d %s", response.Code, response.Body.String())
	}
	if response := bind(`{"taskKey":"accepted-key","taskId":"vid-other"}`); response.Code != http.StatusConflict {
		t.Fatalf("accepted bind %d %s", response.Code, response.Body.String())
	}
}
