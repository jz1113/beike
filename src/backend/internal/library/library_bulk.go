package library

import (
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
	"encoding/json"
	"net/http"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func serveLibraryBulkImport(cfg config.Config, w http.ResponseWriter, r *http.Request, items []any, registries, replacements, categories, albums any) {
	db, err := httpx.OpenDB(cfg)
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
