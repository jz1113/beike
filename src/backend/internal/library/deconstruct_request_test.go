package library

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func TestDeconstructRequestImageRules(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "")
	t.Setenv("AI_API_KEY", "")
	handler := deconstructRequestHandler(config.Config{Upstream: "http://127.0.0.1:1", NodeEnv: "development"})
	empty := httptest.NewRecorder()
	handler.ServeHTTP(empty, httptest.NewRequest(http.MethodPost, "/api/catalog/assets/deconstruct", strings.NewReader(`{}`)))
	if empty.Code != http.StatusBadRequest || !strings.Contains(empty.Body.String(), "请至少提供 1 张参考风格或买家秀图片") {
		t.Fatalf("empty %d %s", empty.Code, empty.Body.String())
	}
	short := httptest.NewRecorder()
	handler.ServeHTTP(short, httptest.NewRequest(http.MethodPost, "/api/catalog/assets/deconstruct", strings.NewReader(`{"imageUrls":["a","b"]}`)))
	if short.Code != http.StatusBadRequest || !strings.Contains(short.Body.String(), "INCOMPLETE_CONTENT_GROUP") {
		t.Fatalf("short %d %s", short.Code, short.Body.String())
	}
	dbPath := filepath.Join(t.TempDir(), "categories.db")
	db, err := database.OpenWrite(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE AssetProductCategory (
		id TEXT, workspaceId TEXT, name TEXT, parentId TEXT, isArchived INTEGER, aliases TEXT
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO AssetProductCategory VALUES ('jewelry','local','珠宝',NULL,0,'[]')`); err != nil {
		t.Fatal(err)
	}
	_ = db.Close()
	withDB := deconstructRequestHandler(config.Config{Upstream: "http://127.0.0.1:1", NodeEnv: "development", DatabaseURL: "file:" + dbPath})
	missingCategory := httptest.NewRecorder()
	withDB.ServeHTTP(missingCategory, httptest.NewRequest(http.MethodPost, "/api/catalog/assets/deconstruct", strings.NewReader(`{"targetCategory":"shoes","imageUrls":["a"]}`)))
	if missingCategory.Code != http.StatusBadRequest || !strings.Contains(missingCategory.Body.String(), "所选商品大类不存在") {
		t.Fatalf("category %d %s", missingCategory.Code, missingCategory.Body.String())
	}
	textOnly := httptest.NewRecorder()
	handler.ServeHTTP(textOnly, httptest.NewRequest(http.MethodPost, "/api/catalog/assets/deconstruct", strings.NewReader(`{"imageUrls":["a"],"customApiKey":"secret","apiFormat":"openai-responses","model":"whisper-1"}`)))
	if textOnly.Code != http.StatusBadRequest || !strings.Contains(textOnly.Body.String(), "支持图像输入的多模态模型") {
		t.Fatalf("vision %d %s", textOnly.Code, textOnly.Body.String())
	}
	needsMajor := httptest.NewRecorder()
	withDB.ServeHTTP(needsMajor, httptest.NewRequest(http.MethodPost, "/api/catalog/assets/deconstruct", strings.NewReader(`{"targetSubcategory":"phone"}`)))
	if needsMajor.Code != http.StatusBadRequest || !strings.Contains(needsMajor.Body.String(), "请先选择商品大类，再指定细分文件夹") {
		t.Fatalf("subcategory %d %s", needsMajor.Code, needsMajor.Body.String())
	}
	badFolder := httptest.NewRecorder()
	withDB.ServeHTTP(badFolder, httptest.NewRequest(http.MethodPost, "/api/catalog/assets/deconstruct", strings.NewReader(`{"targetCategory":"jewelry","targetSubcategory":"abc","imageUrls":["a"]}`)))
	if badFolder.Code != http.StatusBadRequest || !strings.Contains(badFolder.Body.String(), "请选择资产库中的商品细分文件夹") {
		t.Fatalf("folder %d %s", badFolder.Code, badFolder.Body.String())
	}
	nokey := httptest.NewRecorder()
	handler.ServeHTTP(nokey, httptest.NewRequest(http.MethodPost, "/api/catalog/assets/deconstruct", strings.NewReader(`{"imageUrls":["a"]}`)))
	if nokey.Code != http.StatusBadRequest || !strings.Contains(nokey.Body.String(), "系统尚未配置 AI 视觉接口密钥") {
		t.Fatalf("key %d %s", nokey.Code, nokey.Body.String())
	}
}
