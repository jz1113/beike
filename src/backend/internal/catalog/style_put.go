package catalog

import (
	dbcatalog "beike.local/cloud/src/backend/internal/platform/database/catalog"
	"encoding/json"
	"io"
	"net/http"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func styleRecipesPutHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20+1))
		if err != nil || len(body) > 1<<20 {
			writeStyleSaveFailure(w)
			return
		}
		var object map[string]any
		if json.Unmarshal(body, &object) != nil {
			writeStyleSaveFailure(w)
			return
		}
		id, _ := object["id"].(string)
		if id == "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "缺少配方 id"})
			return
		}
		changes, ok := styleChanges(object)
		if !ok {
			writeStyleSaveFailure(w)
			return
		}
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			writeStyleSaveFailure(w)
			return
		}
		defer db.Close()
		recipe, copied, err := dbcatalog.SaveStyleRecipe(r.Context(), db, httpx.WorkspaceFrom(r), id, changes)
		if err == dbcatalog.ErrStyleMissing {
			httpx.WriteJSON(w, http.StatusNotFound, map[string]any{
				"success": false, "code": "recipe_not_found",
				"error": "该架构已不存在，请刷新列表。编辑内容已保留，可另存为新架构。",
			})
			return
		}
		if err != nil {
			writeStyleSaveFailure(w)
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "recipe": recipe, "copied": copied})
	}
}

func styleChanges(object map[string]any) (dbcatalog.StyleChanges, bool) {
	var changes dbcatalog.StyleChanges
	var ok bool
	if changes.Name, ok = optionalChangeString(object, "name"); !ok {
		return changes, false
	}
	if changes.Category, ok = optionalChangeString(object, "category"); !ok {
		return changes, false
	}
	if changes.Tag, ok = optionalChangeString(object, "tag"); !ok {
		return changes, false
	}
	if changes.Desc, ok = optionalChangeString(object, "desc"); !ok {
		return changes, false
	}
	if changes.PromptSnippet, ok = optionalChangeString(object, "promptSnippet"); !ok {
		return changes, false
	}
	if changes.CoverURL, ok = optionalChangeString(object, "coverUrl"); !ok {
		return changes, false
	}
	if _, exists := object["isFavorite"]; exists {
		value, isBool := object["isFavorite"].(bool)
		if !isBool {
			return changes, false
		}
		changes.Favorite = &value
	}
	return changes, true
}

func optionalChangeString(object map[string]any, key string) (*string, bool) {
	value, exists := object[key]
	if !exists {
		return nil, true
	}
	text, ok := value.(string)
	if !ok {
		return nil, false
	}
	return &text, true
}

func writeStyleSaveFailure(w http.ResponseWriter) {
	httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "架构保存失败，请稍后重试。编辑内容已保留。"})
}
