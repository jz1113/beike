package library

import (
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
	"net/http"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func motherReplacementHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Query().Get("motherId")
		if id == "" || len(id) > 160 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "缺少有效母组 ID"})
			return
		}
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "读取母组换图状态失败"})
			return
		}
		defer db.Close()
		state, err := dblibrary.MotherReplacementState(r.Context(), db, httpx.WorkspaceFrom(r), id)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "读取母组换图状态失败"})
			return
		}
		if !state.Found {
			httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"error": "母组不存在或不属于当前工作区"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"success": true, "replaced": state.Replaced, "replaceable": state.Replaceable,
			"replacedAt": state.ReplacedAt, "sourceImages": state.SourceImages,
		})
	}
}
