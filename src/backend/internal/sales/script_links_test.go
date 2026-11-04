package sales

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestScriptDepthReceiptPreservesConcurrentReview(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	create := httptest.NewRecorder()
	Scripts(cfg).ServeHTTP(create, httptest.NewRequest(http.MethodPost, "/api/sales/scripts", strings.NewReader(`{"id":"linked","videoUrl":"/storage/local/source.mp4","script":`+validScript+`}`)))
	if create.Code != 200 {
		t.Fatal(create.Body.String())
	}
	body := &interleavedScriptBody{reader: strings.NewReader(`{"depthVideoUrl":"/storage/local/depth.mp4","depthOperationId":"operation-1"}`), before: func() {
		if _, err := db.Exec(`UPDATE "SalesReferenceScript" SET "title"='已确认新脚本',"status"='verified',"version"=5 WHERE "id"='linked'`); err != nil {
			t.Fatal(err)
		}
	}}
	rec := httptest.NewRecorder()
	patchReferenceScript(rec, httptest.NewRequest(http.MethodPatch, "/api/sales/scripts/linked", body), db, "local", "linked")
	var response struct {
		Item storedReferenceScript `json:"item"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &response)
	if rec.Code != 200 || response.Item.Status != "verified" || response.Item.Version != 5 || response.Item.Title != "已确认新脚本" || response.Item.DepthVideoURL != "/storage/local/depth.mp4" || response.Item.VideoURL != "/storage/local/source.mp4" {
		t.Fatalf("receipt overwrote review or lost media: %d %s", rec.Code, rec.Body.String())
	}
	// A full save from an older editor omits new fields; those linked results stay.
	replace := httptest.NewRecorder()
	Scripts(cfg).ServeHTTP(replace, httptest.NewRequest(http.MethodPost, "/api/sales/scripts", strings.NewReader(`{"id":"linked","script":`+validScript+`}`)))
	_ = json.Unmarshal(replace.Body.Bytes(), &response)
	if replace.Code != 200 || response.Item.DepthVideoURL != "/storage/local/depth.mp4" || response.Item.VideoURL != "/storage/local/source.mp4" {
		t.Fatalf("old editor lost media: %s", replace.Body.String())
	}

	body = &interleavedScriptBody{reader: strings.NewReader(`{"status":"verified"}`), before: func() {
		if _, err := db.Exec(`UPDATE "SalesReferenceScript" SET "depthVideoUrl"='/storage/local/new-depth.mp4' WHERE "id"='linked'`); err != nil {
			t.Fatal(err)
		}
	}}
	rec = httptest.NewRecorder()
	patchReferenceScript(rec, httptest.NewRequest(http.MethodPatch, "/api/sales/scripts/linked", body), db, "local", "linked")
	_ = json.Unmarshal(rec.Body.Bytes(), &response)
	if rec.Code != 200 || response.Item.DepthVideoURL != "/storage/local/new-depth.mp4" {
		t.Fatalf("review overwrote conversion: %s", rec.Body.String())
	}
}

func TestScriptMediaLinksCheckWorkspaceAndRegisteredRemoteResults(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`CREATE TABLE "ActionAsset" ("workspaceId" TEXT,"mediaType" TEXT,"mediaUrl" TEXT);
CREATE TABLE "ImageTask" ("id" TEXT,"workspaceId" TEXT,"mediaType" TEXT,"status" TEXT,"resultUrl" TEXT);
INSERT INTO "ActionAsset" VALUES ('a','depth-video','https://cdn.example/owned.mp4'),('b','depth-video','https://cdn.example/foreign.mp4');
INSERT INTO "ImageTask" VALUES ('task-a','a','depth-video','SUCCESS','https://cdn.example/result.mp4'),('task-b','b','depth-video','SUCCESS','https://cdn.example/foreign-result.mp4');`)
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range []struct {
		source, depth, task string
		allowed             bool
	}{
		{"/storage/a/source.mp4", "/storage/a/depth.mp4", "task-a", true},
		{"", "https://cdn.example/owned.mp4", "", true},
		{"", "https://cdn.example/result.mp4", "task-a", true},
		{"/storage/b/source.mp4", "", "", false},
		{"/storage/a/../b/source.mp4", "", "", false},
		{"/storage/a/%2e%2e/b/source.mp4", "", "", false},
		{"", "https://cdn.example/foreign.mp4", "", false},
		{"", "https://cdn.example/unregistered.mp4", "", false},
		{"", "/storage/a/depth.mp4", "task-b", false},
	} {
		err := validateScriptLinks(context.Background(), db, "a", row.source, row.depth, row.task, "operation")
		if (err == nil) != row.allowed {
			t.Fatalf("%+v: %v", row, err)
		}
	}
}

func TestAnalyzedScriptPersistsAndReusesWithoutOverwritingReview(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	var script map[string]any
	_ = json.Unmarshal([]byte(validScript), &script)
	first, err := persistAnalyzedScript(cfg, "local", "/storage/local/source.mp4", "hash", "model", "prompt", "route", script, false)
	if err != nil {
		t.Fatal(err)
	}
	if first.Status != "verified" {
		t.Fatalf("new analysis is not ready for use: %s", first.Status)
	}
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`UPDATE "SalesReferenceScript" SET "title"='手动草稿',"status"='draft' WHERE "id"=?`, first.ID); err != nil {
		t.Fatal(err)
	}
	second, err := persistAnalyzedScript(cfg, "local", "/storage/local/source.mp4", "hash", "model", "prompt", "route", script, false)
	if err != nil || second.ID != first.ID || second.Status != "draft" || second.Title != "手动草稿" {
		t.Fatalf("repeat analysis overwrote review: %+v %v", second, err)
	}
	forced, err := persistAnalyzedScript(cfg, "local", "/storage/local/source.mp4", "hash", "model", "prompt", "route", script, true)
	if err != nil || forced.ID == first.ID || forced.Status != "verified" {
		t.Fatalf("forced reanalysis must save a fresh verified script: %+v %v", forced, err)
	}
}
