package avatar

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"time"
)

func parseDBTime(raw string) time.Time {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return time.Time{}
	}
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339, "2006-01-02 15:04:05", "2006-01-02T15:04:05"} {
		if parsed, err := time.Parse(layout, raw); err == nil {
			return parsed
		}
	}
	return time.Time{}
}

func ListCharacters(ctx context.Context, db *sql.DB, workspaceID string) ([]Character, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT id, workspaceId, name, type, status, statusMsg, videoUrl, coverUrl,
		       coverWidth, coverHeight, audioPromptUrl, welcomeVideoUrl, humanId,
		       description, createdAt, updatedAt
		FROM "AvatarCharacter"
		WHERE workspaceId = ? OR workspaceId = 'legacy'
		ORDER BY type ASC, createdAt DESC
	`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var characters []Character
	for rows.Next() {
		var c Character
		var createdAt, updatedAt string
		if err := rows.Scan(
			&c.ID, &c.WorkspaceID, &c.Name, &c.Type, &c.Status, &c.StatusMsg,
			&c.VideoURL, &c.CoverURL, &c.CoverWidth, &c.CoverHeight,
			&c.AudioPromptURL, &c.WelcomeVideoURL, &c.HumanID,
			&c.Description, &createdAt, &updatedAt,
		); err != nil {
			return nil, err
		}
		c.CreatedAt = parseDBTime(createdAt)
		c.UpdatedAt = parseDBTime(updatedAt)
		characters = append(characters, c)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return characters, nil
}

func FindCharacter(ctx context.Context, db *sql.DB, workspaceID, id string) (*Character, error) {
	characters, err := ListCharacters(ctx, db, workspaceID)
	if err != nil {
		return nil, err
	}
	for i := range characters {
		if characters[i].ID == id {
			return &characters[i], nil
		}
	}
	return nil, nil
}

func FindVoice(ctx context.Context, db *sql.DB, workspaceID, id string) (*Voice, error) {
	voices, err := ListVoices(ctx, db, workspaceID)
	if err != nil {
		return nil, err
	}
	for i := range voices {
		if voices[i].ID == id {
			return &voices[i], nil
		}
	}
	return nil, nil
}

func InsertCharacter(ctx context.Context, db *sql.DB, c Character) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := db.ExecContext(ctx, `
		INSERT INTO "AvatarCharacter" (
			id, workspaceId, name, type, status, statusMsg, videoUrl, coverUrl,
			coverWidth, coverHeight, audioPromptUrl, welcomeVideoUrl, humanId,
			description, createdAt, updatedAt
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, c.ID, c.WorkspaceID, c.Name, c.Type, c.Status, c.StatusMsg, c.VideoURL, c.CoverURL,
		c.CoverWidth, c.CoverHeight, c.AudioPromptURL, c.WelcomeVideoURL, c.HumanID,
		c.Description, now, now)
	return err
}

func DeleteCharacter(ctx context.Context, db *sql.DB, workspaceID, id string) error {
	_, err := db.ExecContext(ctx, `
		DELETE FROM "AvatarCharacter"
		WHERE id = ? AND (workspaceId = ? OR workspaceId = 'legacy')
	`, id, workspaceID)
	return err
}

func ListVoices(ctx context.Context, db *sql.DB, workspaceID string) ([]Voice, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT id, workspaceId, name, type, status, statusMsg, audioUrl, promptNpyUrl,
		       promptText, sampleAudioUrl, voiceId, gender, tags, createdAt, updatedAt
		FROM "AvatarVoice"
		WHERE workspaceId = ? OR workspaceId = 'legacy'
		ORDER BY type ASC, createdAt DESC
	`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var voices []Voice
	for rows.Next() {
		var v Voice
		var tagsJSON, createdAt, updatedAt string
		if err := rows.Scan(
			&v.ID, &v.WorkspaceID, &v.Name, &v.Type, &v.Status, &v.StatusMsg,
			&v.AudioURL, &v.PromptNpyURL, &v.PromptText, &v.SampleAudioURL,
			&v.VoiceID, &v.Gender, &tagsJSON, &createdAt, &updatedAt,
		); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(tagsJSON), &v.Tags)
		v.CreatedAt = parseDBTime(createdAt)
		v.UpdatedAt = parseDBTime(updatedAt)
		voices = append(voices, v)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return voices, nil
}

func InsertVoice(ctx context.Context, db *sql.DB, v Voice) error {
	now := time.Now().UTC().Format(time.RFC3339)
	tagsJSON, _ := json.Marshal(v.Tags)
	_, err := db.ExecContext(ctx, `
		INSERT INTO "AvatarVoice" (
			id, workspaceId, name, type, status, statusMsg, audioUrl, promptNpyUrl,
			promptText, sampleAudioUrl, voiceId, gender, tags, createdAt, updatedAt
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, v.ID, v.WorkspaceID, v.Name, v.Type, v.Status, v.StatusMsg, v.AudioURL, v.PromptNpyURL,
		v.PromptText, v.SampleAudioURL, v.VoiceID, v.Gender, string(tagsJSON), now, now)
	return err
}

