package sales

import (
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Delay the request body until another operation has changed the record that
// PATCH already read, so the interleaving is deterministic without goroutine sleeps.
type interleavedScriptBody struct {
	reader io.Reader
	before func()
}

func (body *interleavedScriptBody) Read(data []byte) (int, error) {
	if body.before != nil {
		before := body.before
		body.before = nil
		before()
	}
	return body.reader.Read(data)
}

func TestScriptUsagePreservesConcurrentEdits(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	create := httptest.NewRecorder()
	Scripts(cfg).ServeHTTP(create, httptest.NewRequest(http.MethodPost, "/api/sales/scripts", strings.NewReader(`{"id":"concurrent","title":"原脚本","script":`+validScript+`}`)))
	if create.Code != 200 {
		t.Fatal(create.Body.String())
	}
	updatedScript := strings.Replace(validScript, "起身转身", "展示袖口", 1)
	body := &interleavedScriptBody{reader: strings.NewReader(`{"recordUse":true}`), before: func() {
		_, err := db.Exec(`UPDATE "SalesReferenceScript" SET "title"='已重新归类',"status"='verified',"scriptJson"=?,"version"=2,"useCount"=3 WHERE "id"='concurrent'`, updatedScript)
		if err != nil {
			t.Fatal(err)
		}
	}}
	rec := httptest.NewRecorder()
	patchReferenceScript(rec, httptest.NewRequest(http.MethodPatch, "/api/sales/scripts/concurrent", body), db, "local", "concurrent")
	var response struct {
		Item storedReferenceScript `json:"item"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &response)
	raw, _ := json.Marshal(response.Item.Script)
	if rec.Code != 200 || response.Item.Title != "已重新归类" || response.Item.Status != "verified" || response.Item.Version != 2 || response.Item.UseCount != 4 || !strings.Contains(string(raw), "展示袖口") {
		t.Fatalf("recording use overwrote a concurrent edit: %d %s", rec.Code, rec.Body.String())
	}
}

func TestScriptEditsPreserveConcurrentUsage(t *testing.T) {
	for _, recordUse := range []bool{false, true} {
		t.Run(map[bool]string{false: "edit", true: "edit-and-use"}[recordUse], func(t *testing.T) {
			cfg := setupSalesTestConfig(t)
			db, err := sql.Open("sqlite", cfg.SQLiteFile())
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			create := httptest.NewRecorder()
			Scripts(cfg).ServeHTTP(create, httptest.NewRequest(http.MethodPost, "/api/sales/scripts", strings.NewReader(`{"id":"concurrent","script":`+validScript+`}`)))
			if create.Code != 200 {
				t.Fatal(create.Body.String())
			}
			var script map[string]any
			_ = json.Unmarshal([]byte(validScript), &script)
			raw, _ := json.Marshal(map[string]any{"script": script, "recordUse": recordUse})
			body := &interleavedScriptBody{reader: strings.NewReader(string(raw)), before: func() {
				if _, err := db.Exec(`UPDATE "SalesReferenceScript" SET "useCount"=3,"lastUsedAt"='concurrent-use' WHERE "id"='concurrent'`); err != nil {
					t.Fatal(err)
				}
			}}
			rec := httptest.NewRecorder()
			patchReferenceScript(rec, httptest.NewRequest(http.MethodPatch, "/api/sales/scripts/concurrent", body), db, "local", "concurrent")
			var response struct {
				Item storedReferenceScript `json:"item"`
			}
			_ = json.Unmarshal(rec.Body.Bytes(), &response)
			wantCount := 3
			if recordUse {
				wantCount++
			}
			if rec.Code != 200 || response.Item.UseCount != wantCount || response.Item.Version != 2 || (!recordUse && response.Item.LastUsedAt != "concurrent-use") {
				t.Fatalf("editing reset concurrent use statistics: %d %s", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestScriptUsageReportsConcurrentDeletion(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	create := httptest.NewRecorder()
	Scripts(cfg).ServeHTTP(create, httptest.NewRequest(http.MethodPost, "/api/sales/scripts", strings.NewReader(`{"id":"concurrent","script":`+validScript+`}`)))
	if create.Code != 200 {
		t.Fatal(create.Body.String())
	}
	body := &interleavedScriptBody{reader: strings.NewReader(`{"recordUse":true}`), before: func() {
		if _, err := db.Exec(`DELETE FROM "SalesReferenceScript" WHERE "id"='concurrent'`); err != nil {
			t.Fatal(err)
		}
	}}
	rec := httptest.NewRecorder()
	patchReferenceScript(rec, httptest.NewRequest(http.MethodPatch, "/api/sales/scripts/concurrent", body), db, "local", "concurrent")
	if rec.Code != 404 {
		t.Fatalf("concurrent deletion must not return an empty successful record: %d %s", rec.Code, rec.Body.String())
	}
}
