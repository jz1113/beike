package library

import (
	dbcatalog "beike.local/cloud/src/backend/internal/platform/database/catalog"
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
	"encoding/json"
	"net/http"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func classifyLibraryAssets(cfg config.Config, w http.ResponseWriter, r *http.Request, body []byte) {
	assetType, ids, categories, universal, message := parseAssetClassify(body)
	if message != "" {
		writeLibraryMutationError(w, message)
		return
	}
	db, err := httpx.OpenDB(cfg)
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
	db, err := httpx.OpenDB(cfg)
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
	db, err := httpx.OpenDB(cfg)
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
