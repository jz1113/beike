package library

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func deconstructReviewsHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		status := "pending"
		if r.URL.Query().Get("status") == "rejected" {
			status = "rejected"
		}
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "读取审核列表失败"})
			return
		}
		defer db.Close()
		rows, err := database.ListDeconstructReviews(r.Context(), db, httpx.WorkspaceFrom(r), status)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "读取审核列表失败"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "data": rows})
	}
}

func deconstructReviewsPostHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20+1))
		if err != nil || len(body) > 1<<20 || strings.TrimSpace(string(body)) == "" {
			writeReviewJSONError(w)
			return
		}
		var payload any
		if err := json.Unmarshal(body, &payload); err != nil || payload == nil {
			writeReviewJSONError(w)
			return
		}
		object, ok := payload.(map[string]any)
		id, idOK := object["id"].(string)
		action, actionOK := object["action"].(string)
		if !ok || !idOK || !actionOK || !validReviewAction(action) {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "无效审核操作"})
			return
		}
		if action == "approve" || action == "replace" {
			commitDeconstructReview(cfg, w, r, id, action)
			return
		}
		from, to := "pending", "rejected"
		if action == "restore" {
			from, to = "rejected", "pending"
		}
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "服务器内部错误", "code": "internal_error"})
			return
		}
		defer db.Close()
		if err := database.UpdateDeconstructReviewStatus(r.Context(), db, httpx.WorkspaceFrom(r), id, from, to); err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "服务器内部错误", "code": "internal_error"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true})
	}
}

func validReviewAction(action string) bool {
	switch action {
	case "approve", "replace", "reject", "restore":
		return true
	default:
		return false
	}
}

func writeReviewJSONError(w http.ResponseWriter) {
	httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{
		"success": false, "error": "请求数据格式异常", "code": "internal_error",
	})
}
