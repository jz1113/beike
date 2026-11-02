package sales

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/httpx"
)

// Both sound kinds share one delete endpoint. Roll back if either write fails.
func deleteStudioSound(w http.ResponseWriter, r *http.Request, db *sql.DB, workspace, id string) {
	tx, err := db.BeginTx(r.Context(), nil)
	if err != nil {
		writeStudioSoundMutation(w, nil, err)
		return
	}
	defer tx.Rollback()
	voice, err := tx.ExecContext(r.Context(), `DELETE FROM "AvatarVoice" WHERE "workspaceId"=? AND "id"=?`, workspace, id)
	if err != nil {
		writeStudioSoundMutation(w, nil, err)
		return
	}
	bgm, err := tx.ExecContext(r.Context(), `DELETE FROM "SalesProductionPreset" WHERE "workspaceId"=? AND "category"=? AND "id"=?`, workspace, customBgmPresetCategory, id)
	if err != nil {
		writeStudioSoundMutation(w, nil, err)
		return
	}
	voices, _ := voice.RowsAffected()
	bgms, _ := bgm.RowsAffected()
	if err := tx.Commit(); err != nil {
		writeStudioSoundMutation(w, nil, err)
		return
	}
	if voices+bgms == 0 {
		writeStudioSoundReadError(w, sql.ErrNoRows, "声音")
		return
	}
	httpx.WriteJSON(w, 200, map[string]any{"success": true})
}

func writeStudioSoundReadError(w http.ResponseWriter, err error, kind string) {
	status, message := 500, "读取声音资产失败，请重试"
	if err == sql.ErrNoRows {
		status, message = 404, kind+"资产不存在"
	}
	httpx.WriteJSON(w, status, map[string]any{"success": false, "error": message})
}

func writeStudioSoundMutation(w http.ResponseWriter, result sql.Result, err error) {
	if err != nil {
		httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "保存声音资产变更失败，请重试"})
		return
	}
	affected, err := result.RowsAffected()
	if err != nil {
		writeStudioSoundReadError(w, err, "声音")
		return
	}
	if affected == 0 {
		writeStudioSoundReadError(w, sql.ErrNoRows, "声音")
		return
	}
	httpx.WriteJSON(w, 200, map[string]any{"success": true})
}

func updateStudioSound(w http.ResponseWriter, r *http.Request, db *sql.DB, workspace, id string, body studioSoundMutation) {
	if strings.HasPrefix(id, "bgm_") || strings.TrimSpace(body.SoundType) == "bgm" {
		var raw string
		var curName string
		if err := db.QueryRowContext(r.Context(), `SELECT "name","configJson" FROM "SalesProductionPreset" WHERE "workspaceId"=? AND "category"=? AND "id"=?`, workspace, customBgmPresetCategory, id).Scan(&curName, &raw); err != nil {
			writeStudioSoundReadError(w, err, "BGM")
			return
		}
		var cfg map[string]any
		_ = json.Unmarshal([]byte(raw), &cfg)
		if cfg == nil {
			cfg = map[string]any{}
		}
		title := strings.TrimSpace(body.Title)
		if title == "" {
			title = strings.TrimSpace(body.Name)
		}
		if title == "" {
			title = curName
		}
		if body.Description != nil || body.PromptText != nil {
			desc := soundText(body.Description)
			if body.Description == nil {
				desc = soundText(body.PromptText)
			}
			cfg["description"] = desc
		}
		if body.MoodTags != nil || body.Tags != nil {
			tags := body.MoodTags
			if tags == nil {
				tags = body.Tags
			}
			cfg["moodTags"] = tags
		}
		if body.BPM >= 30 && body.BPM <= 240 {
			cfg["bpm"] = body.BPM
		}
		if strings.TrimSpace(body.AudioURL) != "" {
			cfg["audioUrl"] = strings.TrimSpace(body.AudioURL)
		}
		updatedRaw, _ := json.Marshal(cfg)
		now := time.Now().UTC().Format(time.RFC3339)
		result, err := db.ExecContext(r.Context(), `UPDATE "SalesProductionPreset" SET "name"=?,"configJson"=?,"updatedAt"=? WHERE "workspaceId"=? AND "category"=? AND "id"=?`,
			title, string(updatedRaw), now, workspace, customBgmPresetCategory, id)
		writeStudioSoundMutation(w, result, err)
		return
	}
	var curName, curGender, rawTags, curPrompt, curAudio, curVoiceID string
	if err := db.QueryRowContext(r.Context(), `SELECT "name","gender",COALESCE("tags",'[]'),COALESCE("promptText",''),COALESCE("sampleAudioUrl",''),COALESCE("voiceId",'') FROM "AvatarVoice" WHERE "workspaceId"=? AND "id"=?`, workspace, id).Scan(&curName, &curGender, &rawTags, &curPrompt, &curAudio, &curVoiceID); err != nil {
		writeStudioSoundReadError(w, err, "人声")
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		name = strings.TrimSpace(body.Title)
	}
	if name == "" {
		name = curName
	}
	var existingTags []string
	_ = json.Unmarshal([]byte(rawTags), &existingTags)
	inputTags := body.Tags
	if inputTags == nil {
		inputTags = existingTags
	}
	prompt := curPrompt
	if body.PromptText != nil {
		prompt = soundText(body.PromptText)
	} else if body.Description != nil {
		prompt = soundText(body.Description)
	}
	inputGender := strings.TrimSpace(body.Gender)
	if inputGender == "" {
		inputGender = curGender
	}
	group := normalizeVoiceGroup(inputGender, body.VoiceGroup, inputTags, name, prompt)
	gender := curGender
	if group == "male" {
		gender = "male"
	} else if group == "female" {
		gender = "female"
	}
	tags := mergeVoiceTags(group, inputTags)
	tagsJSON, _ := json.Marshal(tags)
	audio := strings.TrimSpace(body.AudioURL)
	if audio == "" {
		audio = curAudio
	}
	voiceID := strings.TrimSpace(body.VoiceID)
	if voiceID == "" {
		voiceID = curVoiceID
	}
	result, err := db.ExecContext(r.Context(), `UPDATE "AvatarVoice" SET "name"=?,"gender"=?,"tags"=?,"promptText"=?,"sampleAudioUrl"=?,"audioUrl"=?,"voiceId"=? WHERE "workspaceId"=? AND "id"=?`,
		name, gender, string(tagsJSON), prompt, audio, audio, voiceID, workspace, id)
	writeStudioSoundMutation(w, result, err)
}
