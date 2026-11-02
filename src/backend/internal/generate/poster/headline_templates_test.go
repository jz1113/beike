package poster

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/httpx"
)

func TestTemplateLibraryThousandRecordsAndWorkspaceIsolation(t *testing.T) {
	cfg := coverMemoryConfig(t)
	db, ok := openCoverDB(cfg)
	if !ok {
		t.Fatal("database")
	}
	defer db.Close()
	tx, err := db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 1000; i++ {
		id := fmt.Sprintf("sample_%04d", i)
		_, err = tx.Exec(`INSERT INTO "CoverMemorySample" ("id","workspaceId","title","imageUrls","model","deconstruction","status","error","createdAt","updatedAt") VALUES (?,'local',?,'["/storage/reference.png"]','vision',?,'completed','',?,?)`, id, fmt.Sprintf("模板%04d", i), `{"templatePrompt":"完整独立模板，主标题为{{封面标题}}，主体为{{商品图}}，左上柔光。"}`, id, id)
		if err != nil {
			t.Fatal(err)
		}
		_, err = tx.Exec(`INSERT INTO "CoverMemoryEntry" ("id","workspaceId","branch","rule","evidence","sampleId","status","source","useCount","createdAt","updatedAt") VALUES (?,'local','layout','左侧排版','',?,'pending','sample',0,?,?)`, "entry_"+id, id, id, id)
		if err != nil {
			t.Fatal(err)
		}
	}
	if err = tx.Commit(); err != nil {
		t.Fatal(err)
	}
	handler := HeadlineTemplates(cfg)
	read := func(url, workspace string) map[string]any {
		t.Helper()
		r := httptest.NewRequest("GET", url, nil)
		r = r.WithContext(httpx.WithWorkspace(r.Context(), workspace))
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != 200 {
			t.Fatal(w.Code, w.Body.String())
		}
		var value map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &value); err != nil {
			t.Fatal(err)
		}
		return value
	}
	first := read("/api/generate/headline-templates", "local")
	if first["total"] != float64(1000) || len(first["templates"].([]any)) != 24 {
		t.Fatal(first)
	}
	if strings.Contains(fmt.Sprint(first), "完整独立模板") {
		t.Fatal("list leaked full prompts")
	}
	last := read("/api/generate/headline-templates?offset=984", "local")
	if len(last["templates"].([]any)) != 16 {
		t.Fatal(last)
	}
	filtered := read("/api/generate/headline-templates?q=模板0999", "local")
	if filtered["total"] != float64(1) {
		t.Fatal(filtered)
	}
	if read("/api/generate/headline-templates", "other")["total"] != float64(0) {
		t.Fatal("workspace leak")
	}
	detail := read("/api/generate/headline-templates?id=sample_0999", "local")
	if detail["legacy"] != false || !strings.Contains(detail["prompt"].(string), "封面标题") {
		t.Fatal(detail)
	}
	patch := httptest.NewRequest(http.MethodPatch, "/api/generate/headline-templates/sample_0999", strings.NewReader(`{"title":"暖色左排模板","status":"adopted"}`))
	patch.SetPathValue("id", "sample_0999")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, patch)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	stale := httptest.NewRequest(http.MethodPatch, "/", strings.NewReader(`{"title":"过期修改","expectedUpdatedAt":"sample_0999"}`))
	stale.SetPathValue("id", "sample_0999")
	staleResult := httptest.NewRecorder()
	handler.ServeHTTP(staleResult, stale)
	if staleResult.Code != 409 {
		t.Fatal("missing conflict protection", staleResult.Code, staleResult.Body.String())
	}
	backup := read("/api/generate/headline-templates?export=1", "local")
	if len(backup["templates"].([]any)) != 1000 {
		t.Fatal("incomplete backup")
	}
	if read("/api/generate/headline-templates?status=adopted", "local")["total"] != float64(1) {
		t.Fatal("template not enabled")
	}
	lines, _, chosen, err := adoptedCoverSelection(context.Background(), db, "local", "sample_0999")
	if err != nil || chosen != "sample_0999" || !strings.Contains(strings.Join(lines, "\n"), "完整独立模板") {
		t.Fatal(lines, chosen, err)
	}
	// Purging legacy trait rows must not strand the durable full template.
	if _, err := db.Exec(`DELETE FROM "CoverMemoryEntry" WHERE "sampleId"='sample_0999'`); err != nil {
		t.Fatal(err)
	}
	restore := httptest.NewRequest(http.MethodPatch, "/", strings.NewReader(`{"status":"adopted"}`))
	restore.SetPathValue("id", "sample_0999")
	restored := httptest.NewRecorder()
	handler.ServeHTTP(restored, restore)
	if restored.Code != 200 {
		t.Fatal(restored.Body.String())
	}
	if read("/api/generate/headline-templates?status=adopted", "local")["total"] != float64(1) {
		t.Fatal("purged template could not be restored")
	}

	forbidden := httptest.NewRequest(http.MethodPatch, "/", strings.NewReader(`{"title":"错误覆盖"}`))
	forbidden.SetPathValue("id", "sample_0999")
	forbidden = forbidden.WithContext(httpx.WithWorkspace(forbidden.Context(), "other"))
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, forbidden)
	if w.Code != 404 {
		t.Fatal(w.Code)
	}
}

func TestLegacyTemplateDoesNotPretendToBeNewModelOutput(t *testing.T) {
	prompt, legacy := coverTemplatePrompt(`{"layout":{"method":"主体位于右侧，左侧标题两行"},"background":{"method":"暖白背景，左上柔光"}}`)
	if !legacy || !strings.Contains(prompt, "主体位于右侧") || !strings.Contains(prompt, "{{封面标题}}") {
		t.Fatal(prompt, legacy)
	}
	if prompt, _ := coverTemplatePrompt(`invalid`); prompt != "" {
		t.Fatal(prompt)
	}
}
