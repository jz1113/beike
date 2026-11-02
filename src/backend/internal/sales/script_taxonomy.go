package sales

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

type scriptTaxonomyItem struct {
	ID   string `json:"id"`
	Kind string `json:"kind"`
	Name string `json:"name"`
}

func validateScriptTaxonomyRefs(ctx context.Context, db *sql.DB, workspace string, script map[string]any) error {
	taxonomy, _ := script["taxonomy"].(map[string]any)
	for field, kind := range map[string]string{"categoryId": "category", "styleId": "style"} {
		value, present := taxonomy[field]
		if !present {
			continue
		}
		id, ok := value.(string)
		if !ok {
			return errors.New("分类或风格编号格式错误")
		}
		if id == "" {
			continue
		}
		var count int
		if err := db.QueryRowContext(ctx, `SELECT count(*) FROM "SalesScriptTaxonomy" WHERE "workspaceId"=? AND "kind"=? AND "id"=?`, workspace, kind, id).Scan(&count); err != nil {
			return err
		}
		if count != 1 {
			return errors.New("所选分类或风格已移除，请刷新并重新选择")
		}
	}
	return nil
}

func taxonomyDB(cfg config.Config, w http.ResponseWriter) *sql.DB {
	db, err := database.OpenRequired(cfg.SQLiteFile())
	if err != nil {
		httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "分类与风格库暂不可用"})
		return nil
	}
	return db
}

func taxonomyName(w http.ResponseWriter, r *http.Request) (scriptTaxonomyItem, bool) {
	var body scriptTaxonomyItem
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
	if decoder.Decode(&body) != nil || decoder.Decode(new(any)) != io.EOF {
		httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": "分类或风格请求格式错误"})
		return body, false
	}
	body.Name = strings.TrimSpace(body.Name)
	if body.Name == "" || len([]rune(body.Name)) > 40 {
		httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": "名称须为 1—40 个字"})
		return body, false
	}
	return body, true
}

func taxonomyWriteError(w http.ResponseWriter, err error) {
	if strings.Contains(strings.ToLower(err.Error()), "unique constraint") {
		httpx.WriteJSON(w, 409, map[string]any{"success": false, "error": "同名分类或风格已存在"})
		return
	}
	httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "保存分类或风格失败，请重试"})
}

func ScriptTaxonomy(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		db := taxonomyDB(cfg, w)
		if db == nil {
			return
		}
		defer db.Close()
		workspace := httpx.WorkspaceFrom(r)
		if r.Method == http.MethodGet {
			rows, err := db.QueryContext(r.Context(), `SELECT "id","kind","name" FROM "SalesScriptTaxonomy" WHERE "workspaceId"=? ORDER BY "createdAt","id"`, workspace)
			if err != nil {
				httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "读取分类与风格失败"})
				return
			}
			defer rows.Close()
			items := []scriptTaxonomyItem{}
			for rows.Next() {
				var item scriptTaxonomyItem
				if err := rows.Scan(&item.ID, &item.Kind, &item.Name); err != nil {
					httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "读取分类与风格失败"})
					return
				}
				items = append(items, item)
			}
			if rows.Err() != nil {
				httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "读取分类与风格失败"})
				return
			}
			httpx.WriteJSON(w, 200, map[string]any{"success": true, "items": items})
			return
		}
		if r.Method != http.MethodPost {
			httpx.WriteJSON(w, 405, map[string]any{"success": false, "error": "不支持的请求方式"})
			return
		}
		item, ok := taxonomyName(w, r)
		if !ok {
			return
		}
		if item.Kind != "category" && item.Kind != "style" {
			httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": "请选择分类或风格"})
			return
		}
		item.ID = "taxonomy_" + httpx.RequestID()
		now := time.Now().UTC().Format(time.RFC3339Nano)
		_, err := db.ExecContext(r.Context(), `INSERT INTO "SalesScriptTaxonomy" ("id","workspaceId","kind","name","createdAt","updatedAt") VALUES (?,?,?,?,?,?)`, item.ID, workspace, item.Kind, item.Name, now, now)
		if err != nil {
			taxonomyWriteError(w, err)
			return
		}
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "item": item})
	}
}

