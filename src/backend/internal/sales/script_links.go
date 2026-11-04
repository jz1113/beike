package sales

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/storage"
)

func linkValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func validateScriptLinks(ctx context.Context, db *sql.DB, workspace, video, depthVideo, task, operation string) error {
	for _, raw := range []string{video, depthVideo} {
		if raw == "" {
			continue
		}
		parsed, err := url.Parse(raw)
		if err == nil && raw == depthVideo && parsed.Scheme == "https" && len(raw) <= 8192 && trustedDepthVideoURL(ctx, db, workspace, raw) {
			continue
		}
		if err != nil || len(raw) > 8192 || parsed.IsAbs() || parsed.Host != "" || !strings.HasPrefix(parsed.Path, "/storage/") || path.Clean(parsed.Path) != parsed.Path || strings.Contains(parsed.Path, "\\") {
			return errors.New("关联视频必须来自当前工作区的素材存储")
		}
		rel := strings.TrimPrefix(parsed.Path, "/storage/")
		owned := storage.WorkspaceRel(rel, workspace, false) || (workspace == "local" && strings.HasPrefix(rel, "azhuo/"))
		if !owned || scriptVideoMIME[strings.ToLower(path.Ext(parsed.Path))] == "" {
			return errors.New("关联视频不属于当前工作区或格式不支持")
		}
	}
	if len(task) > 256 || len(operation) > 256 {
		return errors.New("深度视频任务标识过长")
	}
	if task != "" {
		var owned int
		if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM "ImageTask" WHERE "workspaceId"=? AND "id"=? AND "mediaType"='depth-video'`, workspace, task).Scan(&owned); err != nil || owned == 0 {
			return errors.New("深度视频任务不属于当前工作区")
		}
	}
	return nil
}

func trustedDepthVideoURL(ctx context.Context, db *sql.DB, workspace, raw string) bool {
	var owned int
	if db.QueryRowContext(ctx, `SELECT COUNT(*) FROM "ActionAsset" WHERE "workspaceId"=? AND "mediaType"='depth-video' AND "mediaUrl"=?`, workspace, raw).Scan(&owned) == nil && owned > 0 {
		return true
	}
	return db.QueryRowContext(ctx, `SELECT COUNT(*) FROM "ImageTask" WHERE "workspaceId"=? AND "mediaType"='depth-video' AND "status"='SUCCESS' AND "resultUrl"=?`, workspace, raw).Scan(&owned) == nil && owned > 0
}

// Updating an asynchronous conversion receipt never writes a stale copy of the
// script, taxonomy or review state that the user may be editing concurrently.
func patchScriptLinks(w http.ResponseWriter, r *http.Request, db *sql.DB, workspace, id string, body patchScriptBody) {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := db.ExecContext(r.Context(), `UPDATE "SalesReferenceScript" SET "videoHash"=CASE WHEN COALESCE(?,"videoUrl")!="videoUrl" THEN '' ELSE "videoHash" END,"videoUrl"=COALESCE(?,"videoUrl"),"depthVideoUrl"=COALESCE(?,"depthVideoUrl"),"depthTaskId"=COALESCE(?,"depthTaskId"),"depthOperationId"=COALESCE(?,"depthOperationId"),"updatedAt"=? WHERE "workspaceId"=? AND "id"=?`, body.VideoURL, body.VideoURL, body.DepthVideoURL, body.DepthTaskID, body.DepthOperationID, now, workspace, id)
	if err != nil {
		httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "保存关联视频失败，请保留结果并重试"})
		return
	}
	writePatchedScript(w, r, db, workspace, id)
}
