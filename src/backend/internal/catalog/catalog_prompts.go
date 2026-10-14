package catalog

import (
	dbcatalog "beike.local/cloud/src/backend/internal/platform/database/catalog"
	"encoding/json"
	"io"
	"net/http"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func promptRecordsHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "读取提示词记录失败"})
			return
		}
		defer db.Close()
		records, err := dbcatalog.ListRecentPromptRecords(r.Context(), db, httpx.WorkspaceFrom(r))
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "读取提示词记录失败"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "records": records})
	}
}

func promptRecordsCreateHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if err != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "请求数据格式异常"})
			return
		}
		var raw map[string]any
		if err := json.Unmarshal(body, &raw); err != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "请求数据格式异常"})
			return
		}
		draft := dbcatalog.PromptDraft{
			ProductID:    emptyAsNil(raw["productId"]),
			ProductTitle: textOr(raw["productTitle"], "未命名商品"),
			Fingerprint:  textOr(raw["productFingerprint"], ""),
			ModelUsed:    textOr(raw["modelUsed"], "gemini-3.1-pro-preview"),
			StyleName:    textOr(raw["styleName"], "📱 真实手机买家秀"),
			PromptsJSON:  promptsJSON(raw["prompts"]),
		}
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "操作失败，请稍后重试"})
			return
		}
		defer db.Close()
		record, err := dbcatalog.CreatePromptRecord(r.Context(), db, httpx.WorkspaceFrom(r), draft)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "操作失败，请稍后重试"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "record": record})
	}
}

func promptRecordsDeleteHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Query().Get("id")
		if id == "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "缺少 id 参数"})
			return
		}
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "操作失败，请稍后重试"})
			return
		}
		defer db.Close()
		if err := dbcatalog.DeletePromptRecord(r.Context(), db, httpx.WorkspaceFrom(r), id); err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "操作失败，请稍后重试"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true})
	}
}

func emptyAsNil(value any) any {
	text, ok := value.(string)
	if !ok || text == "" {
		return nil
	}
	return text
}

func textOr(value any, fallback string) string {
	text, ok := value.(string)
	if !ok || text == "" {
		return fallback
	}
	return text
}

func promptsJSON(value any) string {
	if text, ok := value.(string); ok {
		return text
	}
	body, err := json.Marshal(value)
	if err != nil || value == nil {
		return "[]"
	}
	return string(body)
}
