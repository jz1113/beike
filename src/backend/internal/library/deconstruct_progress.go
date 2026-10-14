package library

import (
	"net/http"
	"sync"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

type deconstructProgress struct {
	Stage     string `json:"stage"`
	Message   string `json:"message"`
	StartedAt int64  `json:"startedAt"`
	UpdatedAt int64  `json:"updatedAt"`
}

var progressByTask sync.Map

func deconstructProgressHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		taskID := r.URL.Query().Get("clientTaskId")
		if taskID == "" || len(taskID) > 160 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "缺少有效的任务 ID"})
			return
		}
		value, _ := progressByTask.Load(progressKey(httpx.WorkspaceFrom(r), taskID))
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "progress": value})
	}
}

func updateDeconstructProgress(workspace, taskID, stage, message string) deconstructProgress {
	if taskID == "" {
		return deconstructProgress{}
	}
	key := progressKey(workspace, taskID)
	now := time.Now().UnixMilli()
	started := now
	if previous, ok := progressByTask.Load(key); ok {
		started = previous.(deconstructProgress).StartedAt
	}
	next := deconstructProgress{Stage: stage, Message: message, StartedAt: started, UpdatedAt: now}
	progressByTask.Store(key, next)
	if stage == "completed" || stage == "failed" {
		completedAt := now
		time.AfterFunc(10*time.Minute, func() {
			if current, ok := progressByTask.Load(key); ok && current.(deconstructProgress).UpdatedAt == completedAt {
				progressByTask.Delete(key)
			}
		})
	}
	return next
}

func progressKey(workspace, taskID string) string {
	return workspace + ":" + taskID
}
