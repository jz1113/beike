package migrate

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

const (
	salesProductsVersion       = "20261101_04_sales_products"
	salesProductsChecksum      = "d4d1662678a00d3637cefdc74d70ac4bfc3e7ce099a9fd12b5f5543916f69c31"
	salesProductsShortChecksum = "4302ee43d4b71f31bb17a7a359fcff9863688987cbe66e46f7e274404a8e2db3"
)

func TestSalesProductsChecksumsDifferOnlyByTrailingBlankLine(t *testing.T) {
	source := sourceText("sales_products.sql")
	withoutBlankLine := strings.TrimRight(source, "\n") + "\n"
	withBlankLine := withoutBlankLine + "\n"
	if sha256Hex(withoutBlankLine) != salesProductsShortChecksum {
		t.Fatal("published single-newline source changed")
	}
	if sha256Hex(withBlankLine) != salesProductsChecksum {
		t.Fatal("published trailing-blank-line source changed")
	}
	if source != withBlankLine {
		t.Fatal("restored published source must retain its trailing blank line")
	}
}

func TestSalesProductsMigrationLedgerCompatibilityPreservesUserData(t *testing.T) {
	for _, test := range []struct {
		name, version, checksum string
		accepted                bool
	}{
		{"published", salesProductsVersion, salesProductsChecksum, true},
		{"without trailing blank line", salesProductsVersion, salesProductsShortChecksum, true},
		{"unknown checksum", salesProductsVersion, strings.Repeat("0", 64), false},
		{"unknown version", "20990101_01_unknown", salesProductsChecksum, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			root := t.TempDir()
			path := filepath.Join(root, "products.db")
			db, err := sql.Open("sqlite", path)
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			if err := applyPending(context.Background(), db, mustMigrations()); err != nil {
				t.Fatal(err)
			}
			if _, err := db.Exec(`INSERT INTO "SalesProduct"
				("id","workspaceId","title","productUrl","coverUrl","imageCount","outputCount","draftJson","createdAt","updatedAt")
				VALUES ('user-product','user-workspace','保留商品','https://example.com/product','/storage/user.jpg',3,2,'{"custom":"保留草稿"}','created','updated')`); err != nil {
				t.Fatal(err)
			}
			if _, err := db.Exec(`UPDATE "_BeikeMigration" SET "version"=?, "checksum"=? WHERE "version"=?`, test.version, test.checksum, salesProductsVersion); err != nil {
				t.Fatal(err)
			}
			productsBefore := salesProductsTestRows(t, db, `SELECT * FROM "SalesProduct" ORDER BY "id"`)
			ledgerBefore := salesProductsTestRows(t, db, `SELECT * FROM "_BeikeMigration" ORDER BY "version"`)
			err = Run(path, root, false)
			if test.accepted {
				if err != nil {
					t.Fatalf("known equivalent checksum rejected: %v", err)
				}
			} else if err == nil || !strings.Contains(err.Error(), "Database migration version mismatch: "+test.version) {
				t.Fatalf("unknown migration must be rejected, got %v", err)
			}
			if after := salesProductsTestRows(t, db, `SELECT * FROM "SalesProduct" ORDER BY "id"`); !reflect.DeepEqual(productsBefore, after) {
				t.Fatalf("user product changed: before=%v after=%v", productsBefore, after)
			}
			if after := salesProductsTestRows(t, db, `SELECT * FROM "_BeikeMigration" ORDER BY "version"`); !reflect.DeepEqual(ledgerBefore, after) {
				t.Fatalf("migration ledger was rewritten: before=%v after=%v", ledgerBefore, after)
			}
		})
	}
}

func salesProductsTestRows(t *testing.T, db *sql.DB, query string) [][]any {
	t.Helper()
	rows, err := db.Query(query)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	columns, err := rows.Columns()
	if err != nil {
		t.Fatal(err)
	}
	var result [][]any
	for rows.Next() {
		values := make([]any, len(columns))
		pointers := make([]any, len(columns))
		for i := range values {
			pointers[i] = &values[i]
		}
		if err := rows.Scan(pointers...); err != nil {
			t.Fatal(err)
		}
		result = append(result, values)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	return result
}

func TestScriptMediaMigrationRetainsExistingScripts(t *testing.T) {
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "scripts.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	if err := execScript(ctx, db, sourceText("sales_reference_scripts.sql"), false); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "SalesReferenceScript" ("id","workspaceId","title","videoUrl","videoHash","scriptJson","status","createdAt","updatedAt") VALUES ('existing','local','保留原脚本','/storage/local/original.mp4','hash','{"original":true}','verified','created','updated')`); err != nil {
		t.Fatal(err)
	}
	if err := execScript(ctx, db, sourceText("sales_script_media.sql"), false); err != nil {
		t.Fatal(err)
	}
	var title, video, raw, status, depth, task, operation string
	if err := db.QueryRow(`SELECT "title","videoUrl","scriptJson","status","depthVideoUrl","depthTaskId","depthOperationId" FROM "SalesReferenceScript" WHERE "id"='existing'`).Scan(&title, &video, &raw, &status, &depth, &task, &operation); err != nil {
		t.Fatal(err)
	}
	if title != "保留原脚本" || video != "/storage/local/original.mp4" || raw != `{"original":true}` || status != "verified" || depth != "" || task != "" || operation != "" {
		t.Fatalf("migration changed existing script: %q %q %q %q %q %q %q", title, video, raw, status, depth, task, operation)
	}
}

