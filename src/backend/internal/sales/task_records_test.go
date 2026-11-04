package sales

import (
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/taskrecords"
	"database/sql"
	"encoding/json"
	"net/http/httptest"
	"testing"
)

func TestTaskRecordsSearchesStoredMediaAcrossPagesAndWorkspaces(t *testing.T) {
	cfg := mediaJobConfig(t)
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for i := range 24 {
		workspace := "active"
		if i == 23 {
			workspace = "other"
		}
		_, err = db.Exec(`INSERT INTO SalesMediaJob(id,workspaceId,kind,name,inputKey,status,createdAt,startedAt,updatedAt,retryInput,result,error)
  VALUES('test-'||?,?,'video','商品演示','key','failed','2026-11-03T22:00:00Z','2026-11-03T22:00:01Z','2026-11-03T22:01:00Z','{"selection":"demo-model"}','{"taskId":"channel-1"}','失败原因')`, i, workspace)
		if err != nil {
			t.Fatal(err)
		}
	}
	req := httptest.NewRequest("GET", "/api/sales/task-records?kind=video&model=demo-model&q=channel-1&status=failed&from=2026-11-03T00:00:00Z&until=2026-11-04T00:00:00Z&page=2&size=10", nil)
	resp := httptest.NewRecorder()
	TaskRecords(cfg).ServeHTTP(resp, req.WithContext(httpx.WithWorkspace(req.Context(), "active")))
	var body struct {
		Records     []taskrecords.Record
		Models      []string
		Total, Page int
	}
	if resp.Code != 200 || json.Unmarshal(resp.Body.Bytes(), &body) != nil || body.Total != 23 || body.Page != 2 || len(body.Models) != 1 || body.Models[0] != "demo-model" || len(body.Records) != 10 || body.Records[0].External != "channel-1" {
		t.Fatal(resp.Code, resp.Body.String())
	}
}
