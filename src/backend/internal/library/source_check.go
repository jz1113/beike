package library

import (
	"net/http"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
)

func sourceCheckHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "查重失败"})
			return
		}
		defer db.Close()
		groups, err := dblibrary.DuplicateSourceAlbumGroups(r.Context(), db, httpx.WorkspaceFrom(r))
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "查重失败"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "data": groups})
	}
}
