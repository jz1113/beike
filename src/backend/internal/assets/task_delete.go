package assets

import (
	dbworkshop "beike.local/cloud/src/backend/internal/platform/database/workshop"
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func assetTasksDeleteHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20+1))
		if err != nil || len(body) > 1<<20 {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "操作失败，请稍后重试"})
			return
		}
		object := map[string]any{}
		if len(strings.TrimSpace(string(body))) > 0 && json.Unmarshal(body, &object) != nil {
			object = map[string]any{}
		}
		clearAll := r.URL.Query().Get("clearAll") == "true" || object["clearAll"] == true
		clearFailed := r.URL.Query().Get("clearFailed") == "true" || object["clearFailed"] == true
		if clearAll && !taskAdminAuthorized(r, cfg) {
			httpx.WriteJSON(w, http.StatusUnauthorized, map[string]any{"success": false, "error": "clearAll requires admin token"})
			return
		}
		selection := dbworkshop.TaskRemovalSelection{All: clearAll, Failed: !clearAll && clearFailed}
		if !selection.All && !selection.Failed {
			selection.IDs = uniqueTaskValues(r.URL.Query().Get("id"), r.URL.Query().Get("ids"), object["id"], object["ids"])
			selection.URLs = uniqueTaskValues(r.URL.Query().Get("url"), r.URL.Query().Get("urls"), object["url"], object["urls"])
			if len(selection.IDs) == 0 && len(selection.URLs) == 0 {
				httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "缺少待删除的任务 ID 或 URL"})
				return
			}
		}
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "操作失败，请稍后重试"})
			return
		}
		defer db.Close()
		result, err := dbworkshop.RemoveImageTasks(r.Context(), db, httpx.WorkspaceFrom(r), selection, stringList(object["protectUrls"]), cfg.MediaReviewRoot(), cfg.Production())
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "操作失败，请稍后重试"})
			return
		}
		payload := map[string]any{"success": true, "count": result.Count, "mediaCleanup": result.MediaCleanup}
		if result.Warning != "" {
			payload["warning"] = result.Warning
		}
		httpx.WriteJSON(w, http.StatusOK, payload)
	}
}

func taskAdminAuthorized(r *http.Request, cfg config.Config) bool {
	if !cfg.Production() {
		return true
	}
	return httpx.TokenMatches(httpx.RequestToken(r), cfg.AdminToken)
}

func uniqueTaskValues(single, csv string, bodySingle, bodyMany any) []string {
	values := []string{}
	seen := map[string]struct{}{}
	add := func(value string) {
		value = strings.TrimSpace(value)
		if value == "" {
			return
		}
		if _, ok := seen[value]; ok {
			return
		}
		seen[value] = struct{}{}
		values = append(values, value)
	}
	add(single)
	for _, part := range strings.Split(csv, ",") {
		add(part)
	}
	if text, ok := bodySingle.(string); ok {
		add(text)
	}
	for _, item := range stringList(bodyMany) {
		add(item)
	}
	return values
}

func stringList(value any) []string {
	list, ok := value.([]any)
	if !ok {
		return nil
	}
	values := []string{}
	for _, item := range list {
		if text, ok := item.(string); ok && strings.TrimSpace(text) != "" {
			values = append(values, strings.TrimSpace(text))
		}
	}
	return values
}
