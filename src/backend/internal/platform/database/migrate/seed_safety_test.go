package migrate

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"testing"
)

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
