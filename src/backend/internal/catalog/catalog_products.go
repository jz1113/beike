package catalog

import (
	dbcatalog "beike.local/cloud/src/backend/internal/platform/database/catalog"
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/media"
)

func productsHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		page := httpx.QueryInt(r, "page", 1)
		if page < 1 {
			page = 1
		}
		pageSize := httpx.QueryInt(r, "pageSize", 50)
		if pageSize < 1 {
			pageSize = 1
		}
		if pageSize > 100 {
			pageSize = 100
		}
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "products": []any{}, "error": "读取商品失败"})
			return
		}
		defer db.Close()
		total, products, err := dbcatalog.ListProducts(r.Context(), db, httpx.WorkspaceFrom(r), page, pageSize)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "products": []any{}, "error": "读取商品失败"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"success": true, "page": page, "pageSize": pageSize, "total": total, "products": products,
		})
	}
}

func productsCreateHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, ok := readObject(w, r)
		if !ok {
			return
		}
		title := textOr(raw["title"], "")
		itemID := anyText(raw["itemId"])
		if title == "" || itemID == "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "缺少商品标题或商品ID"})
			return
		}
		platform := textOr(raw["platform"], "local")
		saved := imageList(raw["selectedImages"])
		if len(saved) == 0 {
			if detail, ok := raw["detailUrls"].(map[string]any); ok {
				saved = imageList(detail["main"])
			}
		}
		if len(saved) == 0 {
			if pic := media.NormalizeImageURLToStandardJpg(textOr(raw["picUrl"], "")); pic != "" {
				saved = []string{pic}
			}
		}
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "操作失败，请稍后重试"})
			return
		}
		defer db.Close()
		product, err := dbcatalog.SaveCollectedProduct(r.Context(), db, httpx.WorkspaceFrom(r), platform, itemID, title, media.NormalizeImageURLToStandardJpg(textOr(raw["picUrl"], "")), saved)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "操作失败，请稍后重试"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "product": product})
	}
}

func productsUpdateHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, ok := readObject(w, r)
		if !ok {
			return
		}
		id := textOr(raw["id"], "")
		if id == "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "缺少商品记录 id"})
			return
		}
		var title, itemID, picURL, detailURLs *string
		if value := textOr(raw["title"], ""); value != "" {
			title = &value
		}
		if value := anyText(raw["itemId"]); value != "" {
			itemID = &value
		}
		if value := textOr(raw["picUrl"], ""); value != "" {
			normalized := media.NormalizeImageURLToStandardJpg(value)
			picURL = &normalized
		}
		if list, ok := raw["selectedImages"].([]any); ok {
			body, err := json.Marshal(map[string]any{"main": normalizeList(list)})
			if err != nil {
				httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "操作失败，请稍后重试"})
				return
			}
			encoded := string(body)
			detailURLs = &encoded
		}
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "操作失败，请稍后重试"})
			return
		}
		defer db.Close()
		product, err := dbcatalog.UpdateProduct(r.Context(), db, httpx.WorkspaceFrom(r), id, title, itemID, picURL, detailURLs)
		if errors.Is(err, dbcatalog.ErrProductMissing) || err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "操作失败，请稍后重试"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "product": product})
	}
}

func readObject(w http.ResponseWriter, r *http.Request) (map[string]any, bool) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "请求数据格式异常"})
		return nil, false
	}
	var raw map[string]any
	if err := json.Unmarshal(body, &raw); err != nil || raw == nil {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "请求数据格式异常"})
		return nil, false
	}
	return raw, true
}

func anyText(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case float64:
		return jsonNumber(typed)
	default:
		return ""
	}
}

func jsonNumber(value float64) string {
	body, err := json.Marshal(value)
	if err != nil {
		return ""
	}
	return string(body)
}

func imageList(value any) []string {
	list, ok := value.([]any)
	if !ok {
		return nil
	}
	return normalizeList(list)
}

func normalizeList(list []any) []string {
	images := []string{}
	for _, item := range list {
		text, ok := item.(string)
		if !ok {
			continue
		}
		if normalized := media.NormalizeImageURLToStandardJpg(text); normalized != "" {
			images = append(images, normalized)
		}
	}
	return images
}
