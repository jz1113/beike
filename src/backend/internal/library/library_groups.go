package library

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	dbcatalog "beike.local/cloud/src/backend/internal/platform/database/catalog"
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
)

func classifyLibraryAssets(cfg config.Config, w http.ResponseWriter, r *http.Request, body []byte) {
	assetType, ids, categories, universal, message := parseAssetClassify(body)
	if message != "" {
		writeLibraryMutationError(w, message)
		return
	}
	db, err := database.OpenRequired(cfg.SQLiteFile())
	if err != nil {
		writeLibraryMutationError(w, "分类操作失败")
		return
	}
	defer db.Close()
	organization, err := dblibrary.ClassifyAssets(r.Context(), db, httpx.WorkspaceFrom(r), assetType, ids, categories, universal)
	if err != nil {
		writeLibraryMutationError(w, err.Error())
		return
	}
	writeLibraryOrganization(w, organization)
}

func moveLibraryPromptGroups(cfg config.Config, w http.ResponseWriter, r *http.Request, body []byte) {
	ids, categoryID, subcategory, message := parsePromptGroupMove(body)
	if message != "" {
		writeLibraryMutationError(w, message)
		return
	}
	db, err := database.OpenRequired(cfg.SQLiteFile())
	if err != nil {
		writeLibraryMutationError(w, "分类操作失败")
		return
	}
	defer db.Close()
	result, err := dbcatalog.MovePromptGroups(r.Context(), db, httpx.WorkspaceFrom(r), ids, categoryID, subcategory)
	if err != nil {
		writeLibraryMutationError(w, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"success": true, "categories": result.Organization.Categories, "albums": result.Organization.Albums,
		"movedCount": result.MovedCount, "affectedCount": result.AffectedCount,
	})
}

func parsePromptGroupMove(body []byte) ([]string, *string, *string, string) {
	var object map[string]any
	if json.Unmarshal(body, &object) != nil {
		return nil, nil, nil, "分类操作失败"
	}
	ids, err := promptGroupIDs(object["ids"])
	if err != nil {
		return nil, nil, nil, err.Error()
	}
	categoryID := optionalText(object["productCategoryId"])
	subcategory := optionalText(object["productSubcategory"])
	return ids, categoryID, subcategory, ""
}

func promptGroupIDs(value any) ([]string, error) {
	list, ok := value.([]any)
	if !ok || len(list) == 0 || len(list) > 200 {
		return nil, errString("请选择 1–200 个母组")
	}
	ids := []string{}
	seen := map[string]struct{}{}
	for _, item := range list {
		text, ok := item.(string)
		if !ok || strings.TrimSpace(text) == "" {
			return nil, errString("请选择 1–200 个母组")
		}
		if _, exists := seen[text]; exists {
			continue
		}
		seen[text] = struct{}{}
		ids = append(ids, text)
	}
	return ids, nil
}

func optionalText(value any) *string {
	text, ok := value.(string)
	if !ok || text == "" {
		return nil
	}
	return &text
}

func archiveLibraryFolders(cfg config.Config, w http.ResponseWriter, r *http.Request, body []byte) {
	ids, parentID, message := parseFolderArchive(body)
	if message != "" {
		writeLibraryMutationError(w, message)
		return
	}
	db, err := database.OpenRequired(cfg.SQLiteFile())
	if err != nil {
		writeLibraryMutationError(w, "分类操作失败")
		return
	}
	defer db.Close()
	result, err := dbcatalog.ArchivePromptFolders(r.Context(), db, httpx.WorkspaceFrom(r), ids, parentID)
	if err != nil {
		writeLibraryMutationError(w, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"success": true, "categories": result.Organization.Categories, "albums": result.Organization.Albums,
		"archivedCount": result.ArchivedCount, "releasedCount": result.ReleasedCount,
	})
}

func parseFolderArchive(body []byte) ([]string, *string, string) {
	var object map[string]any
	if json.Unmarshal(body, &object) != nil {
		return nil, nil, "分类操作失败"
	}
	ids, err := folderIDs(object["ids"])
	if err != nil {
		return nil, nil, err.Error()
	}
	parentID := optionalText(object["parentId"])
	return ids, parentID, ""
}

func folderIDs(value any) ([]string, error) {
	list, ok := value.([]any)
	if !ok || len(list) == 0 || len(list) > 100 {
		return nil, errString("请选择 1–100 个文件夹")
	}
	ids := []string{}
	seen := map[string]struct{}{}
	for _, item := range list {
		text, ok := item.(string)
		if !ok || strings.TrimSpace(text) == "" {
			return nil, errString("请选择 1–100 个文件夹")
		}
		if text == "unclassified" || text == "universal" {
			return nil, errString("系统分类不可删除")
		}
		if _, exists := seen[text]; exists {
			continue
		}
		seen[text] = struct{}{}
		ids = append(ids, text)
	}
	return ids, nil
}

