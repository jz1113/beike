package library

import (
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
	"database/sql"
	"fmt"
	"net/http"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func serveLibraryPurge(cfg config.Config, w http.ResponseWriter, r *http.Request) {
	db, err := httpx.OpenDB(cfg)
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
	db, err := httpx.OpenDB(cfg)
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
	db, err := httpx.OpenDB(cfg)
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
