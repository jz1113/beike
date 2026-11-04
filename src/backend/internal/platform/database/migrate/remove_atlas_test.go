package migrate

import (
	"context"
	"database/sql"
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"
)

func TestRemoveAtlasMigrationPreservesUserAssetsAndReusedCategories(t *testing.T) {
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "remove-atlas.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	items := mustMigrations()
	var before []migration
	for _, item := range items {
		if item.version == "20261102_02_remove_atlas" {
			break
		}
		before = append(before, item)
	}
	if err := applyPending(context.Background(), db, before); err != nil {
		t.Fatal(err)
	}
	for _, item := range []struct{ id, workspace, dimensions, image string }{
		{"atlas-persona", "local", `{"atlasId":"face1"}`, "/storage/upload.jpg"},
		{"atlas-registry", "local", `{}`, "/storage/replaced.jpg"},
		{"atlas-media", "local", `not-json`, "/storage/workspaces/local/azhuo/assets/atlas/faces/face2.png"},
		{"manual-persona", "local", `not-json`, "/storage/manual.jpg"},
		{"foreign-persona", "other", `{}`, "/storage/other.jpg"},
	} {
		if _, err := db.Exec(`INSERT INTO "PersonaAsset" ("id","workspaceId","name","description","dimensions","avatarUrl","updatedAt") VALUES (?,?,?,'',?,?,'now')`, item.id, item.workspace, item.id, item.dimensions, item.image); err != nil {
			t.Fatal(err)
		}
	}
	for _, item := range []struct{ id, dimensions, categories string }{
		{"atlas-action", `{"atlasId":"pose1"}`, `["taxonomy_atlas_unused"]`},
		{"manual-action", `{}`, `["taxonomy_atlas_reused"]`},
	} {
		if _, err := db.Exec(`INSERT INTO "ActionAsset" ("id","workspaceId","title","action","shotType","dimensions","productCategoryIds","updatedAt") VALUES (?,'local',?,'动作','full_body',?,?,'now')`, item.id, item.id, item.dimensions, item.categories); err != nil {
			t.Fatal(err)
		}
	}
	for _, item := range []struct{ id, workspace, kind, asset, provenance string }{
		{"reg-atlas", "local", "persona", "atlas-registry", "atlas"},
		{"reg-normal", "local", "persona", "manual-persona", "manual"},
		// Registry metadata in another workspace must not remove a user asset.
		{"reg-other", "local", "persona", "foreign-persona", "atlas"},
	} {
		if _, err := db.Exec(`INSERT INTO "PromptAssetRegistry" ("id","workspaceId","assetType","sourceAssetId","provenance","updatedAt") VALUES (?,?,?,?,?,'now')`, item.id, item.workspace, item.kind, item.asset, item.provenance); err != nil {
			t.Fatal(err)
		}
	}
	for _, id := range []string{"taxonomy_atlas_unused", "taxonomy_atlas_reused", "manual-category"} {
		if _, err := db.Exec(`INSERT INTO "SalesScriptTaxonomy" ("id","workspaceId","kind","name","createdAt","updatedAt") VALUES (?,'local','category',?,'now','now')`, id, id); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.Exec(`UPDATE "PromptAssetRegistry" SET "sourceRef"='reg-atlas' WHERE "id"='reg-normal'`); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"atlas-persona", "manual-persona"} {
		if _, err := db.Exec(`INSERT INTO "PromptAssetUsageEvent" ("id","workspaceId","assetId","batchId","eventType") VALUES (?,'local',?,'batch','locked')`, id, id); err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(`INSERT INTO "PromptAssetCategoryLink" ("id","workspaceId","assetId","categoryId") VALUES (?,'local',?,'manual-category')`, id, id); err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(`INSERT INTO "SalesAssetViewJob" ("id","workspaceId","requestKey","kind","assetId","model","status","createdAt","updatedAt") VALUES (?,'local',?,'persona',?,'model','pending','now','now')`, id, id, id); err != nil {
			t.Fatal(err)
		}
	}
	draft := `{"productionPlan":{"personaId":"atlas-persona","beatActionIds":{"0":"atlas-action","1":"manual-action"},"customPersonaFaceUrl":"/storage/workspaces/local/azhuo/assets/atlas/faces/face1.png","voiceId":"voice"},"custom":"保留草稿","counter":9007199254740993}`
	for _, item := range []struct{ id, workspace, body string }{
		{"changed", "local", draft}, {"unchanged", "other", `{"personaId":"atlas-persona","custom":"保持原始格式"}`},
	} {
		if _, err := db.Exec(`INSERT INTO "SalesProduct" ("id","workspaceId","draftJson","createdAt","updatedAt") VALUES (?,?,?,'now','now')`, item.id, item.workspace, item.body); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.Exec(`INSERT INTO "SalesProductionPreset" ("id","workspaceId","name","configJson","createdAt","updatedAt") VALUES ('preset','local','预设',?,'now','now')`, draft); err != nil {
		t.Fatal(err)
	}
	workshop := `{"settings":{"lockedPersonaId":"atlas-persona","lockedActionId":"atlas-action"},"items":[{"selectedPersonaAssetId":"atlas-persona","tasks":[{"appliedActionId":"atlas-action","resultUrl":"/storage/kept-output.jpg"}]}]}`
	if _, err := db.Exec(`INSERT INTO "WorkshopWorkspace" ("id","workspaceId","snapshotJson","updatedAt") VALUES ('workspace','local',?,'now')`, workshop); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "WorkshopBatch" ("id","workspaceId","name","status","snapshotJson","createdAt","updatedAt") VALUES ('batch','local','批次','draft',?,'now','now')`, workshop); err != nil {
		t.Fatal(err)
	}
	if err := applyPending(context.Background(), db, items); err != nil {
		t.Fatal(err)
	}
	for table, expected := range map[string]int{
		"PersonaAsset": 2, "ActionAsset": 1, "PromptAssetRegistry": 1, "PromptAssetUsageEvent": 1,
		"PromptAssetCategoryLink": 1, "SalesAssetViewJob": 1, "SalesScriptTaxonomy": 2,
	} {
		var count int
		if err := db.QueryRow(`SELECT count(*) FROM ` + ident(table)).Scan(&count); err != nil || count != expected {
			t.Fatalf("%s expected %d retained rows, got %d: %v", table, expected, count, err)
		}
	}
	for _, query := range []string{`SELECT "draftJson" FROM "SalesProduct" WHERE "id"='changed'`, `SELECT "configJson" FROM "SalesProductionPreset" WHERE "id"='preset'`} {
		var body string
		if err := db.QueryRow(query).Scan(&body); err != nil {
			t.Fatal(err)
		}
		if !json.Valid([]byte(body)) || strings.Contains(body, "atlas-persona") || strings.Contains(body, "atlas-action") || isAtlasMedia(body) || !strings.Contains(body, "manual-action") || !strings.Contains(body, "保留草稿") || !strings.Contains(body, "9007199254740993") {
			t.Fatalf("unexpected cleaned draft: %s", body)
		}
	}
	var unchanged string
	if err := db.QueryRow(`SELECT "draftJson" FROM "SalesProduct" WHERE "id"='unchanged'`).Scan(&unchanged); err != nil || unchanged != `{"personaId":"atlas-persona","custom":"保持原始格式"}` {
		t.Fatalf("unrelated workspace draft changed: %s %v", unchanged, err)
	}
	for _, table := range []string{"WorkshopWorkspace", "WorkshopBatch"} {
		var body string
		if err := db.QueryRow(`SELECT "snapshotJson" FROM ` + ident(table)).Scan(&body); err != nil || strings.Contains(body, "atlas-persona") || strings.Contains(body, "atlas-action") || !strings.Contains(body, `"lockedPersonaId":"auto"`) || !strings.Contains(body, "/storage/kept-output.jpg") {
			t.Fatalf("unexpected workshop snapshot: %s %v", body, err)
		}
	}
	var sourceRef sql.NullString
	if err := db.QueryRow(`SELECT "sourceRef" FROM "PromptAssetRegistry" WHERE "id"='reg-normal'`).Scan(&sourceRef); err != nil || sourceRef.Valid {
		t.Fatalf("derived user registry retained a deleted source reference: %v %v", sourceRef, err)
	}
	if err := applyRemoveAtlas(context.Background(), db); err != nil {
		t.Fatalf("cleanup is not idempotent: %v", err)
	}
}

func TestClearAtlasJSONKeepsFreeTextAndSourceFingerprints(t *testing.T) {
	media := "/storage/workspaces/local/azhuo/assets/atlas/faces/face.png"
	fingerprint := `{"personaId":"atlas-persona","face":"` + media + `"}`
	value := map[string]any{
		"personaId": "atlas-persona", "note": "atlas-persona", "customPersonaFaceUrl": media,
		"customPrompt":     "保留开头 " + media + " 保留结尾。https://example.com/manual.jpg",
		"adaptedSourceKey": fingerprint, "spokenCopySourceKey": fingerprint,
		"adaptedBeats":  []any{map[string]any{"action": "保留原始动作"}},
		"beatActionIds": map[string]any{"0": "atlas-action", "1": "manual-action"},
	}
	if !clearAtlasJSON(value, map[string]bool{"atlas-persona": true, "atlas-action": true}) {
		t.Fatal("references were not cleared")
	}
	if value["personaId"] != "" || value["customPersonaFaceUrl"] != "" || value["note"] != "atlas-persona" {
		t.Fatalf("unexpected ID or media cleanup: %v", value)
	}
	if value["customPrompt"] != "保留开头  保留结尾。https://example.com/manual.jpg" || value["adaptedSourceKey"] != fingerprint || value["spokenCopySourceKey"] != fingerprint {
		t.Fatalf("user text or source fingerprint changed: %v", value)
	}
	if actions := value["beatActionIds"].(map[string]any); actions["0"] != "" || actions["1"] != "manual-action" {
		t.Fatalf("unexpected action selection cleanup: %v", actions)
	}
}
