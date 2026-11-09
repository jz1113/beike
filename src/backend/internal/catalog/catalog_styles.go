package catalog

import (
	"encoding/json"
	"io"
	"net/http"
	"path/filepath"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	dbcatalog "beike.local/cloud/src/backend/internal/platform/database/catalog"
	learning "beike.local/cloud/src/backend/internal/platform/database/learning"
)

var socialBodyFields = []string{
	"url", "text", "link", "query", "scraperId", "customScraperId", "scraperSecret", "customApiKey",
	"qiyunAppId", "qiyunAppKey", "customQiyunAppId", "customQiyunAppKey", "preferredScraper",
}

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
		db, err := database.OpenRequired(cfg.SQLiteFile())
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
		db, err := database.OpenRequired(cfg.SQLiteFile())
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
	db, err := database.OpenRequired(cfg.SQLiteFile())
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
	db, err := database.OpenRequired(cfg.SQLiteFile())
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
	db, err := database.OpenRequired(cfg.SQLiteFile())
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
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			writeStyleSaveFailure(w)
			return
		}
		defer db.Close()
		recipe, copied, err := dbcatalog.SaveStyleRecipe(r.Context(), db, httpx.WorkspaceFrom(r), id, changes)
		if err == dbcatalog.ErrSkillConflict {
			writeSkillError(w, http.StatusConflict, "技能已更新，请刷新后重试；编辑内容已保留")
			return
		}
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
	if value, exists := object["expectedVersion"]; exists {
		version, ok := value.(string)
		if !ok {
			return changes, false
		}
		changes.ExpectedVersion = version
	}
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

func parseLinkHandler(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if err != nil || !json.Valid(body) {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求体必须为有效的 JSON"})
			return
		}
		var payload any
		if json.Unmarshal(body, &payload) != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求体必须为有效的 JSON"})
			return
		}
		if message := socialLinkBodyError(payload); message != "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": message})
			return
		}
		status, response := parseSocialLink(cfg, r, payload.(map[string]any))
		httpx.WriteJSON(w, status, response)
	})
}

func socialLinkBodyError(value any) string {
	input, ok := value.(map[string]any)
	if !ok {
		return "请求体必须为 JSON 对象"
	}
	for _, key := range socialBodyFields {
		field, exists := input[key]
		if !exists {
			continue
		}
		text, isString := field.(string)
		if !isString || jsLength(text) > 8192 {
			return "链接、解析配置必须为有效文本（最多 8192 字符）"
		}
	}
	return ""
}

func extractStyleHandler(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 32<<20))
		if err != nil || !json.Valid(body) {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求体必须为有效的 JSON"})
			return
		}
		var payload any
		if json.Unmarshal(body, &payload) != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求体必须为有效的 JSON"})
			return
		}
		input, ok := payload.(map[string]any)
		if !ok {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求体必须为 JSON 对象"})
			return
		}
		if message := deepseekStyleError(r, input); message != "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": message, "code": "gateway_base_url"})
			return
		}
		extractStyle(cfg, w, r, input)
	})
}

func deepseekStyleError(r *http.Request, payload map[string]any) string {
	model, _ := payload["model"].(string)
	model = strings.TrimSpace(model)
	if !strings.HasPrefix(model, "deepseek-official:") {
		return ""
	}
	id := strings.TrimPrefix(model, "deepseek-official:")
	if id != "deepseek-flash" && id != "deepseek-v4-pro" {
		return "此 DeepSeek 官方模型尚未适配"
	}
	base, _ := payload["customBaseUrl"].(string)
	base = strings.TrimSpace(base)
	if base == "" {
		base = strings.TrimSpace(r.Header.Get("x-custom-base-url"))
	}
	if base != "" && gateway.NormalizeGatewayBaseURL(base) != "https://api.deepseek.com" {
		return "DeepSeek 官方模型只能使用官方接口地址"
	}
	return ""
}

func jsLength(value string) int {
	count := 0
	for _, r := range value {
		if r > 0xFFFF {
			count += 2
			continue
		}
		count++
	}
	return count
}
