package library

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"unicode"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
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
	db, err := database.OpenRequired(cfg.SQLiteFile())
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "操作失败，请稍后重试"})
		return
	}
	defer db.Close()
	organization, err := dblibrary.ListAssetOrganization(r.Context(), db, httpx.WorkspaceFrom(r))
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "操作失败，请稍后重试"})
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"success": true, "categories": organization.Categories, "albums": organization.Albums,
	})
}

func SourceCheck(cfg config.Config) http.Handler     { return sourceCheckHandler(cfg) }
func SourceCheckPost(cfg config.Config) http.Handler { return sourceCheckPostHandler(cfg) }
func Reviews(cfg config.Config) http.Handler         { return deconstructReviewsHandler(cfg) }
func ReviewsPost(cfg config.Config) http.Handler     { return deconstructReviewsPostHandler(cfg) }
func Get(cfg config.Config) http.Handler             { return libraryGetHandler(cfg) }
func Post(cfg config.Config) http.Handler            { return libraryPostHandler(cfg) }
func Put(cfg config.Config) http.Handler             { return libraryPutHandler(cfg) }
func Delete(cfg config.Config) http.Handler          { return libraryDeleteHandler(cfg) }
func MotherReplacement(cfg config.Config) http.Handler {
	return motherReplacementHandler(cfg)
}
func DeconstructJobs(cfg config.Config) http.Handler     { return deconstructJobsHandler(cfg) }
func DeconstructJobsPost(cfg config.Config) http.Handler { return deconstructJobsPostHandler(cfg) }
func DeconstructProgress(cfg config.Config) http.Handler { return deconstructProgressHandler(cfg) }
func Deconstruct(cfg config.Config) http.Handler         { return deconstructRequestHandler(cfg) }

func serveLibraryAll(cfg config.Config, w http.ResponseWriter, r *http.Request) {
	page := boundedQueryInt(r.URL.Query().Get("page"), 1, 1, 0)
	db, err := database.OpenRequired(cfg.SQLiteFile())
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "操作失败，请稍后重试"})
		return
	}
	defer db.Close()
	all, err := dblibrary.ListAllLibraryAssets(r.Context(), db, httpx.WorkspaceFrom(r), page, r.URL.Query().Get("slim") == "1")
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "操作失败，请稍后重试"})
		return
	}
	httpx.WriteJSON(w, http.StatusOK, struct {
		Success     bool              `json:"success"`
		Slim        bool              `json:"slim"`
		Page        int               `json:"page"`
		HasMore     bool              `json:"hasMore"`
		Scenes      []json.RawMessage `json:"scenes"`
		Outfits     []json.RawMessage `json:"outfits"`
		Actions     []json.RawMessage `json:"actions"`
		Personas    []json.RawMessage `json:"personas"`
		FullPrompts []json.RawMessage `json:"fullPrompts"`
	}{true, r.URL.Query().Get("slim") == "1", all.Page, all.HasMore, emptyItems(all.Scenes), emptyItems(all.Outfits), emptyItems(all.Actions), emptyItems(all.Personas), emptyItems(all.FullPrompts)})
}

func emptyItems(items []json.RawMessage) []json.RawMessage {
	if items == nil {
		return []json.RawMessage{}
	}
	return items
}

func serveLibraryBulkImport(cfg config.Config, w http.ResponseWriter, r *http.Request, items []any, registries, replacements, categories, albums any) {
	db, err := database.OpenRequired(cfg.SQLiteFile())
	if err != nil {
		writeLibraryPutFailure(w, "操作失败，请稍后重试")
		return
	}
	defer db.Close()
	imported, err := dblibrary.BulkImportLibrary(r.Context(), db, httpx.WorkspaceFrom(r), items, registries, replacements, categories, albums)
	if err != nil {
		writeLibraryCreateError(w, err)
		return
	}
	if imported.Items == nil {
		imported.Items = []json.RawMessage{}
	}
	if imported.Warnings == nil {
		imported.Warnings = []string{}
	}
	httpx.WriteJSON(w, http.StatusOK, struct {
		Success  bool              `json:"success"`
		Count    int               `json:"count"`
		Items    []json.RawMessage `json:"items"`
		Warnings []string          `json:"warnings"`
	}{true, len(imported.Items), imported.Items, imported.Warnings})
}

