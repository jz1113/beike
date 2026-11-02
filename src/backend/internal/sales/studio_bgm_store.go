package sales

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func readStudioBgm(ctx context.Context, db *sql.DB, workspace, id string) (studioBgm, bool, error) {
	var track studioBgm
	var raw string
	err := db.QueryRowContext(ctx, `SELECT "name","configJson" FROM "SalesProductionPreset" WHERE "workspaceId"=? AND "category"=? AND "id"=?`, workspace, customBgmPresetCategory, id).Scan(&track.Title, &raw)
	if errors.Is(err, sql.ErrNoRows) {
		return track, false, nil
	}
	if err != nil {
		return track, false, err
	}
	title := track.Title
	if err := json.Unmarshal([]byte(raw), &track); err != nil || track.AudioURL == "" {
		return studioBgm{}, false, errors.New("配乐记录无法读取")
	}
	track.ID, track.Title, track.Source, track.Editable = id, title, "custom_bgm", true
	return track, true, nil
}

func resolveStudioMixBgm(ctx context.Context, cfg config.Config, workspace, id string, client audioMixMediaClient) (string, func(), error) {
	if _, found := lookupBuiltinBgm(id); found {
		file, _, cleanup, err := prepareStudioBgmInput(ctx, cfg, workspace, studioBgmImportRequest{BuiltinID: id}, client)
		return file, cleanup, err
	}
	db, err := database.OpenRequired(cfg.SQLiteFile())
	if err != nil {
		return "", func() {}, errors.New("读取配乐资产库失败")
	}
	defer db.Close()
	track, found, err := readStudioBgm(ctx, db, workspace, id)
	if err != nil {
		return "", func() {}, errors.New("读取配乐资产失败")
	}
	if !found {
		return "", func() {}, errors.New("配乐不存在或不属于当前工作区")
	}
	return resolveAudioMixMedia(ctx, track.AudioURL, workspace, false, client)
}

func saveImportedStudioBgm(ctx context.Context, db *sql.DB, workspace string, track studioBgm, body studioBgmImportRequest) (studioBgm, bool, error) {
	metadata := map[string]any{
		"audioUrl": track.AudioURL, "description": track.Description, "moodTags": track.MoodTags,
		"bpm": track.BPM, "durationSec": track.DurationSec, "license": track.License,
		"suitableCategories": track.SuitableCategories, "importStartSec": body.StartSec,
		"importSource": "audio", "builtinId": body.BuiltinID,
	}
	if body.VideoURL != "" {
		metadata["importSource"] = "reference_video"
	} else if body.BuiltinID != "" {
		metadata["importSource"] = "builtin"
	}
	raw, _ := json.Marshal(metadata)
	now := time.Now().UTC().Format(time.RFC3339)
	result, err := db.ExecContext(ctx, `INSERT INTO "SalesProductionPreset" ("id","workspaceId","name","category","configJson","isDefault","createdAt","updatedAt") VALUES (?,?,?,?,?,0,?,?) ON CONFLICT("id") DO NOTHING`,
		track.ID, workspace, track.Title, customBgmPresetCategory, string(raw), now, now)
	if err != nil {
		return studioBgm{}, false, err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return studioBgm{}, false, err
	}
	if count > 0 {
		return track, true, nil
	}
	existing, found, err := readStudioBgm(ctx, db, workspace, track.ID)
	if err == nil && !found {
		err = errors.New("保存后的配乐记录不存在")
	}
	return existing, false, err
}
