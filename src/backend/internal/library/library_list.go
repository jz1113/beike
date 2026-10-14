package library

import (
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"unicode"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func serveLibraryList(cfg config.Config, w http.ResponseWriter, r *http.Request, assetType string) {
	query := r.URL.Query()
	page := boundedQueryInt(query.Get("page"), 1, 1, 0)
	pageSize := boundedQueryInt(query.Get("pageSize"), 50, 1, 100)
	db, err := httpx.OpenDB(cfg)
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