func serveLibraryCreate(cfg config.Config, w http.ResponseWriter, r *http.Request, body []byte) bool {
	if !json.Valid(body) {
		writeLibraryPutFailure(w, "请求数据格式异常")
		return true
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	var payload map[string]any
	if err := decoder.Decode(&payload); err != nil || payload == nil {
		writeLibraryPutFailure(w, "请求数据格式异常")
		return true
	}
	if payload["action"] == "bulk-import" {
		if items, ok := payload["items"].([]any); ok {
			serveLibraryBulkImport(cfg, w, r, items, payload["promptAssetRegistries"], payload["fullPromptImageReplacements"], payload["productCategories"], payload["albums"])
			return true
		}
	}
	if !jsonTruthy(payload["assetType"]) || !jsonTruthy(payload["data"]) {
		httpx.WriteJSON(w, http.StatusBadRequest, struct {
			Error string `json:"error"`
		}{"缺少 assetType 或 data"})
		return true
	}
	assetType, _ := payload["assetType"].(string)
	if assetType == "" {
		assetType = fmt.Sprint(payload["assetType"])
	}
	if assetType != "scene" && assetType != "outfit" && assetType != "action" && assetType != "persona" && assetType != "full_prompt" {
		httpx.WriteJSON(w, http.StatusBadRequest, struct {
			Error string `json:"error"`
		}{"不支持的资产类型: " + assetType})
		return true
	}
	data, _ := payload["data"].(map[string]any)
	if data == nil {
		data = map[string]any{}
	}
	if assetType == "full_prompt" {
		if value, ok := data["productSubcategory"]; ok && value != nil && !validPromptSubcategory(value) {
			writeLibraryPutClient(w, "商品二级类目无效")
			return true
		}
	}
	db, err := database.OpenRequired(cfg.SQLiteFile())
	if err != nil {
		writeLibraryPutFailure(w, "操作失败，请稍后重试")
		return true
	}
	defer db.Close()
	item, err := dblibrary.CreateLibraryAsset(r.Context(), db, httpx.WorkspaceFrom(r), assetType, data)
	if err != nil {
		writeLibraryCreateError(w, err)
		return true
	}
	httpx.WriteJSON(w, http.StatusOK, struct {
		Success bool            `json:"success"`
		Item    json.RawMessage `json:"item"`
	}{true, item})
	return true
}

func writeLibraryCreateError(w http.ResponseWriter, err error) {
	var client dblibrary.LibraryUpdateError
	if errors.As(err, &client) {
		writeLibraryPutClient(w, client.Message)
		return
	}
	var failure dblibrary.LibraryFailure
	if errors.As(err, &failure) {
		writeLibraryPutFailure(w, failure.Message)
		return
	}
	writeLibraryPutFailure(w, "操作失败，请稍后重试")
}

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
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "操作失败，请稍后重试"})
			return
		}
		defer db.Close()
		count, err := dblibrary.DeleteLibraryAssets(r.Context(), db, httpx.WorkspaceFrom(r), assetType, ids, cfg.MediaReviewRoot())
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

func serveLibraryDetail(cfg config.Config, w http.ResponseWriter, r *http.Request, assetType, id string) {
	db, err := database.OpenRequired(cfg.SQLiteFile())
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "操作失败，请稍后重试"})
		return
	}
	defer db.Close()
	var item json.RawMessage
	if assetType == "scene" || assetType == "scene_bundle" {
		item, err = dblibrary.LibrarySceneDetail(r.Context(), db, httpx.WorkspaceFrom(r), id)
	} else if assetType == "full_prompt" {
		item, err = dblibrary.LibraryPromptDetail(r.Context(), db, httpx.WorkspaceFrom(r), id)
	} else {
		item, err = dblibrary.LibraryDetail(r.Context(), db, httpx.WorkspaceFrom(r), assetType, id)
	}
	if errors.Is(err, dblibrary.ErrLibraryDetailMissing) {
		httpx.WriteJSON(w, http.StatusNotFound, struct {
			Success bool   `json:"success"`
			Error   string `json:"error"`
		}{false, "资产不存在"})
		return
	}
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "操作失败，请稍后重试"})
		return
	}
	httpx.WriteJSON(w, http.StatusOK, struct {
		Success   bool   `json:"success"`
		AssetType string `json:"assetType"`
		Item      any    `json:"item"`
	}{true, assetType, item})
}

