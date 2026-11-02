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

func TestPresetSaveKeepsDefaultOnConflictOrDatabaseFailure(t *testing.T) {
	for _, test := range []struct {
		name   string
		setup  string
		id     string
		status int
	}{
		{"foreign workspace", `INSERT INTO "SalesProductionPreset" VALUES ('foreign','other','其他预设','fashion','{}',1,'old','old')`, "foreign", 409},
		{"write failure", `CREATE TRIGGER reject_insert BEFORE INSERT ON "SalesProductionPreset" BEGIN SELECT RAISE(ABORT,'test write failure'); END`, "new", 500},
		{"default switch failure", `CREATE TRIGGER reject_default BEFORE UPDATE OF "isDefault" ON "SalesProductionPreset" WHEN OLD.id='original' BEGIN SELECT RAISE(ABORT,'test update failure'); END`, "new", 500},
		{"music asset collision", `INSERT INTO "SalesProductionPreset" VALUES ('music','local','配乐','studio_bgm_asset','{}',0,'old','old')`, "music", 409},
	} {
		t.Run(test.name, func(t *testing.T) {
			cfg := setupSalesTestConfig(t)
			db, err := sql.Open("sqlite", cfg.SQLiteFile())
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			if _, err := db.Exec(`INSERT INTO "SalesProductionPreset" VALUES ('original','local','原默认预设','fashion','{}',1,'old','old');` + test.setup); err != nil {
				t.Fatal(err)
			}
			rec := httptest.NewRecorder()
			Presets(cfg).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/sales/presets", strings.NewReader(`{"id":"`+test.id+`","name":"新预设","category":"fashion","isDefault":true,"config":{}}`)))
			if rec.Code != test.status {
				t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
			}
			var def int
			if err := db.QueryRow(`SELECT "isDefault" FROM "SalesProductionPreset" WHERE "id"='original'`).Scan(&def); err != nil || def != 1 {
				t.Fatalf("original default lost: %d %v", def, err)
			}
			var count int
			if err := db.QueryRow(`SELECT count(*) FROM "SalesProductionPreset" WHERE "id"='new'`).Scan(&count); err != nil || count != 0 {
				t.Fatalf("failed save left a partial preset: %d %v", count, err)
			}
		})
	}
}

func TestPresetSaveReplacesDefaultAndPreservesCreationTime(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`INSERT INTO "SalesProductionPreset" VALUES ('original','local','原默认预设','fashion','{}',1,'old','old'),('edited','local','待改预设','fashion','{}',0,'first-created','old')`); err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	Presets(cfg).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/sales/presets", strings.NewReader(`{"id":"edited","name":"新默认预设","category":"fashion","isDefault":true,"config":{"voiceStrategy":"none"}}`)))
	var response struct {
		Item storedPreset `json:"item"`
	}
	if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &response) != nil || response.Item.CreatedAt != "first-created" {
		t.Fatalf("invalid persisted response: %d %s", rec.Code, rec.Body.String())
	}
	var count int
	if err := db.QueryRowContext(context.Background(), `SELECT count(*) FROM "SalesProductionPreset" WHERE "workspaceId"='local' AND "category"='fashion' AND "isDefault"=1`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("expected a single default: %d %v", count, err)
	}
	var originalDefault int
	if err := db.QueryRow(`SELECT "isDefault" FROM "SalesProductionPreset" WHERE "id"='original'`).Scan(&originalDefault); err != nil || originalDefault != 0 {
		t.Fatalf("previous default not replaced: %d %v", originalDefault, err)
	}
}
