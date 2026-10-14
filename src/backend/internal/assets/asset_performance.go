package assets

import (
	"net/http"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func assetPerformanceHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		assetType := r.PathValue("type")
		if !validAssetType(assetType) {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "资产类型不正确", "code": "bad_request"})
			return
		}
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "服务器内部错误", "code": "internal_error"})
			return
		}
		defer db.Close()
		performance, err := database.ReadAssetPerformance(r.Context(), db, httpx.WorkspaceFrom(r), r.PathValue("id"))
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "服务器内部错误", "code": "internal_error"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"success": true, "assetType": assetType, "assetId": r.PathValue("id"),
			"counts": performance.Counts, "firstPassAcceptRate": performance.FirstPassAcceptRate,
			"retryRate": performance.RetryRate, "quality": performance.Quality,
		})
	}
}

func validAssetType(value string) bool {
	switch value {
	case "scene", "outfit", "action", "persona", "full_prompt":
		return true
	default:
		return false
	}
}