func serveLibraryExport(cfg config.Config, w http.ResponseWriter, r *http.Request) {
	db, err := database.OpenRequired(cfg.SQLiteFile())
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "操作失败，请稍后重试"})
		return
	}
	defer db.Close()
	exported, err := dblibrary.ExportLibrary(r.Context(), db, httpx.WorkspaceFrom(r))
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "操作失败，请稍后重试"})
		return
	}
	scenes := emptyItems(exported.Scenes)
	outfits := emptyItems(exported.Outfits)
	actions := emptyItems(exported.Actions)
	personas := emptyItems(exported.Personas)
	prompts := emptyItems(exported.FullPrompts)
	categories := emptyItems(exported.Categories)
	albums := emptyItems(exported.Albums)
	registries := emptyItems(exported.Registries)
	replacements := emptyItems(exported.Replacements)
	httpx.WriteJSON(w, http.StatusOK, struct {
		Success                     bool              `json:"success"`
		Complete                    bool              `json:"complete"`
		MediaIncluded               bool              `json:"mediaIncluded"`
		Scenes                      []json.RawMessage `json:"scenes"`
		Outfits                     []json.RawMessage `json:"outfits"`
		Actions                     []json.RawMessage `json:"actions"`
		Personas                    []json.RawMessage `json:"personas"`
		FullPrompts                 []json.RawMessage `json:"fullPrompts"`
		ProductCategories           []json.RawMessage `json:"productCategories"`
		Albums                      []json.RawMessage `json:"albums"`
		PromptAssetRegistries       []json.RawMessage `json:"promptAssetRegistries"`
		FullPromptImageReplacements []json.RawMessage `json:"fullPromptImageReplacements"`
		Counts                      exportCounts      `json:"counts"`
	}{
		true, true, false, scenes, outfits, actions, personas, prompts, categories, albums, registries, replacements,
		exportCounts{len(scenes), len(outfits), len(actions), len(personas), len(prompts), len(categories), len(albums), len(registries), len(replacements)},
	})
}

type exportCounts struct {
	Scenes                      int `json:"scenes"`
	Outfits                     int `json:"outfits"`
	Actions                     int `json:"actions"`
	Personas                    int `json:"personas"`
	FullPrompts                 int `json:"fullPrompts"`
	ProductCategories           int `json:"productCategories"`
	Albums                      int `json:"albums"`
	PromptAssetRegistries       int `json:"promptAssetRegistries"`
	FullPromptImageReplacements int `json:"fullPromptImageReplacements"`
}

func serveLibraryList(cfg config.Config, w http.ResponseWriter, r *http.Request, assetType string) {
	query := r.URL.Query()
	page := boundedQueryInt(query.Get("page"), 1, 1, 0)
	pageSize := boundedQueryInt(query.Get("pageSize"), 50, 1, 100)
	db, err := database.OpenRequired(cfg.SQLiteFile())
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "操作失败，请稍后重试"})
		return
	}
	defer db.Close()
	list, err := dblibrary.ListLibraryAssets(r.Context(), db, httpx.WorkspaceFrom(r), assetType, page, pageSize,
		strings.TrimSpace(query.Get("keyword")), query.Get("isFavorite") == "true", query.Get("albumId"),
		query.Get("productCategoryId"), query.Get("includeUniversal") != "false", query.Get("category"))
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "操作失败，请稍后重试"})
		return
	}
	if list.Items == nil {
		list.Items = []json.RawMessage{}
	}
	httpx.WriteJSON(w, http.StatusOK, struct {
		Success   bool              `json:"success"`
		AssetType string            `json:"assetType"`
		Total     int               `json:"total"`
		Page      int               `json:"page"`
		PageSize  int               `json:"pageSize"`
		Items     []json.RawMessage `json:"items"`
	}{true, assetType, list.Total, list.Page, list.PageSize, list.Items})
}

func boundedQueryInt(raw string, fallback, min, max int) int {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return fallback
	}
	end := 0
	for end < len(raw) && (raw[end] == '+' || raw[end] == '-' || unicode.IsDigit(rune(raw[end]))) {
		end++
	}
	if end == 0 || raw[:end] == "+" || raw[:end] == "-" {
		return fallback
	}
	value, err := strconv.Atoi(raw[:end])
	if err != nil {
		return fallback
	}
	if value < min {
		return min
	}
	if max > 0 && value > max {
		return max
	}
	return value
}
