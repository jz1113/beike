package library

import (
	"net/http"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func libraryGetHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("view") == "organization" {
			serveLibraryOrganization(cfg, w, r)
			return
		}
		if id := strings.TrimSpace(r.URL.Query().Get("id")); id != "" {
			assetType := r.URL.Query().Get("type")
			if assetType == "" {
				assetType = "scene"
			}
			switch assetType {
			case "outfit", "action", "persona", "scene", "scene_bundle", "full_prompt":
				serveLibraryDetail(cfg, w, r, assetType, id)
				return
			}
		}
		assetType := r.URL.Query().Get("type")
		if assetType == "" {
			assetType = "scene"
		}
		if assetType == "all" && r.URL.Query().Get("export") == "1" {
			serveLibraryExport(cfg, w, r)
			return
		}
		if assetType == "all" {
			serveLibraryAll(cfg, w, r)
			return
		}
		if assetType == "scene" || assetType == "scene_bundle" || assetType == "outfit" || assetType == "action" || assetType == "persona" || assetType == "full_prompt" {
			serveLibraryList(cfg, w, r, assetType)
			return
		}
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "不支持的资产类型: " + assetType})
	}
}

func serveLibraryOrganization(cfg config.Config, w http.ResponseWriter, r *http.Request) {
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "操作失败，请稍后重试"})
		return
	}
	defer db.Close()
	organization, err := database.ListAssetOrganization(r.Context(), db, httpx.WorkspaceFrom(r))
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "操作失败，请稍后重试"})
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"success": true, "categories": organization.Categories, "albums": organization.Albums,
	})
}
