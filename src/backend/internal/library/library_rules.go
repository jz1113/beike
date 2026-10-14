package library

import (
	dbcatalog "beike.local/cloud/src/backend/internal/platform/database/catalog"
	"encoding/json"
	"net/http"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func saveLibraryFolderRules(cfg config.Config, w http.ResponseWriter, r *http.Request, body []byte) {
	id, keywords, anatomy, message := parseFolderRuleSave(body)
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
	organization, err := dbcatalog.SavePromptFolderRules(r.Context(), db, httpx.WorkspaceFrom(r), id, keywords, anatomy)
	if err != nil {
		writeLibraryMutationError(w, err.Error())
		return
	}
	writeLibraryOrganization(w, organization)
}

func importLibraryFolderRules(cfg config.Config, w http.ResponseWriter, r *http.Request, body []byte) {
	parentID, mode, items, message := parseFolderRuleImport(body)
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
	result, err := dbcatalog.ImportPromptFolderRules(r.Context(), db, httpx.WorkspaceFrom(r), parentID, mode, items)
	if err != nil {
		writeLibraryMutationError(w, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"success": true, "categories": result.Organization.Categories, "albums": result.Organization.Albums,
		"createdCount": result.CreatedCount, "updatedCount": result.UpdatedCount,
	})
}

func parseFolderRuleSave(body []byte) (string, []string, []string, string) {
	var object map[string]any
	if json.Unmarshal(body, &object) != nil {
		return "", nil, nil, "分类操作失败"
	}
	id, _ := object["id"].(string)
	id = strings.TrimSpace(id)
	if id == "" || utf16Length(id) > 200 {
		return "", nil, nil, "分类操作失败"
	}
	keywords, message := ruleWords(object["keywords"], 200, "关键词最多 200 项")
	if message != "" {
		return "", nil, nil, message
	}
	anatomy, message := ruleWords(object["anatomy"], 32, "部位规则最多 32 项")
	if message != "" {
		return "", nil, nil, message
	}
	return id, keywords, anatomy, ""
}

func parseFolderRuleImport(body []byte) (string, string, []dbcatalog.FolderRuleItem, string) {
	var object map[string]any
	if json.Unmarshal(body, &object) != nil {
		return "", "", nil, "分类操作失败"
	}
	parentID, _ := object["parentId"].(string)
	parentID = strings.TrimSpace(parentID)
	if parentID == "" || utf16Length(parentID) > 200 {
		return "", "", nil, "分类操作失败"
	}
	mode, _ := object["mode"].(string)
	if mode != "append" && mode != "replace" {
		return "", "", nil, "分类操作失败"
	}
	list, ok := object["items"].([]any)
	if !ok || len(list) == 0 {
		return "", "", nil, "请至少导入一个文件夹"
	}
	if len(list) > 100 {
		return "", "", nil, "一次最多导入 100 个文件夹"
	}
	items := []dbcatalog.FolderRuleItem{}
	names := map[string]struct{}{}
	for _, raw := range list {
		item, ok := raw.(map[string]any)
		if !ok {
			return "", "", nil, "分类操作失败"
		}
		name, _ := item["name"].(string)
		name = strings.TrimSpace(name)
		if name == "" {
			return "", "", nil, "文件夹名称不能为空"
		}
		if utf16Length(name) > 40 {
			return "", "", nil, "文件夹名称最多 40 个字"
		}
		if _, exists := names[name]; exists {
			return "", "", nil, "同一批次文件夹名称不可重复"
		}
		names[name] = struct{}{}
		keywords, message := ruleWords(item["keywords"], 200, "关键词最多 200 项")
		if message != "" {
			return "", "", nil, message
		}
		anatomy := []string{}
		_, hasAnatomy := item["anatomy"]
		if hasAnatomy {
			anatomy, message = ruleWords(item["anatomy"], 32, "部位规则最多 32 项")
			if message != "" {
				return "", "", nil, message
			}
		}
		items = append(items, dbcatalog.FolderRuleItem{Name: name, Keywords: keywords, Anatomy: anatomy, HasAnatomy: hasAnatomy})
	}
	return parentID, mode, items, ""
}

func ruleWords(value any, limit int, limitMessage string) ([]string, string) {
	list, ok := value.([]any)
	if !ok {
		return nil, "分类操作失败"
	}
	if len(list) > limit {
		return nil, limitMessage
	}
	words := []string{}
	seen := map[string]struct{}{}
	for _, item := range list {
		text, ok := item.(string)
		if !ok {
			return nil, "分类操作失败"
		}
		word := strings.TrimSpace(text)
		if word == "" {
			return nil, "规则词不能为空"
		}
		if utf16Length(word) > 80 {
			return nil, "规则词最多 80 个字"
		}
		if _, exists := seen[word]; exists {
			continue
		}
		seen[word] = struct{}{}
		words = append(words, word)
	}
	return words, ""
}

func utf16Length(value string) int {
	count := 0
	for _, char := range value {
		count++
		if char > 0xFFFF {
			count++
		}
	}
	return count
}
