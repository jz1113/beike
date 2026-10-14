package library

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestLibraryPutRejectsInvalidEdits(t *testing.T) {
	handler := libraryPutHandler(config.Config{Upstream: "http://127.0.0.1:1"})
	status, body := putLibrary(t, handler, `{}`)
	if status != http.StatusBadRequest || body["error"] != "缺少 assetType、id 或 data" || body["success"] != nil {
		t.Fatalf("missing %d %#v", status, body)
	}
	status, body = putLibrary(t, handler, `{"assetType":"video","id":"1","data":{"title":"a"}}`)
	if status != http.StatusBadRequest || body["success"] != false || body["error"] != "不支持的资产类型" {
		t.Fatalf("type %d %#v", status, body)
	}
	status, body = putLibrary(t, handler, `{"assetType":"scene","id":"1","data":{"nope":"a"}}`)
	if status != http.StatusBadRequest || body["error"] != "不允许更新字段: nope" {
		t.Fatalf("field %d %#v", status, body)
	}
	status, body = putLibrary(t, handler, `{"assetType":"scene","id":"1","data":{"usageCount":1.5}}`)
	if status != http.StatusBadRequest || body["error"] != "字段数值不正确: usageCount" {
		t.Fatalf("number %d %#v", status, body)
	}
	status, body = putLibrary(t, handler, `{"assetType":"persona","id":"1","data":{"dimensions":"{\"audience\":\"adult_unisex\"}"}}`)
	if status != http.StatusBadRequest || body["error"] != "人群二级分类无效" {
		t.Fatalf("audience %d %#v", status, body)
	}
	status, body = putLibrary(t, handler, `{`)
	if status != http.StatusInternalServerError || body["error"] != "请求数据格式异常" {
		t.Fatalf("json %d %#v", status, body)
	}
}

func putLibrary(t *testing.T, handler http.Handler, body string) (int, map[string]any) {
	t.Helper()
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPut, "/api/catalog/assets/library", bytes.NewBufferString(body))
	handler.ServeHTTP(response, request)
	decoded := map[string]any{}
	if err := json.Unmarshal(response.Body.Bytes(), &decoded); err != nil {
		t.Fatal(err)
	}
	return response.Code, decoded
}