func ScriptTaxonomyByID(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		db := taxonomyDB(cfg, w)
		if db == nil {
			return
		}
		defer db.Close()
		workspace, id := httpx.WorkspaceFrom(r), strings.TrimSpace(r.PathValue("id"))
		// Reading and changing the item share a transaction, so a rename cannot recreate a deleted item.
		tx, err := db.BeginTx(r.Context(), nil)
		if err != nil {
			taxonomyWriteError(w, err)
			return
		}
		defer tx.Rollback()
		var item scriptTaxonomyItem
		err = tx.QueryRowContext(r.Context(), `SELECT "id","kind","name" FROM "SalesScriptTaxonomy" WHERE "workspaceId"=? AND "id"=?`, workspace, id).Scan(&item.ID, &item.Kind, &item.Name)
		if errors.Is(err, sql.ErrNoRows) {
			httpx.WriteJSON(w, 404, map[string]any{"success": false, "error": "分类或风格不存在，请刷新后重试"})
			return
		}
		if err != nil {
			taxonomyWriteError(w, err)
			return
		}
		now := time.Now().UTC().Format(time.RFC3339Nano)
		switch r.Method {
		case http.MethodPatch:
			body, ok := taxonomyName(w, r)
			if !ok {
				return
			}
			item.Name = body.Name
			_, err = tx.ExecContext(r.Context(), `UPDATE "SalesScriptTaxonomy" SET "name"=?,"updatedAt"=? WHERE "workspaceId"=? AND "id"=?`, item.Name, now, workspace, id)
		case http.MethodDelete:
			field := "categoryId"
			if item.Kind == "style" {
				field = "styleId"
			}
			path := "$.taxonomy." + field
			// All scripts, including archived ones, keep their content and only lose this filing reference.
			_, err = tx.ExecContext(r.Context(), `UPDATE "SalesReferenceScript" SET "scriptJson"=json_set("scriptJson",?,''),"version"="version"+1,"updatedAt"=? WHERE "workspaceId"=? AND json_extract("scriptJson",?)=?`, path, now, workspace, path, id)
			if err == nil && item.Kind == "category" {
				err = removeActionCategory(r.Context(), tx, workspace, id, now)
			}
			if err == nil {
				_, err = tx.ExecContext(r.Context(), `DELETE FROM "SalesScriptTaxonomy" WHERE "workspaceId"=? AND "id"=?`, workspace, id)
			}
		default:
			httpx.WriteJSON(w, 405, map[string]any{"success": false, "error": "不支持的请求方式"})
			return
		}
		if err != nil {
			taxonomyWriteError(w, err)
			return
		}
		if err = tx.Commit(); err != nil {
			taxonomyWriteError(w, err)
			return
		}
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "item": item})
	}
}

// Actions may belong to several categories. Removing one filing reference must
// preserve the others, including historical single-ID records.
func removeActionCategory(ctx context.Context, tx *sql.Tx, workspace, categoryID, now string) error {
	rows, err := tx.QueryContext(ctx, `SELECT "id",COALESCE("productCategoryIds",'[]') FROM "ActionAsset" WHERE "workspaceId"=?`, workspace)
	if err != nil {
		return err
	}
	type actionCategories struct{ id, raw string }
	var candidates []actionCategories
	for rows.Next() {
		var action actionCategories
		if err := rows.Scan(&action.id, &action.raw); err != nil {
			rows.Close()
			return err
		}
		candidates = append(candidates, action)
	}
	err = rows.Err()
	if closeErr := rows.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	for _, action := range candidates {
		ids, _ := parseActionCategoryIDs(action.raw)
		remaining := make([]string, 0, len(ids))
		for _, id := range ids {
			if id != categoryID {
				remaining = append(remaining, id)
			}
		}
		if len(remaining) == len(ids) {
			continue
		}
		raw, err := json.Marshal(remaining)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE "ActionAsset" SET "productCategoryIds"=?,"updatedAt"=? WHERE "workspaceId"=? AND "id"=?`, string(raw), now, workspace, action.id); err != nil {
			return err
		}
	}
	return nil
}
