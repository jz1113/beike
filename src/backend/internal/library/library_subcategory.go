package library

import (
	"encoding/json"
	"net/http"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func saveLibrarySubcategory(cfg config.Config, w http.ResponseWriter, r *http.Request, body []byte) {
	parentID, value, name, message := parseSubcategorySave(body)
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
	organization, err := database.SavePromptSubcategory(r.Context(), db, httpx.WorkspaceFrom(r), parentID, value, name)
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
