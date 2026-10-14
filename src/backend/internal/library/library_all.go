package library

import (
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
	"encoding/json"
	"net/http"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func serveLibraryAll(cfg config.Config, w http.ResponseWriter, r *http.Request) {
	page := boundedQueryInt(r.URL.Query().Get("page"), 1, 1, 0)
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "操作失败，请稍后重试"})
		return
	}
	defer db.Close()
	all, err := dblibrary.ListAllLibraryAssets(r.Context(), db, httpx.WorkspaceFrom(r), page, r.URL.Query().Get("slim") == "1")
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "操作失败，请稍后重试"})
		return
	}
	httpx.WriteJSON(w, http.StatusOK, struct {
		Success     bool              `json:"success"`
		Slim        bool              `json:"slim"`
		Page        int               `json:"page"`
		HasMore     bool              `json:"hasMore"`
		Scenes      []json.RawMessage `json:"scenes"`
		Outfits     []json.RawMessage `json:"outfits"`
		Actions     []json.RawMessage `json:"actions"`
		Personas    []json.RawMessage `json:"personas"`
		FullPrompts []json.RawMessage `json:"fullPrompts"`
	}{true, r.URL.Query().Get("slim") == "1", all.Page, all.HasMore, emptyItems(all.Scenes), emptyItems(all.Outfits), emptyItems(all.Actions), emptyItems(all.Personas), emptyItems(all.FullPrompts)})
}

func emptyItems(items []json.RawMessage) []json.RawMessage {
	if items == nil {
		return []json.RawMessage{}
	}
	return items
}
