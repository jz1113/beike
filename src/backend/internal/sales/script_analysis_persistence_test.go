package sales

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/gateway"
)

func TestAnalysisReturnsCompletedScriptWhenDraftStorageFails(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`CREATE TRIGGER reject_analyzed_script BEFORE INSERT ON "SalesReferenceScript" BEGIN SELECT RAISE(ABORT,'test write failure'); END`); err != nil {
		t.Fatal(err)
	}
	calls := 0
	complete := func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
		calls++
		return 200, scriptCompletion(validScript, "stop"), nil
	}
	rec := httptest.NewRecorder()
	scriptAnalysisHandler(cfg, complete, func(string, string) (string, error) { return "data:video/mp4;base64,AA==", nil }).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/sales/script-analysis", strings.NewReader(`{"videoUrl":"/storage/local/source.mp4","model":"gemini-2.5-pro","textProtocol":"gemini"}`)))
	var response struct {
		Success     bool           `json:"success"`
		Script      map[string]any `json:"script"`
		SaveWarning string         `json:"saveWarning"`
		ExistingID  string         `json:"existingId"`
		VideoHash   string         `json:"videoHash"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if rec.Code != 200 || !response.Success || response.SaveWarning == "" || response.ExistingID != "" || response.Script == nil {
		t.Fatalf("lost completed analysis: %d %s", rec.Code, rec.Body.String())
	}
	if _, err := validateScriptObject(response.Script); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`DROP TRIGGER reject_analyzed_script`); err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(map[string]any{"videoUrl": "/storage/local/source.mp4", "videoHash": response.VideoHash, "script": response.Script})
	save := httptest.NewRecorder()
	Scripts(cfg).ServeHTTP(save, httptest.NewRequest(http.MethodPost, "/api/sales/scripts", strings.NewReader(string(body))))
	if save.Code != 200 || calls != 1 {
		t.Fatalf("must allow saving completed script without another model call: %d calls=%d %s", save.Code, calls, save.Body.String())
	}
}
