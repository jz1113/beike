package workshop

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func WorkspaceGet(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mode := r.URL.Query().Get("mode")
		if mode != "original" {
			writeFail(w, http.StatusBadRequest, "无效的工坊模式", "bad_request")
			return
		}
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			writeFail(w, http.StatusInternalServerError, "工作区读取失败，已保留原记录，请检查本地服务", "internal_error")
			return
		}
		defer db.Close()
		row, err := database.ReadWorkshopWorkspace(r.Context(), db, httpx.WorkspaceFrom(r), mode)
		if err != nil {
			writeFail(w, http.StatusInternalServerError, "工作区读取失败，已保留原记录，请检查本地服务", "internal_error")
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		if row.Empty {
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "revision": 0, "snapshot": nil, "updatedAt": nil})
			return
		}
		var snapshot map[string]any
		if json.Unmarshal([]byte(row.Snapshot), &snapshot) != nil {
			writeFail(w, http.StatusInternalServerError, "工作区读取失败，已保留原记录，请检查本地服务", "internal_error")
			return
		}
		if message := prepareSnapshot(snapshot, mode); message != "" {
			writeFail(w, http.StatusInternalServerError, "工作区读取失败，已保留原记录，请检查本地服务", "internal_error")
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "revision": row.Revision, "snapshot": snapshot, "updatedAt": row.UpdatedAt})
	})
}

func WorkspacePut(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mode := r.URL.Query().Get("mode")
		if mode != "original" {
			writeFail(w, http.StatusBadRequest, "无效的工坊模式", "bad_request")
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, 8<<20+1))
		if err != nil {
			writeFail(w, http.StatusBadRequest, "工作区格式不正确", "bad_request")
			return
		}
		if len(body) > 8<<20 {
			writeFail(w, http.StatusRequestEntityTooLarge, "工作区超过 8 MB，请减少内嵌图片后保存", "payload_too_large")
			return
		}
		var payload map[string]any
		if json.Unmarshal(body, &payload) != nil {
			writeFail(w, http.StatusBadRequest, "工作区格式不正确", "bad_request")
			return
		}
		revision, ok := whole(payload["revision"])
		snapshot, snapshotOK := payload["snapshot"].(map[string]any)
		if !ok || revision < 0 || !snapshotOK {
			writeFail(w, http.StatusBadRequest, "工作区格式不正确", "bad_request")
			return
		}
		if message := prepareSnapshot(snapshot, mode); message != "" {
			status := http.StatusBadRequest
			if message == "工作区模式不一致" {
				writeFail(w, status, message, "bad_request")
				return
			}
			writeFail(w, status, "工作区格式不正确", "bad_request")
			return
		}
		encoded, err := json.Marshal(snapshot)
		if err != nil {
			writeFail(w, http.StatusBadRequest, "工作区格式不正确", "bad_request")
			return
		}
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			writeFail(w, http.StatusInternalServerError, "工作区保存失败，请重试", "internal_error")
			return
		}
		defer db.Close()
		updatedAt := time.Now().UTC().Format(time.RFC3339Nano)
		next, err := database.WriteWorkshopWorkspace(r.Context(), db, httpx.WorkspaceFrom(r), mode, revision, string(encoded), updatedAt)
		if errors.Is(err, database.ErrWorkspaceConflict) {
			writeFail(w, http.StatusConflict, err.Error(), "conflict")
			return
		}
		if err != nil {
			writeFail(w, http.StatusInternalServerError, "工作区保存失败，请重试", "internal_error")
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "revision": next, "updatedAt": updatedAt})
	})
}

func writeFail(w http.ResponseWriter, status int, message, code string) {
	httpx.WriteJSON(w, status, map[string]any{"success": false, "error": message, "code": code})
}
