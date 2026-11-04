package sales

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"testing"
)

func TestScriptCompletionRejectsPerformanceDataThatWouldBeLost(t *testing.T) {
	for _, field := range []string{"expression", "transition"} {
		for _, value := range []any{map[string]any{"eyes": "先抬眼再垂眼"}, []string{"浅笑", "回落"}, true, 42, strings.Repeat("字", 601)} {
			var script map[string]any
			if err := json.Unmarshal([]byte(validScript), &script); err != nil {
				t.Fatal(err)
			}
			beat := script["shots"].([]any)[0].(map[string]any)["beats"].([]any)[0].(map[string]any)
			beat[field] = value
			raw, _ := json.Marshal(script)
			if _, err := parseScriptCompletion(scriptCompletion(string(raw), "stop")); err == nil {
				t.Fatalf("accepted malformed %s: %T", field, value)
			}
		}
	}
	var script map[string]any
	_ = json.Unmarshal([]byte(validScript), &script)
	beat := script["shots"].([]any)[0].(map[string]any)["beats"].([]any)[0].(map[string]any)
	beat["expression"], beat["transition"] = strings.Repeat("表", 600), strings.Repeat("接", 400)
	raw, _ := json.Marshal(script)
	parsed, err := parseScriptCompletion(scriptCompletion(string(raw), "stop"))
	if err != nil {
		t.Fatal("valid performance data rejected", err)
	}
	actual := parsed["shots"].([]any)[0].(map[string]any)["beats"].([]any)[0].(map[string]any)
	if actual["expression"] != beat["expression"] || actual["transition"] != beat["transition"] {
		t.Fatal("performance data was truncated")
	}
}

func TestInvalidCachedPerformanceIsReplacedWithoutOverwritingHistory(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	var script map[string]any
	_ = json.Unmarshal([]byte(validScript), &script)
	first, err := persistAnalyzedScript(cfg, "local", "", "hash", "model", "prompt", "route", script, false)
	if err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	// Reproduce a historical response previously accepted as the current-version cache.
	broken := strings.Replace(validScript, `"action":"坐姿看镜头"`, `"action":"坐姿看镜头","expression":{"eyes":"抬眼"}`, 1)
	if _, err := db.Exec(`UPDATE "SalesReferenceScript" SET "scriptJson"=?,"status"='verified' WHERE "id"=?`, broken, first.ID); err != nil {
		t.Fatal(err)
	}
	if cached := lookupCachedScriptAnalysis(context.Background(), cfg.SQLiteFile(), "local", "hash", "prompt", "route"); cached != nil {
		t.Fatal("invalid performance cache was reused")
	}
	second, err := persistAnalyzedScript(cfg, "local", "", "hash", "model", "prompt", "route", script, false)
	if err != nil || second.ID == first.ID {
		t.Fatal("replacement did not get its own saved row", second.ID, err)
	}
	if _, err := validateScriptObject(second.Script); err != nil {
		t.Fatal("replacement content is invalid", err)
	}
	if cached := lookupCachedScriptAnalysis(context.Background(), cfg.SQLiteFile(), "local", "hash", "prompt", "route"); cached == nil || cached.ID != second.ID {
		t.Fatal("historical invalid cache hid the valid replacement", cached)
	}
	var preserved, status string
	if err := db.QueryRow(`SELECT "scriptJson","status" FROM "SalesReferenceScript" WHERE "id"=?`, first.ID).Scan(&preserved, &status); err != nil || preserved != broken || status != "verified" {
		t.Fatal("historical confirmed script was overwritten", err)
	}
}
