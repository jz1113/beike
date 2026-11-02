package sales

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSalesProductsCRUDFilteringAndWorkspaceIsolation(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/sales/products", Products(cfg))
	mux.HandleFunc("POST /api/sales/products", Products(cfg))
	mux.HandleFunc("GET /api/sales/products/{id}", ProductByID(cfg))
	mux.HandleFunc("PATCH /api/sales/products/{id}", ProductByID(cfg))
	mux.HandleFunc("DELETE /api/sales/products/{id}", ProductByID(cfg))

	// 1. 首次创建商品并按 collectedProductUrl 幂等更新
	createBody := `{
		"title": "红袖 2026秋季女装条纹花纱针织开衫",
		"productUrl": "https://item.jd.com/10233097548161.html",
		"collectedProductUrl": "https://item.jd.com/10233097548161.html",
		"platform": "jd",
		"sku": "10233097548161",
		"category": "fashion",
		"audience": "adult_female",
		"imageCount": 27,
		"selectedImageCount": 3,
		"draftJson": "{\"productName\":\"红袖 2026秋季女装条纹花纱针织开衫\",\"category\":\"fashion\",\"audience\":\"adult_female\"}"
	}`
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/sales/products", strings.NewReader(createBody)))
	if rec.Code != http.StatusOK {
		t.Fatalf("create failed: %d %s", rec.Code, rec.Body.String())
	}
	var created struct {
		Item salesProductRecord `json:"item"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil || created.Item.ID == "" {
		t.Fatalf("unexpected create response: %v %s", err, rec.Body.String())
	}

	// 同一个 collectedProductUrl 再次不带 id 保存时，应复用同一商品 ID
	rec2 := httptest.NewRecorder()
	mux.ServeHTTP(rec2, httptest.NewRequest(http.MethodPost, "/api/sales/products", strings.NewReader(createBody)))
	var deduped struct {
		Item salesProductRecord `json:"item"`
	}
	if rec2.Code != http.StatusOK || json.Unmarshal(rec2.Body.Bytes(), &deduped) != nil || deduped.Item.ID != created.Item.ID {
		t.Fatalf("expected deduplication by collectedProductUrl: got %s want %s", deduped.Item.ID, created.Item.ID)
	}

	// 2. 再插入一件女童服饰和一件数码产品用于两级筛选
	childBody := `{
		"title": "巴拉巴拉女童碎花连衣裙",
		"collectedProductUrl": "https://item.jd.com/99887766.html",
		"category": "fashion",
		"audience": "child_female",
		"draftJson": "{}"
	}`
	recChild := httptest.NewRecorder()
	mux.ServeHTTP(recChild, httptest.NewRequest(http.MethodPost, "/api/sales/products", strings.NewReader(childBody)))
	if recChild.Code != http.StatusOK {
		t.Fatalf("child create failed: %d", recChild.Code)
	}

	techBody := `{
		"title": "无线降噪蓝牙耳机",
		"collectedProductUrl": "https://item.jd.com/55443322.html",
		"category": "tech",
		"audience": "unknown",
		"draftJson": "{}"
	}`
	recTech := httptest.NewRecorder()
	mux.ServeHTTP(recTech, httptest.NewRequest(http.MethodPost, "/api/sales/products", strings.NewReader(techBody)))
	if recTech.Code != http.StatusOK {
		t.Fatalf("tech create failed: %d", recTech.Code)
	}

	// 3. 验证品类 + 年龄人群两级筛选（fashion + child 应仅命中女童连衣裙）
	listRec := httptest.NewRecorder()
	mux.ServeHTTP(listRec, httptest.NewRequest(http.MethodGet, "/api/sales/products?category=fashion&audience=child", nil))
	var listResp struct {
		Items []salesProductRecord `json:"items"`
	}
	if listRec.Code != http.StatusOK || json.Unmarshal(listRec.Body.Bytes(), &listResp) != nil || len(listResp.Items) != 1 {
		t.Fatalf("expected 1 child fashion product, got %d (%s)", len(listResp.Items), listRec.Body.String())
	}
	if listResp.Items[0].Title != "巴拉巴拉女童碎花连衣裙" {
		t.Fatalf("unexpected filtered item: %+v", listResp.Items[0])
	}

	// 4. PATCH 快速修改分类 + 累加出片计数，并同步更新 draftJson
	patchRec := httptest.NewRecorder()
	mux.ServeHTTP(patchRec, httptest.NewRequest(
		http.MethodPatch,
		"/api/sales/products/"+created.Item.ID,
		strings.NewReader(`{"audience":"senior_female","incrementOutput":true}`),
	))
	var patched struct {
		Item salesProductRecord `json:"item"`
	}
	if patchRec.Code != http.StatusOK || json.Unmarshal(patchRec.Body.Bytes(), &patched) != nil {
		t.Fatalf("patch failed: %d %s", patchRec.Code, patchRec.Body.String())
	}
	if patched.Item.Audience != "senior_female" || patched.Item.AudienceSource != "manual" || patched.Item.OutputCount != 1 {
		t.Fatalf("unexpected patched item: %+v", patched.Item)
	}
	if !strings.Contains(patched.Item.DraftJSON, `"senior_female"`) {
		t.Fatalf("expected draftJson synced with new audience: %s", patched.Item.DraftJSON)
	}

	// 5. 跨工作区冲突保护
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`INSERT INTO "SalesProduct" ("id","workspaceId","title","createdAt","updatedAt") VALUES ('foreign_prod','other_ws','他人的商品','now','now')`); err != nil {
		t.Fatal(err)
	}
	conflictRec := httptest.NewRecorder()
	mux.ServeHTTP(conflictRec, httptest.NewRequest(http.MethodPost, "/api/sales/products", strings.NewReader(`{"id":"foreign_prod","title":"试图覆盖"}`)))
	if conflictRec.Code != http.StatusConflict {
		t.Fatalf("expected 409 conflict for foreign workspace id, got %d", conflictRec.Code)
	}

	// 6. 删除商品
	delRec := httptest.NewRecorder()
	mux.ServeHTTP(delRec, httptest.NewRequest(http.MethodDelete, "/api/sales/products/"+created.Item.ID, nil))
	if delRec.Code != http.StatusOK {
		t.Fatalf("delete failed: %d %s", delRec.Code, delRec.Body.String())
	}
	getDeletedRec := httptest.NewRecorder()
	mux.ServeHTTP(getDeletedRec, httptest.NewRequest(http.MethodGet, "/api/sales/products/"+created.Item.ID, nil))
	if getDeletedRec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 after delete, got %d", getDeletedRec.Code)
	}
}
