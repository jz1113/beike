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

func patchSalesProduct(ctx context.Context, db *sql.DB, workspace string, id string, patch salesProductPatchInput) (salesProductRecord, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return salesProductRecord{}, err
	}
	defer tx.Rollback()

	row := tx.QueryRowContext(ctx, `SELECT `+salesProductColumns+` FROM "SalesProduct" WHERE "workspaceId"=? AND "id"=?`, workspace, id)
	current, err := scanSalesProduct(row)
	if errors.Is(err, sql.ErrNoRows) {
		return salesProductRecord{}, errSalesProductNotFound
	}
	if err != nil {
		return salesProductRecord{}, err
	}

	now := time.Now().UTC().Format(time.RFC3339Nano)
	if patch.Title != nil {
		current.Title = strings.TrimSpace(*patch.Title)
	}
	if patch.Category != nil {
		current.Category = normalizeProductCategory(*patch.Category)
		if patch.CategorySource != nil {
			current.CategorySource = normalizeClassificationSource(*patch.CategorySource)
		} else {
			current.CategorySource = "manual"
		}
	}
	if patch.Audience != nil {
		current.Audience = normalizeProductAudience(*patch.Audience)
		if patch.AudienceSource != nil {
			current.AudienceSource = normalizeClassificationSource(*patch.AudienceSource)
		} else {
			current.AudienceSource = "manual"
		}
	}
	if patch.IncrementOutput {
		current.OutputCount++
	}
	if patch.MarkOpened {
		current.LastOpenedAt = now
	}
	current.UpdatedAt = now

	// 同步修正 draftJson 顶层的 category / audience 元数据，确保重新打开草稿时分类完全一致。
	var draft map[string]any
	if err := json.Unmarshal([]byte(current.DraftJSON), &draft); err == nil && draft != nil {
		if patch.Title != nil && current.Title != "" {
			draft["productName"] = current.Title
		}
		if patch.Category != nil {
			draft["category"] = current.Category
			draft["categorySource"] = current.CategorySource
		}
		if patch.Audience != nil {
			draft["audience"] = current.Audience
			draft["audienceSource"] = current.AudienceSource
		}
		if encoded, err := json.Marshal(draft); err == nil {
			current.DraftJSON = string(encoded)
		}
	}

	_, err = tx.ExecContext(
		ctx,
		`UPDATE "SalesProduct" SET "title"=?,"category"=?,"categorySource"=?,"audience"=?,"audienceSource"=?,"outputCount"=?,"draftJson"=?,"lastOpenedAt"=?,"updatedAt"=? WHERE "workspaceId"=? AND "id"=?`,
		current.Title,
		current.Category,
		current.CategorySource,
		current.Audience,
		current.AudienceSource,
		current.OutputCount,
		current.DraftJSON,
		current.LastOpenedAt,
		current.UpdatedAt,
		workspace,
		id,
	)
	if err != nil {
		return salesProductRecord{}, err
	}
	if err := tx.Commit(); err != nil {
		return salesProductRecord{}, err
	}
	return current, nil
}

func deleteSalesProduct(ctx context.Context, db *sql.DB, workspace string, id string) error {
	res, err := db.ExecContext(ctx, `DELETE FROM "SalesProduct" WHERE "workspaceId"=? AND "id"=?`, workspace, id)
	if err != nil {
		return err
	}
	count, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return errSalesProductNotFound
	}
	return nil
}

func openSalesProductsDB(cfg config.Config, w http.ResponseWriter) *sql.DB {
	db, err := database.OpenRequired(cfg.SQLiteFile())
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "商品资产库暂不可用"})
		return nil
	}
	return db
}

// Products 处理电商视频商品库列表读取（GET）与商品快照保存（POST）。
func Products(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		db := openSalesProductsDB(cfg, w)
		if db == nil {
			return
		}
		defer db.Close()
		workspace := httpx.WorkspaceFrom(r)

		switch r.Method {
		case http.MethodGet:
			items, err := listSalesProducts(r.Context(), db, workspace, salesProductListFilter{
				Category: r.URL.Query().Get("category"),
				Audience: r.URL.Query().Get("audience"),
				Query:    r.URL.Query().Get("q"),
			})
			if err != nil {
				httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "读取商品库失败"})
				return
			}
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "items": items})

		case http.MethodPost:
			var input salesProductUpsertInput
			dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<20))
			if err := dec.Decode(&input); err != nil || dec.Decode(new(any)) != io.EOF {
				httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "商品保存请求格式错误"})
				return
			}
			item, err := upsertSalesProduct(r.Context(), db, workspace, input)
			if errors.Is(err, errSalesProductConflict) {
				httpx.WriteJSON(w, http.StatusConflict, map[string]any{"success": false, "error": err.Error()})
				return
			}
			if err != nil {
				httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "保存商品失败"})
				return
			}
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "item": item})

		default:
			httpx.WriteJSON(w, http.StatusMethodNotAllowed, map[string]any{"success": false, "error": "不支持的请求方式"})
		}
	}
}

// ProductByID 处理单个商品读取（GET）、分类/出片数局部更新（PATCH）与移除（DELETE）。
func ProductByID(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		db := openSalesProductsDB(cfg, w)
		if db == nil {
			return
		}
		defer db.Close()
		workspace := httpx.WorkspaceFrom(r)
		id := strings.TrimSpace(r.PathValue("id"))
		if id == "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "缺少商品编号"})
			return
		}

		switch r.Method {
		case http.MethodGet:
			item, err := getSalesProductByID(r.Context(), db, workspace, id)
			if errors.Is(err, errSalesProductNotFound) {
				httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "error": err.Error()})
				return
			}
			if err != nil {
				httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "读取商品详情失败"})
				return
			}
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "item": item})

		case http.MethodPatch:
			var patch salesProductPatchInput
			dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10))
			if err := dec.Decode(&patch); err != nil || dec.Decode(new(any)) != io.EOF {
				httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "商品更新参数格式错误"})
				return
			}
			item, err := patchSalesProduct(r.Context(), db, workspace, id, patch)
			if errors.Is(err, errSalesProductNotFound) {
				httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "error": err.Error()})
				return
			}
			if err != nil {
				httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "更新商品失败"})
				return
			}
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "item": item})

		case http.MethodDelete:
			err := deleteSalesProduct(r.Context(), db, workspace, id)
			if errors.Is(err, errSalesProductNotFound) {
				httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "error": err.Error()})
				return
			}
			if err != nil {
				httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "移除商品失败"})
				return
			}
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "deletedId": id})

		default:
			httpx.WriteJSON(w, http.StatusMethodNotAllowed, map[string]any{"success": false, "error": "不支持的请求方式"})
		}
	}
}