func TestImageTaskRouteUpgradePreservesLegacyReceipt(t *testing.T) {
	root := filepath.Clean(filepath.Join("..", "..", "..", "..", "..", ".."))
	path := filepath.Join(t.TempDir(), "legacy-route.db")
	if err := Run(path, root, false); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	// Recreate the immediately preceding schema and migration ledger, then upgrade.
	_, err = db.Exec(`ALTER TABLE "ImageTask" DROP COLUMN "routeFingerprint";
  DELETE FROM "_BeikeMigration" WHERE "version" = '20261104_01_image_task_route';
  INSERT INTO "ImageTask" ("id", "workspaceId", "prompt", "taskId", "status", "model", "mediaType", "createdAt", "updatedAt")
  VALUES ('legacy-route', 'local', 'keep original prompt', 'old-provider-task', 'IN_PROGRESS', 'gpt-image-2', 'image', '2026-01-01', '2026-01-01');`)
	_ = db.Close()
	if err != nil {
		t.Fatal(err)
	}
	if err := Run(path, root, false); err != nil {
		t.Fatal(err)
	}
	db, err = sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var task, prompt, status, route string
	err = db.QueryRow(`SELECT "taskId", "prompt", "status", "routeFingerprint" FROM "ImageTask" WHERE "id" = 'legacy-route'`).Scan(&task, &prompt, &status, &route)
	if err != nil || task != "old-provider-task" || prompt != "keep original prompt" || status != "IN_PROGRESS" || route != "" {
		t.Fatalf("legacy task changed: %q %q %q %q err=%v", task, prompt, status, route, err)
	}
	if err := Run(path, root, false); err != nil {
		t.Fatal(err)
	}
}

func TestReferenceFolderRepairRestoresOnlyNeededFolderAndRequiresSubjectEvidence(t *testing.T) {
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "folders.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, schema := range []string{
		`CREATE TABLE "AssetProductCategory" ("id" TEXT PRIMARY KEY,"name" TEXT,"parentId" TEXT,"workspaceId" TEXT,"isArchived" INTEGER DEFAULT 0)`,
		`INSERT INTO "AssetProductCategory" VALUES ('digital_3c','手机',NULL,'local',0),('prompt_subcategory:digital_3c:case','壳','digital_3c','local',1),('prompt_subcategory:digital_3c:earphone','耳机','digital_3c','local',1)`,
		`CREATE TABLE "FullPromptAsset" ("id" TEXT,"workspaceId" TEXT,"shotPromptsJson" TEXT,"productCategoryIds" TEXT,"productSubcategory" TEXT)`,
	} {
		if _, err := db.Exec(schema); err != nil {
			t.Fatal(err)
		}
	}
	for _, test := range []struct{ id, prompt string }{{"case", "【主体】金黄色编织手机壳\n【物体细节】圆角与镜头开孔"}, {"phone", "【主体】手机本体与屏幕\n【物体细节】搭配手机壳"}} {
		shots := []map[string]any{}
		for i := 0; i < 4; i++ {
			shots = append(shots, map[string]any{"prompt": test.prompt})
		}
		raw, _ := json.Marshal(shots)
		if _, err := db.Exec(`INSERT INTO "FullPromptAsset" VALUES (?,'local',?,'["digital_3c"]','phone')`, test.id, string(raw)); err != nil {
			t.Fatal(err)
		}
	}
	if err := applyReferenceFolderRepair(context.Background(), db); err != nil {
		t.Fatal(err)
	}
	for id, want := range map[string]string{"case": "case", "phone": "phone"} {
		var got string
		if err := db.QueryRow(`SELECT "productSubcategory" FROM "FullPromptAsset" WHERE "id"=?`, id).Scan(&got); err != nil || got != want {
			t.Fatal(id, got, err)
		}
	}
	var archived int
	if err := db.QueryRow(`SELECT "isArchived" FROM "AssetProductCategory" WHERE "id"='prompt_subcategory:digital_3c:earphone'`).Scan(&archived); err != nil || archived != 1 {
		t.Fatal("unrelated archived folder changed", err)
	}
}

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

