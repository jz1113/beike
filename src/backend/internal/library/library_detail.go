package library

import (
	"encoding/json"
	"errors"
	"net/http"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func serveLibraryDetail(cfg config.Config, w http.ResponseWriter, r *http.Request, assetType, id string) {
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "操作失败，请稍后重试"})
		return
	}
	defer db.Close()
	var item json.RawMessage
	if assetType == "scene" || assetType == "scene_bundle" {
		item, err = database.LibrarySceneDetail(r.Context(), db, httpx.WorkspaceFrom(r), id)
	} else if assetType == "full_prompt" {
		item, err = database.LibraryPromptDetail(r.Context(), db, httpx.WorkspaceFrom(r), id)
	} else {
		item, err = database.LibraryDetail(r.Context(), db, httpx.WorkspaceFrom(r), assetType, id)
	}
	if errors.Is(err, database.ErrLibraryDetailMissing) {
		httpx.WriteJSON(w, http.StatusNotFound, struct {
			Success bool   `json:"success"`
			Error   string `json:"error"`
		}{false, "资产不存在"})
		return
	}
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "操作失败，请稍后重试"})
		return
	}
	httpx.WriteJSON(w, http.StatusOK, struct {
		Success   bool   `json:"success"`
		AssetType string `json:"assetType"`
		Item      any    `json:"item"`
	}{true, assetType, item})
}