func serveLibraryPurge(cfg config.Config, w http.ResponseWriter, r *http.Request) {
	db, err := database.OpenRequired(cfg.SQLiteFile())
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "操作失败，请稍后重试"})
		return
	}
	defer db.Close()
	result, err := dblibrary.PurgeSeedAssets(r.Context(), db, httpx.WorkspaceFrom(r))
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "操作失败，请稍后重试"})
		return
	}
	httpx.WriteJSON(w, http.StatusOK, struct {
		Success      bool   `json:"success"`
		Message      string `json:"message"`
		CleanedCount int    `json:"cleanedCount"`
		Details      struct {
			Scenes   int `json:"scenes"`
			Outfits  int `json:"outfits"`
			Actions  int `json:"actions"`
			Personas int `json:"personas"`
		} `json:"details"`
	}{
		Success: true, Message: fmt.Sprintf("已清理 %d 条官方预置种子资产", result.Total()), CleanedCount: result.Total(),
		Details: struct {
			Scenes   int `json:"scenes"`
			Outfits  int `json:"outfits"`
			Actions  int `json:"actions"`
			Personas int `json:"personas"`
		}{result.Scenes, result.Outfits, result.Actions, result.Personas},
	})
}

func serveLibraryDedup(cfg config.Config, w http.ResponseWriter, r *http.Request) {
	db, err := database.OpenRequired(cfg.SQLiteFile())
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "操作失败，请稍后重试"})
		return
	}
	defer db.Close()
	migrated, cleaned, err := dblibrary.DeduplicateLibrary(r.Context(), db, httpx.WorkspaceFrom(r))
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "操作失败，请稍后重试"})
		return
	}
	httpx.WriteJSON(w, http.StatusOK, struct {
		Success       bool   `json:"success"`
		Message       string `json:"message"`
		MigratedCount int    `json:"migratedCount"`
		CleanedCount  int    `json:"cleanedCount"`
	}{true, fmt.Sprintf("智能提纯完成：迁移错位资产 %d 条，清理重复记录 %d 条", migrated, cleaned), migrated, cleaned})
}

func serveLibraryClearType(cfg config.Config, w http.ResponseWriter, r *http.Request, target string) {
	serveLibraryClear(cfg, w, r, func(db *sql.DB) (int, error) {
		return dblibrary.ClearLibraryType(r.Context(), db, httpx.WorkspaceFrom(r), target)
	}, "已彻底清空 %d 条资产")
}

func serveLibraryClearWorkspace(cfg config.Config, w http.ResponseWriter, r *http.Request) {
	serveLibraryClear(cfg, w, r, func(db *sql.DB) (int, error) {
		return dblibrary.ClearLocalWorkspace(r.Context(), db, httpx.WorkspaceFrom(r))
	}, "已清空当前工作区的 %d 条记录，官方资产保留")
}

func serveLibraryClear(cfg config.Config, w http.ResponseWriter, r *http.Request, clear func(*sql.DB) (int, error), message string) {
	db, err := database.OpenRequired(cfg.SQLiteFile())
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "操作失败，请稍后重试"})
		return
	}
	defer db.Close()
	count, err := clear(db)
	if err != nil {
		text := "操作失败，请稍后重试"
		if err.Error() == "分类清理未取得进展，已取消本次清理" {
			text = err.Error()
		}
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": text})
		return
	}
	httpx.WriteJSON(w, http.StatusOK, struct {
		Success      bool   `json:"success"`
		Message      string `json:"message"`
		DeletedCount int    `json:"deletedCount"`
	}{true, fmt.Sprintf(message, count), count})
}

func saveLibrarySubcategory(cfg config.Config, w http.ResponseWriter, r *http.Request, body []byte) {
	parentID, value, name, message := parseSubcategorySave(body)
	if message != "" {
		writeLibraryMutationError(w, message)
		return
	}
	db, err := database.OpenRequired(cfg.SQLiteFile())
	if err != nil {
		writeLibraryMutationError(w, "分类操作失败")
		return
	}
	defer db.Close()
	organization, err := dbcatalog.SavePromptSubcategory(r.Context(), db, httpx.WorkspaceFrom(r), parentID, value, name)
	if err != nil {
		writeLibraryMutationError(w, err.Error())
		return
	}
	writeLibraryOrganization(w, organization)
}

func parseSubcategorySave(body []byte) (string, string, string, string) {
	var object map[string]any
	if json.Unmarshal(body, &object) != nil {
		return "", "", "", "分类操作失败"
	}
	parentID, _ := object["parentId"].(string)
	value, _ := object["value"].(string)
	name, _ := object["name"].(string)
	return parentID, value, strings.TrimSpace(name), ""
}

func motherReplacementHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Query().Get("motherId")
		if id == "" || len(id) > 160 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "缺少有效母组 ID"})
			return
		}
		db, err := database.OpenRequired(cfg.SQLiteFile())
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
