package workshop

import (
	"database/sql"
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database/migrate"
	"beike.local/cloud/src/backend/internal/platform/taskrecords"
)

func TestTaskRecordsListsOnlyWorkshopImageReceipts(t *testing.T) {
	file := filepath.Join(t.TempDir(), "records.db")
	if err := migrate.Run(file, t.TempDir(), false); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", file)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`INSERT INTO WorkshopBatch(id,workspaceId,name,status,revision,snapshotJson,createdAt,updatedAt) VALUES('batch_demo','w','示例批次','draft',1,'{"items":[{"id":"content1","title":"本批商品"}]}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`)
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range [][]string{{"grid", "w", "batch_demo:content1:1:1:hash"}, {"external", "w", "other-key"}, {"foreign", "other", "batch_demo:content1:1:1:hash"}} {
		_, err = db.Exec(`INSERT INTO ImageTask(id,workspaceId,idempotencyKey,taskId,prompt,model,status,mediaType,updatedAt) VALUES(?,?,?,?,'prompt','model','SUCCESS','image',CURRENT_TIMESTAMP)`, row[0], row[1], row[2], "channel-"+row[0])
		if err != nil {
			t.Fatal(err)
		}
	}
	req := httptest.NewRequest("GET", "/api/workshop/task-records", nil)
	resp := httptest.NewRecorder()
	TaskRecords(config.Config{DatabaseURL: "file:" + file}).ServeHTTP(resp, req.WithContext(httpx.WithWorkspace(req.Context(), "w")))
	var body struct {
		Records []taskrecords.Record
		Total   int
	}
	if resp.Code != 200 || json.Unmarshal(resp.Body.Bytes(), &body) != nil || body.Total != 1 || body.Records[0].Name != "示例批次 · 本批商品" || body.Records[0].Status != "completed" {
		t.Fatal(resp.Code, resp.Body.String())
	}
	// Older batches may retain slices or runs even without an ImageTask receipt.
	// Do not show four duplicate grid submissions or double-count the known receipt.
	_, err = db.Exec(`UPDATE WorkshopBatch SET snapshotJson='{"items":[{"id":"content1","title":"商品","tasks":[{"id":"slice1","gridTaskKey":"old-grid","status":"SUCCESS"},{"id":"slice2","gridTaskKey":"old-grid","status":"FAILURE","error":"图片保存失败"},{"id":"known","idempotencyKey":"batch_demo:content1:1:1:hash","status":"SUCCESS"}]}],"pipeline":{"runs":[{"id":"export1","kind":"export","status":"completed","totalTasks":2,"completedTasks":2}]}}' WHERE id='batch_demo'`)
	if err != nil {
		t.Fatal(err)
	}
	resp = httptest.NewRecorder()
	TaskRecords(config.Config{DatabaseURL: "file:" + file}).ServeHTTP(resp, req.WithContext(httpx.WithWorkspace(req.Context(), "w")))
	if resp.Code != 200 || json.Unmarshal(resp.Body.Bytes(), &body) != nil || body.Total != 3 {
		t.Fatal(resp.Code, resp.Body.String())
	}
	for _, record := range body.Records {
		if record.ID == "old-grid" && (record.Status != "partial" || record.Error != "图片保存失败" || record.Created != "") {
			t.Fatal(record)
		}
	}

}
