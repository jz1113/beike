package catalog

import (
	dbcatalog "beike.local/cloud/src/backend/internal/platform/database/catalog"
	"io"
	"net/http"
	"path/filepath"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func categoriesHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "架构操作失败，请稍后重试。"})
			return
		}
		defer db.Close()
		categories, err := dbcatalog.ListServerSubCategories(r.Context(), db, httpx.WorkspaceFrom(r), filepath.Join(cfg.Root, "src/shared/data/defaultSubCategories.json"))
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "架构操作失败，请稍后重试。"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "categories": categories})
	}
}

func categoryPreviewHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20+1))
		if err != nil || len(body) > 1<<20 {
			writeCategoryPreviewError(w)
			return
		}
		local, ok := parseCategoryPreview(body)
		if !ok {
			writeCategoryPreviewError(w)
			return
		}
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			writeCategoryPreviewError(w)
			return
		}
		defer db.Close()
		preview, err := dbcatalog.PreviewCategoryMigration(r.Context(), db, httpx.WorkspaceFrom(r), filepath.Join(cfg.Root, "src/shared/data/defaultSubCategories.json"), local)
		if err != nil {
			writeCategoryPreviewError(w)
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "preview": preview})
	}
}

func categoryApplyHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20+1))
		if err != nil || len(body) > 1<<20 {
			writeCategoryApplyError(w)
			return
		}
		items, ok := parseCategoryApply(body)
		if !ok {
			writeCategoryApplyError(w)
			return
		}
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			writeCategoryApplyError(w)
			return
		}
		defer db.Close()
		categories, err := dbcatalog.ApplyCategoryMigration(r.Context(), db, httpx.WorkspaceFrom(r), filepath.Join(cfg.Root, "src/shared/data/defaultSubCategories.json"), items)
		if err != nil {
			writeCategoryApplyError(w)
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "categories": categories})
	}
}

func writeCategoryApplyError(w http.ResponseWriter) {
	httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{
		"success": false, "error": "类目迁移写入失败", "code": "bad_request",
	})
}

func writeCategoryPreviewError(w http.ResponseWriter) {
	httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{
		"success": false, "error": "类目迁移预览参数不正确", "code": "bad_request",
	})
}
