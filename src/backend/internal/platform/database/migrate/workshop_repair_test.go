package migrate

import (
	"context"
	"database/sql"
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"
)

func TestWorkshopRepairUsesExplicitEvidenceAndKeepsOtherFields(t *testing.T) {
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "repair.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, schema := range []string{
		`CREATE TABLE "CategorySkillScope" ("minSamples" INTEGER, "autoAnalyze" INTEGER, "lastAttempt" TEXT)`,
		`INSERT INTO "CategorySkillScope" VALUES (20,1,'old')`,
		`CREATE TABLE "AssetProductCategory" ("id" TEXT, "isArchived" INTEGER)`,
		`INSERT INTO "AssetProductCategory" VALUES ('prompt_subcategory:digital_3c:case',0)`,
		`CREATE TABLE "FullPromptAsset" ("id" TEXT, "shotPromptsJson" TEXT, "productCategoryIds" TEXT, "productSubcategory" TEXT, "hasHuman" INTEGER, "userNote" TEXT)`,
	} {
		if _, err := db.Exec(schema); err != nil {
			t.Fatal(err)
		}
	}
	shots := []map[string]any{}
	for n := 1; n <= 4; n++ {
		shots = append(shots, map[string]any{"shot_no": n, "shot_type": "model_shot", "has_human": true, "prompt": "【主体】一只手托着手机壳\n【发型与面部】没有人物面部和头发，只有局部手部\n【动作或摆放】手持手机壳"})
	}
	raw, _ := json.Marshal(shots)
	if _, err := db.Exec(`INSERT INTO "FullPromptAsset" VALUES ('case',?,'["digital_3c"]','phone',1,'keep user note')`, string(raw)); err != nil {
		t.Fatal(err)
	}
	if err := applyWorkshopRepair(context.Background(), db); err != nil {
		t.Fatal(err)
	}
	var sub, repaired, note string
	var human, automatic, minimum int
	if err := db.QueryRow(`SELECT "productSubcategory","shotPromptsJson","hasHuman","userNote" FROM "FullPromptAsset"`).Scan(&sub, &repaired, &human, &note); err != nil {
		t.Fatal(err)
	}
	if sub != "case" || human != 0 || !strings.Contains(repaired, "hand_held_only") || note != "keep user note" {
		t.Fatalf("%s %d %s %s", sub, human, repaired, note)
	}
	if err := db.QueryRow(`SELECT "autoAnalyze","minSamples" FROM "CategorySkillScope"`).Scan(&automatic, &minimum); err != nil {
		t.Fatal(err)
	}
	if automatic != 0 || minimum != 1 {
		t.Fatal("old automatic high-threshold behavior retained")
	}
	if err := applyWorkshopRepair(context.Background(), db); err != nil {
		t.Fatal("repair is not repeatable", err)
	}
}
