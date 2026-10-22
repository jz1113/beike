package catalog

import (
	dbcatalog "beike.local/cloud/src/backend/internal/platform/database/catalog"
	learning "beike.local/cloud/src/backend/internal/platform/database/learning"
	"net/http"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
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
		pageResult, err := dbcatalog.ListStyleRecipes(r.Context(), db, httpx.WorkspaceFrom(r), r.URL.Query().Get("category"), page, pageSize)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "架构操作失败，请稍后重试。"})
			return
		}
		for _, recipe := range pageResult.Recipes {
			id, _ := recipe["id"].(string)
			version, err := dbcatalog.RememberSkillRevision(r.Context(), db, httpx.WorkspaceFrom(r), "workshop", id, recipe)
			if err != nil {
				writeSkillError(w, http.StatusInternalServerError, "技能版本保存失败")
				return
			}
			recipe["libraryVersion"] = version
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"success": true, "page": page, "pageSize": pageSize, "total": pageResult.Total,
			"categorySkillBase": learning.BaseRecipe(), "recipes": pageResult.Recipes, "hiddenOfficialRecipes": pageResult.HiddenOfficialRecipes,
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
		if err := dbcatalog.DeleteStyleRecipe(r.Context(), db, httpx.WorkspaceFrom(r), id, r.URL.Query().Get("version")); err != nil {
			if err == dbcatalog.ErrSkillConflict {
				writeSkillError(w, http.StatusConflict, "技能已更新，请刷新后重试")
				return
			}
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "架构操作失败，请稍后重试。"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true})
	}
}
