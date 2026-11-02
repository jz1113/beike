package sales

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func setupTaxonomy(t *testing.T) (config.Config, *http.ServeMux) {
	t.Helper()
	cfg := setupSalesTestConfig(t)
	schema, err := os.ReadFile(filepath.Join("..", "platform", "database", "migrate", "sources", "sales_script_taxonomy.sql"))
	if err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(string(schema)); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "ActionAsset" ("id" TEXT PRIMARY KEY,"workspaceId" TEXT,"productCategoryIds" TEXT DEFAULT '[]',"updatedAt" TEXT)`); err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.Handle("GET /api/sales/script-taxonomy", ScriptTaxonomy(cfg))
	mux.Handle("POST /api/sales/script-taxonomy", ScriptTaxonomy(cfg))
	mux.Handle("PATCH /api/sales/script-taxonomy/{id}", ScriptTaxonomyByID(cfg))
	mux.Handle("DELETE /api/sales/script-taxonomy/{id}", ScriptTaxonomyByID(cfg))
	mux.Handle("POST /api/sales/scripts", Scripts(cfg))
	mux.Handle("GET /api/sales/scripts", Scripts(cfg))
	return cfg, mux
}

func taxonomyRequest(t *testing.T, mux *http.ServeMux, method, path, body, workspace string, want int) map[string]any {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req = req.WithContext(httpx.WithWorkspace(req.Context(), workspace))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != want {
		t.Fatalf("%s %s: %d want %d: %s", method, path, rec.Code, want, rec.Body.String())
	}
	var result map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	return result
}

func createTaxonomy(t *testing.T, mux *http.ServeMux, kind, name, workspace string) scriptTaxonomyItem {
	t.Helper()
	raw, _ := json.Marshal(map[string]string{"kind": kind, "name": name})
	result := taxonomyRequest(t, mux, "POST", "/api/sales/script-taxonomy", string(raw), workspace, 200)
	item := result["item"].(map[string]any)
	return scriptTaxonomyItem{ID: item["id"].(string), Kind: item["kind"].(string), Name: item["name"].(string)}
}

func TestScriptTaxonomyEmptyCustomNamesAndWorkspaceIsolation(t *testing.T) {
	_, mux := setupTaxonomy(t)
	empty := taxonomyRequest(t, mux, "GET", "/api/sales/script-taxonomy", "", "one", 200)
	if len(empty["items"].([]any)) != 0 {
		t.Fatal("must not seed predefined categories or styles")
	}
	category := createTaxonomy(t, mux, "category", "  我的针织库  ", "one")
	if category.Name != "我的针织库" {
		t.Fatalf("name not trimmed: %+v", category)
	}
	createTaxonomy(t, mux, "style", "我的针织库", "one")
	createTaxonomy(t, mux, "category", "我的针织库", "two")
	taxonomyRequest(t, mux, "POST", "/api/sales/script-taxonomy", `{"kind":"category","name":"我的针织库"}`, "one", 409)
	taxonomyRequest(t, mux, "POST", "/api/sales/script-taxonomy", `{"kind":"other","name":"无效"}`, "one", 400)
	taxonomyRequest(t, mux, "POST", "/api/sales/script-taxonomy", `{"kind":"style","name":" "}`, "one", 400)
	taxonomyRequest(t, mux, "POST", "/api/sales/script-taxonomy", `{"kind":"style","name":"`+strings.Repeat("长", 41)+`"}`, "one", 400)
	taxonomyRequest(t, mux, "PATCH", "/api/sales/script-taxonomy/"+category.ID, `{"name":"篡改"}`, "two", 404)
	taxonomyRequest(t, mux, "DELETE", "/api/sales/script-taxonomy/"+category.ID, "", "two", 404)
	result := taxonomyRequest(t, mux, "GET", "/api/sales/script-taxonomy", "", "one", 200)
	if len(result["items"].([]any)) != 2 {
		t.Fatal("workspace list leaked or mutated")
	}
}

func TestScriptTaxonomyRenameAndDeleteKeepScripts(t *testing.T) {
	cfg, mux := setupTaxonomy(t)
	cat := createTaxonomy(t, mux, "category", "穿搭", "one")
	style := createTaxonomy(t, mux, "style", "随拍", "one")
	otherCat := createTaxonomy(t, mux, "category", "另一个目录", "two")
	var script map[string]any
	_ = json.Unmarshal([]byte(validScript), &script)
	script["taxonomy"] = map[string]any{"categoryId": cat.ID, "styleId": style.ID, "productCategory": "fashion"}
	body, _ := json.Marshal(map[string]any{"id": "test-script", "script": script, "status": "archived"})
	taxonomyRequest(t, mux, "POST", "/api/sales/scripts", string(body), "one", 200)
	script["taxonomy"] = map[string]any{"categoryId": otherCat.ID, "styleId": ""}
	otherBody, _ := json.Marshal(map[string]any{"id": "other-script", "script": script})
	taxonomyRequest(t, mux, "POST", "/api/sales/scripts", string(otherBody), "two", 200)
	renamed := taxonomyRequest(t, mux, "PATCH", "/api/sales/script-taxonomy/"+cat.ID, `{"name":"通勤穿搭"}`, "one", 200)
	if renamed["item"].(map[string]any)["id"] != cat.ID {
		t.Fatal("rename changed stable ID")
	}
	createTaxonomy(t, mux, "category", "重复", "one")
	taxonomyRequest(t, mux, "PATCH", "/api/sales/script-taxonomy/"+cat.ID, `{"name":"重复"}`, "one", 409)
	taxonomyRequest(t, mux, "DELETE", "/api/sales/script-taxonomy/"+cat.ID, "", "one", 200)
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	row, err := readReferenceScriptByID(t.Context(), db, "one", "test-script")
	if err != nil {
		t.Fatal(err)
	}
	tax := row.Script["taxonomy"].(map[string]any)
	if tax["categoryId"] != "" || tax["styleId"] != style.ID || row.Status != "archived" {
		t.Fatalf("incorrect cleanup: %+v", row)
	}
	var original map[string]any
	_ = json.Unmarshal([]byte(validScript), &original)
	originalShots, _ := json.Marshal(original["shots"])
	remainingShots, _ := json.Marshal(row.Script["shots"])
	if string(originalShots) != string(remainingShots) {
		t.Fatal("deleting category changed storyboard content")
	}
	other, err := readReferenceScriptByID(t.Context(), db, "two", "other-script")
	if err != nil || other.Script["taxonomy"].(map[string]any)["categoryId"] != otherCat.ID {
		t.Fatal("other workspace affected")
	}
	taxonomyRequest(t, mux, "DELETE", "/api/sales/script-taxonomy/"+style.ID, "", "one", 200)
	row, _ = readReferenceScriptByID(t.Context(), db, "one", "test-script")
	if row.Script["taxonomy"].(map[string]any)["styleId"] != "" {
		t.Fatal("deleted style reference remains")
	}
	taxonomyRequest(t, mux, "POST", "/api/sales/scripts", string(body), "one", 400)
}

func TestRemoveCategoryPreservesOtherActionCategoriesAndWorkspaces(t *testing.T) {
	cfg, mux := setupTaxonomy(t)
	removed := createTaxonomy(t, mux, "category", "移除分类", "one")
	kept := createTaxonomy(t, mux, "category", "保留分类", "one")
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	multi, _ := json.Marshal([]string{kept.ID, removed.ID, kept.ID + "_other"})
	single, _ := json.Marshal([]string{removed.ID})
	for _, row := range []struct{ id, workspace, categories string }{
		{"multi", "one", string(multi)},
		{"single", "one", string(single)},
		{"legacy", "one", removed.ID},
		{"spaced-legacy", "one", "  " + removed.ID + "  "},
		{"spaced-array", "one", `[" ` + removed.ID + ` "," ` + kept.ID + ` "]`},
		{"unrelated", "one", `["` + removed.ID + `_suffix"]`},
		{"other-workspace", "two", string(multi)},
	} {
		if _, err := db.Exec(`INSERT INTO "ActionAsset" ("id","workspaceId","productCategoryIds","updatedAt") VALUES (?,?,?,'before')`, row.id, row.workspace, row.categories); err != nil {
			t.Fatal(err)
		}
	}
	taxonomyRequest(t, mux, "DELETE", "/api/sales/script-taxonomy/"+removed.ID, "", "one", 200)
	remaining, _ := json.Marshal([]string{kept.ID, kept.ID + "_other"})
	for id, want := range map[string]string{
		"multi": string(remaining), "single": "[]", "legacy": "[]", "spaced-legacy": "[]", "spaced-array": `["` + kept.ID + `"]`,
		"unrelated": `["` + removed.ID + `_suffix"]`, "other-workspace": string(multi),
	} {
		var got, updatedAt string
		if err := db.QueryRow(`SELECT "productCategoryIds","updatedAt" FROM "ActionAsset" WHERE "id"=?`, id).Scan(&got, &updatedAt); err != nil {
			t.Fatal(err)
		}
		if got != want {
			t.Errorf("%s categories=%s, want %s", id, got, want)
		}
		if (id == "unrelated" || id == "other-workspace") && updatedAt != "before" {
			t.Errorf("unrelated action %s was modified", id)
		}
	}
}

func TestRemoveCategoryRollsBackWhenActionCleanupFails(t *testing.T) {
	cfg, mux := setupTaxonomy(t)
	category := createTaxonomy(t, mux, "category", "不可移除", "one")
	var script map[string]any
	_ = json.Unmarshal([]byte(validScript), &script)
	script["taxonomy"] = map[string]any{"categoryId": category.ID, "styleId": ""}
	body, _ := json.Marshal(map[string]any{"id": "protected-script", "script": script, "status": "verified"})
	taxonomyRequest(t, mux, "POST", "/api/sales/scripts", string(body), "one", 200)
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	raw, _ := json.Marshal([]string{category.ID})
	if _, err := db.Exec(`INSERT INTO "ActionAsset" ("id","workspaceId","productCategoryIds","updatedAt") VALUES ('protected-action','one',?,'before')`, string(raw)); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TRIGGER "reject_action_category_update" BEFORE UPDATE ON "ActionAsset" BEGIN SELECT RAISE(ABORT,'blocked action update'); END`); err != nil {
		t.Fatal(err)
	}
	taxonomyRequest(t, mux, "DELETE", "/api/sales/script-taxonomy/"+category.ID, "", "one", 500)
	var count int
	if err := db.QueryRow(`SELECT count(*) FROM "SalesScriptTaxonomy" WHERE "id"=?`, category.ID).Scan(&count); err != nil || count != 1 {
		t.Fatal("taxonomy deletion was not rolled back", count, err)
	}
	stored, err := readReferenceScriptByID(t.Context(), db, "one", "protected-script")
	if err != nil || stored.Script["taxonomy"].(map[string]any)["categoryId"] != category.ID || stored.Version != 1 || stored.Status != "verified" {
		t.Fatal("script filing or version changed after failed cleanup", stored, err)
	}
	var actionCategories string
	if err := db.QueryRow(`SELECT "productCategoryIds" FROM "ActionAsset" WHERE "id"='protected-action'`).Scan(&actionCategories); err != nil || actionCategories != string(raw) {
		t.Fatal("action filing changed after failed cleanup", actionCategories, err)
	}
}
