package poster

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestFeedbackUpdatesChoiceAndCreatesExplicitCorrection(t *testing.T) {
	cfg := coverMemoryConfig(t)
	db, ok := openCoverDB(cfg)
	if !ok {
		t.Fatal("db")
	}
	defer db.Close()
	ctx := t.Context()
	for _, id := range []string{"watch", "lamp"} {
		title := "手表表盘"
		if id == "lamp" {
			title = "台灯书桌"
		}
		if err := insertCoverSample(ctx, db, "local", id, title, "model", nil); err != nil {
			t.Fatal(err)
		}
		if err := insertCoverEntries(ctx, db, "local", []coverEntry{learningEntry(id, id, title)}); err != nil {
			t.Fatal(err)
		}
	}
	learningExec(t, db, `UPDATE "CoverMemoryEntry" SET "createdAt"='2020-01-01T00:00:00Z' WHERE "id"='watch'`)
	_, _, selected, err := adoptedCoverSelection(ctx, db, "local", "auto", "手表测评")
	if err != nil || selected != "watch" {
		t.Fatalf("relevance %s %v", selected, err)
	}
	if err := recordCoverUsage(ctx, db, "local", "batch", "item", "手表", []string{"watch"}, map[string]string{"memorySampleId": "watch"}); err != nil {
		t.Fatal(err)
	}
	usages, err := listCoverUsages(ctx, db, "local")
	if err != nil {
		t.Fatal(err)
	}
	handler := HeadlineMemoryFeedback(cfg)
	post := func(body, id string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPatch, "/", strings.NewReader(body))
		req.SetPathValue("id", id)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		return rec
	}
	for i := 0; i < 2; i++ {
		rec := post(`{"rating":"good","note":"边缘清晰","correction":"不要遮挡品牌"}`, usages[0].ID)
		if rec.Code != 200 {
			t.Fatalf("feedback %d %s", rec.Code, rec.Body.String())
		}
	}
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM "CoverMemoryEntry" WHERE "source"='correction'`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("duplicate correction %d %v", count, err)
	}
	_, _, selected, err = adoptedCoverSelection(ctx, db, "local", "auto", "未知商品")
	if err != nil || selected != "watch" {
		t.Fatalf("feedback tie break %s %v", selected, err)
	}
	_, _, selected, err = adoptedCoverSelection(ctx, db, "local", "lamp", "手表")
	if err != nil || selected != "lamp" {
		t.Fatalf("explicit selection %s %v", selected, err)
	}
	if rec := post(`{"rating":"bad","note":"test"}`, "missing"); rec.Code != 404 {
		t.Fatalf("missing feedback %d", rec.Code)
	}
	if rec := post(`{"rating":"anything"}`, usages[0].ID); rec.Code != 400 {
		t.Fatalf("bad rating %d", rec.Code)
	}
}
