package sales

import (
	"database/sql"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

// Seed editable overrides for tests that mutate their stored text directly.
func seedPromptTemplates(t *testing.T, cfg config.Config, workspace string) {
	t.Helper()
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, d := range promptDefinitions() {
		if _, err := db.Exec(`INSERT INTO "SalesPromptOverride" ("workspaceId","promptId","prompt","updatedAt","templateVersion") VALUES (?,?,?,'test',?) ON CONFLICT("workspaceId","promptId") DO NOTHING`, workspace, d.id, d.text, d.resolve(nil).Version); err != nil {
			t.Fatal(err)
		}
	}
}

func setupPromptExecutionTestConfig(t *testing.T) config.Config {
	t.Helper()
	cfg := setupSalesTestConfig(t)
	seedPromptTemplates(t, cfg, "local")
	return cfg
}
