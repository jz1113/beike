package catalog

import (
	"net/http"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func styleRecipesHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		page := httpx.QueryInt(r, "page", 1)
		if page < 1 {
			page = 1
		}
		pageSize := httpx.QueryInt(r, "pageSize", 50)
		if pageSize < 1 {
			pageSize = 1
		}
		if pageSize > 100 {
			pageSize = 100
		}
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "架构操作失败，请稍后重试。"})
			return
		}
		defer db.Close()
		pageResult, err := database.ListStyleRecipes(r.Context(), db, httpx.WorkspaceFrom(r), r.URL.Query().Get("category"), page, pageSize)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "架构操作失败，请稍后重试。"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"success": true, "page": page, "pageSize": pageSize, "total": pageResult.Total,
			"recipes": pageResult.Recipes, "hiddenOfficialRecipes": pageResult.HiddenOfficialRecipes,
		})
	}
}

func styleRecipesDeleteHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Query().Get("id")
		if id == "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "缺少 id 参数"})
			return
		}
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "架构操作失败，请稍后重试。"})
			return
		}
		defer db.Close()
		if err := database.DeleteStyleRecipe(r.Context(), db, httpx.WorkspaceFrom(r), id); err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "架构操作失败，请稍后重试。"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true})
	}
}
