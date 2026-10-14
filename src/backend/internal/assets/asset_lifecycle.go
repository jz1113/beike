package assets

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func assetLifecycleHandler(cfg config.Config, action string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		assetType := r.PathValue("type")
		if !validAssetType(assetType) {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{
				"success": false, "error": "资产类型或操作不正确", "code": "bad_request",
			})
			return
		}
		reason := "人工停用"
		if action == "disable" {
			parsed, ok := readDisableReason(r)
			if !ok {
				httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{
					"success": false, "error": "资产生命周期操作失败", "code": "bad_request",
				})
				return
			}
			reason = parsed
		}
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{
				"success": false, "error": "资产生命周期操作失败", "code": "bad_request",
			})
			return
		}
		defer db.Close()
		registry, err := database.ApplyAssetLifecycle(r.Context(), db, httpx.WorkspaceFrom(r), assetType, r.PathValue("id"), action, reason)
		if err != nil {
			var lifecycle *database.LifecycleError
			if errors.As(err, &lifecycle) {
				httpx.WriteJSON(w, lifecycle.Status, map[string]any{
					"success": false, "error": lifecycle.Message, "code": lifecycle.Code,
				})
				return
			}
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{
				"success": false, "error": "资产生命周期操作失败", "code": "bad_request",
			})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "registry": registry})
	}
}

func readDisableReason(r *http.Request) (string, bool) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		return "", false
	}
	if len(strings.TrimSpace(string(body))) == 0 {
		return "人工停用", true
	}
	var payload map[string]json.RawMessage
	if json.Unmarshal(body, &payload) != nil {
		return "人工停用", true
	}
	raw, ok := payload["reason"]
	if !ok {
		return "人工停用", true
	}
	if string(raw) == "null" {
		return "", false
	}
	var reason string
	if json.Unmarshal(raw, &reason) != nil || len([]rune(reason)) > 500 {
		return "", false
	}
	if reason == "" {
		return "人工停用", true
	}
	return reason, true
}