func UpdateVoiceClone(ctx context.Context, db *sql.DB, id string, status int, statusMsg, voiceID string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := db.ExecContext(ctx, `
		UPDATE "AvatarVoice"
		SET status = ?, statusMsg = ?, voiceId = ?, updatedAt = ?
		WHERE id = ?
	`, status, statusMsg, voiceID, now, id)
	return err
}

func DeleteVoice(ctx context.Context, db *sql.DB, workspaceID, id string) error {
	_, err := db.ExecContext(ctx, `
		DELETE FROM "AvatarVoice"
		WHERE id = ? AND (workspaceId = ? OR workspaceId = 'legacy')
	`, id, workspaceID)
	return err
}

func ListFonts(ctx context.Context, db *sql.DB) ([]Font, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT id, name, nickname, fontUrl, previewUrl
		FROM "AvatarFont"
		ORDER BY id ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var fonts []Font
	for rows.Next() {
		var f Font
		if err := rows.Scan(&f.ID, &f.Name, &f.Nickname, &f.FontURL, &f.PreviewURL); err != nil {
			return nil, err
		}
		fonts = append(fonts, f)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return fonts, nil
}

func ListTasks(ctx context.Context, db *sql.DB, workspaceID string) ([]VideoTask, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT id, workspaceId, title, scriptContent, layout, resolution, frameRate,
		       exportFormat, avatarId, avatarPosition, avatarScale, voiceId, voiceSpeed,
		       voiceVolume, bgType, bgColor, bgMediaUrl, subtitleEnabled, fontId, fontSize,
		       fontColor, fontPosition, status, progress, currentStage, statusMsg, videoUrl,
		       coverUrl, duration, error, createdAt, updatedAt, finishedAt
		FROM "AvatarVideoTask"
		WHERE workspaceId = ? OR workspaceId = 'legacy'
		ORDER BY createdAt DESC
	`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tasks []VideoTask
	for rows.Next() {
		var t VideoTask
		var createdAt, updatedAt string
		var finishedAt sql.NullString
		if err := rows.Scan(
			&t.ID, &t.WorkspaceID, &t.Title, &t.ScriptContent, &t.Layout, &t.Resolution, &t.FrameRate,
			&t.ExportFormat, &t.AvatarID, &t.AvatarPosition, &t.AvatarScale, &t.VoiceID, &t.VoiceSpeed,
			&t.VoiceVolume, &t.BgType, &t.BgColor, &t.BgMediaURL, &t.SubtitleEnabled, &t.FontID, &t.FontSize,
			&t.FontColor, &t.FontPosition, &t.Status, &t.Progress, &t.CurrentStage, &t.StatusMsg, &t.VideoURL,
			&t.CoverURL, &t.Duration, &t.Error, &createdAt, &updatedAt, &finishedAt,
		); err != nil {
			return nil, err
		}
		t.CreatedAt = parseDBTime(createdAt)
		t.UpdatedAt = parseDBTime(updatedAt)
		if finishedAt.Valid && finishedAt.String != "" {
			if ft := parseDBTime(finishedAt.String); !ft.IsZero() {
				t.FinishedAt = &ft
			}
		}
		tasks = append(tasks, t)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return tasks, nil
}

func GetTask(ctx context.Context, db *sql.DB, workspaceID, id string) (*VideoTask, error) {
	row := db.QueryRowContext(ctx, `
		SELECT id, workspaceId, title, scriptContent, layout, resolution, frameRate,
		       exportFormat, avatarId, avatarPosition, avatarScale, voiceId, voiceSpeed,
		       voiceVolume, bgType, bgColor, bgMediaUrl, subtitleEnabled, fontId, fontSize,
		       fontColor, fontPosition, status, progress, currentStage, statusMsg, videoUrl,
		       coverUrl, duration, error, createdAt, updatedAt, finishedAt
		FROM "AvatarVideoTask"
		WHERE id = ? AND (workspaceId = ? OR workspaceId = 'legacy')
	`, id, workspaceID)

	var t VideoTask
	var createdAt, updatedAt string
	var finishedAt sql.NullString
	if err := row.Scan(
		&t.ID, &t.WorkspaceID, &t.Title, &t.ScriptContent, &t.Layout, &t.Resolution, &t.FrameRate,
		&t.ExportFormat, &t.AvatarID, &t.AvatarPosition, &t.AvatarScale, &t.VoiceID, &t.VoiceSpeed,
		&t.VoiceVolume, &t.BgType, &t.BgColor, &t.BgMediaURL, &t.SubtitleEnabled, &t.FontID, &t.FontSize,
		&t.FontColor, &t.FontPosition, &t.Status, &t.Progress, &t.CurrentStage, &t.StatusMsg, &t.VideoURL,
		&t.CoverURL, &t.Duration, &t.Error, &createdAt, &updatedAt, &finishedAt,
	); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	t.CreatedAt = parseDBTime(createdAt)
	t.UpdatedAt = parseDBTime(updatedAt)
	if finishedAt.Valid && finishedAt.String != "" {
		if ft := parseDBTime(finishedAt.String); !ft.IsZero() {
			t.FinishedAt = &ft
		}
	}
	return &t, nil
}

func InsertTask(ctx context.Context, db *sql.DB, t VideoTask) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := db.ExecContext(ctx, `
		INSERT INTO "AvatarVideoTask" (
			id, workspaceId, title, scriptContent, layout, resolution, frameRate,
			exportFormat, avatarId, avatarPosition, avatarScale, voiceId, voiceSpeed,
			voiceVolume, bgType, bgColor, bgMediaUrl, subtitleEnabled, fontId, fontSize,
			fontColor, fontPosition, status, progress, currentStage, statusMsg, videoUrl,
			coverUrl, duration, error, createdAt, updatedAt
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, t.ID, t.WorkspaceID, t.Title, t.ScriptContent, t.Layout, t.Resolution, t.FrameRate,
		t.ExportFormat, t.AvatarID, t.AvatarPosition, t.AvatarScale, t.VoiceID, t.VoiceSpeed,
		t.VoiceVolume, t.BgType, t.BgColor, t.BgMediaURL, t.SubtitleEnabled, t.FontID, t.FontSize,
		t.FontColor, t.FontPosition, t.Status, t.Progress, t.CurrentStage, t.StatusMsg, t.VideoURL,
		t.CoverURL, t.Duration, t.Error, now, now)
	return err
}

func UpdateTaskProgress(ctx context.Context, db *sql.DB, id string, progress int, stage, statusMsg string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := db.ExecContext(ctx, `
		UPDATE "AvatarVideoTask"
		SET progress = ?, currentStage = ?, statusMsg = ?, updatedAt = ?
		WHERE id = ?
	`, progress, stage, statusMsg, now, id)
	return err
}

func CompleteTask(ctx context.Context, db *sql.DB, id, videoURL, coverURL string, duration float64) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := db.ExecContext(ctx, `
		UPDATE "AvatarVideoTask"
		SET status = 1, progress = 100, currentStage = '已完成', statusMsg = '生成完成',
		    videoUrl = ?, coverUrl = ?, duration = ?, finishedAt = ?, updatedAt = ?
		WHERE id = ?
	`, videoURL, coverURL, duration, now, now, id)
	return err
}

func FailTask(ctx context.Context, db *sql.DB, id, errMsg string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := db.ExecContext(ctx, `
		UPDATE "AvatarVideoTask"
		SET status = 2, currentStage = '失败', statusMsg = '生成失败',
		    error = ?, finishedAt = ?, updatedAt = ?
		WHERE id = ?
	`, errMsg, now, now, id)
	return err
}

func DeleteTask(ctx context.Context, db *sql.DB, workspaceID, id string) error {
	_, err := db.ExecContext(ctx, `
		DELETE FROM "AvatarVideoTask"
		WHERE id = ? AND (workspaceId = ? OR workspaceId = 'legacy')
	`, id, workspaceID)
	return err
}
