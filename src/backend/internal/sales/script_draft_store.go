package sales

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

// Save analysis before returning it, so depth conversion can attach its receipt
// independently and reconnecting the editor does not repeat a completed model call.
func persistAnalyzedScript(cfg config.Config, workspace, videoURL, videoHash, model, promptVersion, analysisKey string, script map[string]any, force bool) (storedReferenceScript, error) {
	check, err := validateScriptObject(script)
	if err != nil {
		return storedReferenceScript{}, err
	}
	db, err := database.OpenRequired(cfg.SQLiteFile())
	if err != nil {
		return storedReferenceScript{}, err
	}
	defer db.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := validateScriptLinks(ctx, db, workspace, videoURL, "", "", ""); err != nil {
		return storedReferenceScript{}, err
	}
	id := "script_" + httpx.RequestID()
	if videoHash != "" && !force {
		digest := sha256.Sum256([]byte(workspace + "\x00" + videoHash + "\x00" + promptVersion + "\x00" + analysisKey))
		id = "script_" + hex.EncodeToString(digest[:16])
		if previous, err := readReferenceScriptByID(ctx, db, workspace, id); err == nil {
			if _, invalid := validateScriptObject(previous.Script); previous.Status == "archived" || previous.VideoHash != videoHash || invalid != nil {
				// Preserve historical rows while saving a usable replacement for a rejected cache.
				id = "script_" + httpx.RequestID()
			}
		}
	}
	title := strings.TrimSpace(check.Title)
	if title == "" {
		title = "未命名参考脚本"
	}
	if len([]rune(title)) > 120 {
		title = string([]rune(title)[:120])
	}
	script["title"] = title
	raw, _ := json.Marshal(script)
	now := time.Now().UTC().Format(time.RFC3339)
	_, err = db.ExecContext(ctx, `INSERT INTO "SalesReferenceScript" ("id","workspaceId","title","videoUrl","videoHash","durationSec","format","voiceMode","status","scriptJson","model","promptVersion","analysisKey","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?,'verified',?,?,?,?,?,?) ON CONFLICT("id") DO NOTHING`, id, workspace, title, savedSource(workspace, videoURL), videoHash, check.DurationSec, validScriptFormat(check.Format), validScriptVoiceMode(check.VoiceMode), string(raw), model, promptVersion, analysisKey, now, now)
	if err != nil {
		return storedReferenceScript{}, err
	}
	return readReferenceScriptByID(ctx, db, workspace, id)
}
