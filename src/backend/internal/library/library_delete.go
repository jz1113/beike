package library

import (
	"net/http"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func libraryDeleteHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Query().Get("action") {
		case "purge-seed":
			serveLibraryPurge(cfg, w, r)
			return
		case "deduplicate", "reclassify":
			serveLibraryDedup(cfg, w, r)
			return
		case "clear-all":
			target := r.URL.Query().Get("type")
			if target == "" || target == "all" {
				serveLibraryClearWorkspace(cfg, w, r)
				return
			}
			serveLibraryClearType(cfg, w, r, target)
			return
		case "clear-database":
			serveLibraryClearWorkspace(cfg, w, r)
			return
		}
		assetType := r.URL.Query().Get("type")
		ids := libraryDeleteIDs(r.URL.Query().Get("ids"), r.URL.Query().Get("id"))
		if assetType == "" || len(ids) == 0 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "缺少 assetType 或 id/ids"})
			return
		}
		if !supportedLibraryDelete(assetType) {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "不支持的资产类型: " + assetType})
			return
		}
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "操作失败，请稍后重试"})
			return
		}
		defer db.Close()
		count, err := database.DeleteLibraryAssets(r.Context(), db, httpx.WorkspaceFrom(r), assetType, ids, cfg.MediaReviewRoot())
		if err != nil {
			message := "操作失败，请稍后重试"
			if err.Error() == "所选母组不存在或不可删除" {
				message = err.Error()
			}
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": message})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "count": count, "ids": ids})
	}
}

func libraryDeleteIDs(csv, single string) []string {
	ids := []string{}
	if csv != "" {
		for _, part := range strings.Split(csv, ",") {
			if part != "" {
				ids = append(ids, part)
			}
		}
		return ids
	}
	if single != "" {
		return []string{single}
	}
	return nil
}

func supportedLibraryDelete(assetType string) bool {
	switch assetType {
	case "scene", "outfit", "action", "persona", "full_prompt":
		return true
	default:
		return false
	}
}
