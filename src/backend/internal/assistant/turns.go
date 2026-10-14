package assistant

import (
	"net/http"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func ThreadTurns(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		threadID := r.PathValue("threadId")
		if threadID == "" || len(threadID) >= 256 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "缺少 threadId"})
			return
		}
		deleted, err := threadDeleted(cfg, r, threadID)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "对话记录读取失败，请稍后重试"})
			return
		}
		if deleted {
			httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "error": "对话已删除"})
			return
		}
		turns, err := listThreadTurnRows(r.Context(), cfg, httpx.WorkspaceFrom(r), threadID, r.URL.Query().Get("status"))
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "对话记录读取失败，请稍后重试"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "turns": turns})
	})
}

func TurnRecover(cfg config.Config) http.Handler { return TurnSnapshot(cfg) }

func AllRuns(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		markRunsDeprecated(w)
		writeRuns(cfg, w, r, "")
	})
}

func ThreadRuns(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		markRunsDeprecated(w)
		threadID := r.PathValue("threadId")
		if threadID == "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "缺少 threadId"})
			return
		}
		deleted, err := threadDeleted(cfg, r, threadID)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "任务列表读取失败，请稍后重试"})
			return
		}
		if deleted {
			httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "error": "对话已删除"})
			return
		}
		writeRuns(cfg, w, r, threadID)
	})
}

func writeRuns(cfg config.Config, w http.ResponseWriter, r *http.Request, threadID string) {
	includeCompleted := false
	limit := 20
	if threadID == "" {
		includeCompleted = r.URL.Query().Get("includeCompleted") == "1"
		limit = httpx.QueryInt(r, "limit", 20)
		if limit < 1 {
			limit = 1
		}
		if limit > 50 {
			limit = 50
		}
	}
	runs, err := listRunRows(r.Context(), cfg, httpx.WorkspaceFrom(r), threadID, includeCompleted, limit)
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "任务列表读取失败，请稍后重试"})
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "runs": runs})
}

func markRunsDeprecated(w http.ResponseWriter) {
	w.Header().Set("Deprecation", "true")
	w.Header().Set("Link", `</api/assistant/threads/:threadId/turns>; rel="successor-version"`)
}

func TurnSnapshot(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		turnID := r.PathValue("turnId")
		if turnID == "" || len(turnID) >= 256 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "缺少 turnId"})
			return
		}
		snapshot, err := readTurnSnapshot(r.Context(), cfg, httpx.WorkspaceFrom(r), turnID)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "对话记录读取失败，请稍后重试"})
			return
		}
		if snapshot == nil {
			httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "error": "Turn 不存在或对话已删除"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "snapshot": snapshot})
	})
}
