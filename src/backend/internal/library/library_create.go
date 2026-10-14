package library

import (
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func serveLibraryCreate(cfg config.Config, w http.ResponseWriter, r *http.Request, body []byte) bool {
	if !json.Valid(body) {
		writeLibraryPutFailure(w, "请求数据格式异常")
		return true
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	var payload map[string]any
	if err := decoder.Decode(&payload); err != nil || payload == nil {
		writeLibraryPutFailure(w, "请求数据格式异常")
		return true
	}
	if payload["action"] == "bulk-import" {
		if items, ok := payload["items"].([]any); ok {
			serveLibraryBulkImport(cfg, w, r, items, payload["promptAssetRegistries"], payload["fullPromptImageReplacements"], payload["productCategories"], payload["albums"])
			return true
		}
	}
	if !jsonTruthy(payload["assetType"]) || !jsonTruthy(payload["data"]) {
		httpx.WriteJSON(w, http.StatusBadRequest, struct {
			Error string `json:"error"`
		}{"缺少 assetType 或 data"})
		return true
	}
	assetType, _ := payload["assetType"].(string)
	if assetType == "" {
		assetType = fmt.Sprint(payload["assetType"])
	}
	if assetType != "scene" && assetType != "outfit" && assetType != "action" && assetType != "persona" && assetType != "full_prompt" {
		httpx.WriteJSON(w, http.StatusBadRequest, struct {
			Error string `json:"error"`
		}{"不支持的资产类型: " + assetType})
		return true
	}
	data, _ := payload["data"].(map[string]any)
	if data == nil {
		data = map[string]any{}
	}
	if assetType == "full_prompt" {
		if value, ok := data["productSubcategory"]; ok && value != nil && !validPromptSubcategory(value) {
			writeLibraryPutClient(w, "商品二级类目无效")
			return true
		}
	}
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		writeLibraryPutFailure(w, "操作失败，请稍后重试")
		return true
	}
	defer db.Close()
	item, err := dblibrary.CreateLibraryAsset(r.Context(), db, httpx.WorkspaceFrom(r), assetType, data)
	if err != nil {
		writeLibraryCreateError(w, err)
		return true
	}
	httpx.WriteJSON(w, http.StatusOK, struct {
		Success bool            `json:"success"`
		Item    json.RawMessage `json:"item"`
	}{true, item})
	return true
}

func writeLibraryCreateError(w http.ResponseWriter, err error) {
	var client dblibrary.LibraryUpdateError
	if errors.As(err, &client) {
		writeLibraryPutClient(w, client.Message)
		return
	}
	var failure dblibrary.LibraryFailure
	if errors.As(err, &failure) {
		writeLibraryPutFailure(w, failure.Message)
		return
	}
	writeLibraryPutFailure(w, "操作失败，请稍后重试")
}
