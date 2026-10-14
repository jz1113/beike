package catalog

import (
	dbcatalog "beike.local/cloud/src/backend/internal/platform/database/catalog"
	"encoding/json"
	"io"
	"net/http"
	"path/filepath"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func styleRecipesPostHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("action") == "seed" {
			seedOfficialStyles(cfg, w, r)
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20+1))
		if err != nil || len(body) > 1<<20 {
			writeStyleFailure(w)
			return
		}
		if r.URL.Query().Get("action") == "restore" {
			restoreStyleRecipe(cfg, w, r, body)
			return
		}
		createStyleRecipe(cfg, w, r, body)
	}
}

func seedOfficialStyles(cfg config.Config, w http.ResponseWriter, r *http.Request) {
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		writeStyleFailure(w)
		return
	}
	defer db.Close()
	recipes, err := dbcatalog.LoadOfficialMasterRecipes(filepath.Join(cfg.Root, "src/shared/data/officialMasterRecipes.json"))
	if err != nil {
		writeStyleFailure(w)
		return
	}
	if err := dbcatalog.UpsertOfficialMasterRecipes(r.Context(), db, recipes); err != nil {
		writeStyleFailure(w)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "message": "官方预置品类拍摄大架构已全面更新至 V6.0 资产库联动版"})
}

func restoreStyleRecipe(cfg config.Config, w http.ResponseWriter, r *http.Request, body []byte) {
	var object map[string]any
	if json.Unmarshal(body, &object) != nil {
		writeStyleFailure(w)
		return
	}
	id, _ := object["id"].(string)
	id = strings.TrimSpace(id)
	if id == "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "code": "invalid_id", "error": "缺少官方架构 id"})
		return
	}
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		writeStyleFailure(w)
		return
	}
	defer db.Close()
	status, err := dbcatalog.RestoreOfficialStyleRecipe(r.Context(), db, httpx.WorkspaceFrom(r), id)
	if err != nil {
		writeStyleFailure(w)
		return
	}
	switch status {
	case "not_found":
		httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "code": status, "error": "官方架构不存在"})
	case "not_official":
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "code": status, "error": "只能恢复官方架构"})
	default:
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "id": id, "status": status})
	}
}

func createStyleRecipe(cfg config.Config, w http.ResponseWriter, r *http.Request, body []byte) {
	input, status, message := parseStyleCreate(body)
	if message != "" {
		if status == http.StatusInternalServerError {
			writeStyleFailure(w)
			return
		}
		httpx.WriteJSON(w, status, map[string]any{"error": message})
		return
	}
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		writeStyleFailure(w)
		return
	}
	defer db.Close()
	recipe, err := dbcatalog.CreateStyleRecipe(r.Context(), db, httpx.WorkspaceFrom(r), input)
	if err != nil {
		writeStyleFailure(w)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "recipe": recipe})
}

func parseStyleCreate(body []byte) (dbcatalog.StyleRecipeInput, int, string) {
	var object map[string]any
	if json.Unmarshal(body, &object) != nil {
		return dbcatalog.StyleRecipeInput{}, http.StatusInternalServerError, "架构操作失败，请稍后重试。"
	}
	name, _ := object["name"].(string)
	snippet, _ := object["promptSnippet"].(string)
	if name == "" || snippet == "" {
		return dbcatalog.StyleRecipeInput{}, http.StatusBadRequest, "缺少风格名称或提示词配方内容"
	}
	category := "general"
	if text, ok := object["category"].(string); ok {
		category = text
	}
	return dbcatalog.StyleRecipeInput{
		Name: name, Category: category, Tag: stringOrEmpty(object["tag"]), Desc: stringOrEmpty(object["desc"]),
		PromptSnippet: snippet, CoverURL: stringOrEmpty(object["coverUrl"]),
		SampleImages: sampleImagesValue(object["sampleImages"]), SourceURL: stringOrEmpty(object["sourceUrl"]),
	}, http.StatusOK, ""
}

func stringOrEmpty(value any) string {
	text, ok := value.(string)
	if !ok {
		return ""
	}
	return text
}

func sampleImagesValue(value any) string {
	if text, ok := value.(string); ok {
		return text
	}
	if value == nil {
		return "[]"
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		return "[]"
	}
	return string(encoded)
}

func writeStyleFailure(w http.ResponseWriter) {
	httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "架构操作失败，请稍后重试。"})
}
