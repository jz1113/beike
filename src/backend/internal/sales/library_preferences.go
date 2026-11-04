package sales

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

type libraryPreferences struct {
	ShowEntry      bool `json:"showEntry"`
	SharingEnabled bool `json:"sharingEnabled"`
}

func readLibraryPreferences(ctx context.Context, db *sql.DB, workspace string) (libraryPreferences, error) {
	prefs := libraryPreferences{ShowEntry: true}
	err := db.QueryRowContext(ctx, "SELECT showEntry,sharingEnabled FROM WorkspaceLibraryPreferences WHERE workspaceId=?", workspace).Scan(&prefs.ShowEntry, &prefs.SharingEnabled)
	if errors.Is(err, sql.ErrNoRows) {
		return prefs, nil
	}
	return prefs, err
}

func LibraryPreferences(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			httpx.WriteJSON(w, 500, map[string]any{"error": "无法读取资产库设置"})
			return
		}
		defer db.Close()
		workspace := httpx.WorkspaceFrom(r)
		if r.Method == http.MethodPatch {
			var patch struct {
				ShowEntry      *bool `json:"showEntry"`
				SharingEnabled *bool `json:"sharingEnabled"`
			}
			d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024))
			d.DisallowUnknownFields()
			if d.Decode(&patch) != nil || d.Decode(new(any)) != io.EOF || (patch.ShowEntry == nil && patch.SharingEnabled == nil) {
				httpx.WriteJSON(w, 400, map[string]any{"error": "请选择要修改的资产库设置"})
				return
			}
			_, err = db.ExecContext(r.Context(), `INSERT INTO WorkspaceLibraryPreferences(workspaceId,showEntry,sharingEnabled)
			VALUES(?,COALESCE(?,1),COALESCE(?,0)) ON CONFLICT(workspaceId) DO UPDATE SET
			showEntry=COALESCE(?,showEntry),sharingEnabled=COALESCE(?,sharingEnabled)`, workspace, patch.ShowEntry, patch.SharingEnabled, patch.ShowEntry, patch.SharingEnabled)
			if err != nil {
				httpx.WriteJSON(w, 500, map[string]any{"error": "保存工作区资产库设置失败"})
				return
			}
		}
		prefs, err := readLibraryPreferences(r.Context(), db, workspace)
		if err != nil {
			httpx.WriteJSON(w, 500, map[string]any{"error": "无法读取资产库设置"})
			return
		}
		httpx.WriteJSON(w, 200, prefs)
	}
}