func TestSeedResourcesNeverEraseUserPreferences(t *testing.T) {
	for _, tc := range []struct {
		name, content      string
		present, wantError bool
		wantOfficial       int
	}{
		{name: "missing", wantOfficial: 1},
		{name: "invalid", content: "{", present: true, wantError: true, wantOfficial: 1},
		{name: "explicit-empty", content: "[]", present: true, wantOfficial: 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			root := t.TempDir()
			path := filepath.Join(t.TempDir(), "seed.db")
			db, err := sql.Open("sqlite", path)
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			_, err = db.Exec(`CREATE TABLE "StyleRecipe" ("id" TEXT, "workspaceId" TEXT);
				CREATE TABLE "PromptAssetUsageEvent" ("workspaceId" TEXT,"eventType" TEXT);
				INSERT INTO "StyleRecipe" VALUES ('official','official'),('user','workspace-a');
				INSERT INTO "PromptAssetUsageEvent" VALUES ('workspace-a','recipe_hidden'),('workspace-b','recipe_hidden')`)
			if err != nil {
				t.Fatal(err)
			}
			if tc.present {
				dir := filepath.Join(root, "src/shared/data")
				if err := os.MkdirAll(dir, 0o755); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(filepath.Join(dir, "officialMasterRecipes.json"), []byte(tc.content), 0o600); err != nil {
					t.Fatal(err)
				}
			}
			for i := 0; i < 2; i++ {
				err = seedOfficialCatalog(context.Background(), db, root, path)
				if (err != nil) != tc.wantError {
					t.Fatalf("seed error=%v wantError=%v", err, tc.wantError)
				}
			}
			var official, user, hidden int
			if err := db.QueryRow(`SELECT count(*) FROM "StyleRecipe" WHERE "workspaceId"='official'`).Scan(&official); err != nil {
				t.Fatal(err)
			}
			if err := db.QueryRow(`SELECT count(*) FROM "StyleRecipe" WHERE "workspaceId"='workspace-a'`).Scan(&user); err != nil {
				t.Fatal(err)
			}
			if err := db.QueryRow(`SELECT count(*) FROM "PromptAssetUsageEvent" WHERE "eventType"='recipe_hidden'`).Scan(&hidden); err != nil {
				t.Fatal(err)
			}
			if official != tc.wantOfficial || user != 1 || hidden != 2 {
				t.Fatalf("official=%d user=%d hidden=%d", official, user, hidden)
			}
		})
	}
}

func TestGridPromptMigrationDeletesOnlyRetiredOverridesWithBackup(t *testing.T) {
	root := filepath.Clean(filepath.Join("..", "..", "..", "..", "..", ".."))
	path := filepath.Join(t.TempDir(), "sales-prompts.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	items := mustMigrations()
	boundary := -1
	for i, item := range items {
		if item.version == "20261101_02_sales_grid_prompts" {
			boundary = i
			break
		}
	}
	if boundary < 0 {
		t.Fatal("grid prompt migration missing")
	}
	if err := applyPending(context.Background(), db, items[:boundary]); err != nil {
		t.Fatal(err)
	}
	retired := []string{"persona-face", "persona-side", "persona-front", "scene-left", "scene-right", "scene-reverse"}
	preserved := []string{"summary", "script-analysis", "script-normalize", "plan-adapt", "persona-grid", "scene-grid", "persona-face-extra"}
	for _, workspace := range []string{"local", "other"} {
		for _, id := range append(append([]string{}, retired...), preserved...) {
			if _, err := db.Exec(`INSERT INTO "SalesPromptOverride" ("workspaceId","promptId","prompt","updatedAt") VALUES (?,?,?,?)`, workspace, id, workspace+":"+id, "original-time"); err != nil {
				t.Fatal(err)
			}
		}
	}
	db.Close()
	if err := Run(path, root, false); err != nil {
		t.Fatal(err)
	}
	// Re-running applies no deletion to the current templates or other user records.
	if err := Run(path, root, false); err != nil {
		t.Fatal(err)
	}
	db, err = sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM "SalesPromptOverride"`).Scan(&count); err != nil || count != 2*len(preserved) {
		t.Fatal("unexpected remaining prompt count", count, err)
	}
	for _, workspace := range []string{"local", "other"} {
		for _, id := range preserved {
			var prompt, updatedAt string
			if err := db.QueryRow(`SELECT "prompt","updatedAt" FROM "SalesPromptOverride" WHERE "workspaceId"=? AND "promptId"=?`, workspace, id).Scan(&prompt, &updatedAt); err != nil || prompt != workspace+":"+id || updatedAt != "original-time" {
				t.Fatal("unrelated or current prompt changed", workspace, id, err)
			}
		}
	}
	backups, _ := filepath.Glob(filepath.Join(filepath.Dir(path), "database-backups", "before-20261101_02_sales_grid_prompts-*.db"))
	if len(backups) != 1 {
		t.Fatal("expected one pre-upgrade backup", backups)
	}
	backup, err := sql.Open("sqlite", backups[0])
	if err != nil {
		t.Fatal(err)
	}
	defer backup.Close()
	if err := backup.QueryRow(`SELECT COUNT(*) FROM "SalesPromptOverride"`).Scan(&count); err != nil || count != 2*(len(retired)+len(preserved)) {
		t.Fatal("original overrides missing from pre-upgrade backup", count, err)
	}
}
