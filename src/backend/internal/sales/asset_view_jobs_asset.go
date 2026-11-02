package sales

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"

	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
)

func assetViewJobAssetTable(kind string) (string, string, string) {
	if kind == "persona" {
		return "PersonaAsset", "avatarUrl", "personaViews"
	}
	return "SceneAsset", "coverUrl", "sceneViews"
}

func validateAssetViewJobData(kind string, data map[string]any) error {
	nameKey, coverKey := "title", "coverUrl"
	if kind == "persona" {
		nameKey, coverKey = "name", "avatarUrl"
	}
	name, _ := data[nameKey].(string)
	cover, _ := data[coverKey].(string)
	if strings.TrimSpace(name) == "" || len([]rune(name)) > 80 || strings.TrimSpace(cover) == "" {
		return assetViewJobClientError{400, "请填写资产名称并上传参考主图"}
	}
	for key, value := range data {
		switch key {
		case "name", "title", "description", "tags", "avatarUrl", "coverUrl", "sourceImages", "dimensions", "spatialType", "lighting", "category", "suitableCategories":
			if _, ok := value.(string); !ok {
				return assetViewJobClientError{400, "资产字段类型无效"}
			}
		default:
			return assetViewJobClientError{400, "不支持的资产字段：" + key}
		}
	}
	if raw, ok := data["dimensions"].(string); ok && raw != "" {
		var dimensions map[string]any
		if json.Unmarshal([]byte(raw), &dimensions) != nil || dimensions == nil {
			return assetViewJobClientError{400, "资产视角数据无效"}
		}
	}
	return nil
}

func recoverAssetViewJobAsset(ctx context.Context, db *sql.DB, workspace string, job *assetViewJob, data map[string]any) error {
	table, _, _ := assetViewJobAssetTable(job.Kind)
	if job.AssetID == "" {
		// If a process stopped between the asset commit and recording its ID, the
		// marker recovers that exact asset instead of creating a second one.
		err := db.QueryRowContext(ctx, `SELECT "id" FROM "`+table+`" WHERE "workspaceId"=? AND json_valid("dimensions") AND json_extract("dimensions",'$.salesAssetViewJobId')=? LIMIT 1`, workspace, job.ID).Scan(&job.AssetID)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if err == nil {
			job.baseSaved = true
			return persistAssetViewJob(ctx, db, workspace, job)
		}
	}
	if err := validateAssetViewJobData(job.Kind, data); err != nil {
		return err
	}
	var raw json.RawMessage
	var err error
	if job.AssetID == "" {
		clean := map[string]any{}
		for key, value := range data {
			clean[key] = value
		}
		dimensions := map[string]any{}
		if text, _ := data["dimensions"].(string); text != "" {
			_ = json.Unmarshal([]byte(text), &dimensions)
		}
		dimensions["salesAssetViewJobId"] = job.ID
		encoded, _ := json.Marshal(dimensions)
		clean["dimensions"] = string(encoded)
		raw, err = dblibrary.CreateLibraryAsset(ctx, db, workspace, job.Kind, clean)
	} else {
		raw, err = dblibrary.UpdateLibraryAsset(ctx, db, workspace, job.Kind, job.AssetID, data)
	}
	if errors.Is(err, dblibrary.ErrLibraryRecordMissing) {
		return assetViewJobClientError{404, "资产不存在或已删除"}
	}
	if err != nil {
		return err
	}
	var saved struct {
		ID string `json:"id"`
	}
	if json.Unmarshal(raw, &saved) != nil || saved.ID == "" {
		return errors.New("saved asset ID missing")
	}
	job.AssetID = saved.ID
	job.baseSaved = true
	return persistAssetViewJob(ctx, db, workspace, job)
}

func saveAssetViewJobImages(ctx context.Context, db *sql.DB, workspace string, job assetViewJob) error {
	table, coverColumn, viewField := assetViewJobAssetTable(job.Kind)
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var rawDimensions, rawSources, cover string
	err = tx.QueryRowContext(ctx, `SELECT COALESCE("dimensions",''),COALESCE("sourceImages",'[]'),COALESCE("`+coverColumn+`",'') FROM "`+table+`" WHERE "id"=? AND "workspaceId"=?`, job.AssetID, workspace).Scan(&rawDimensions, &rawSources, &cover)
	if errors.Is(err, sql.ErrNoRows) {
		return errors.New("资产已删除，生成结果未重新创建资产")
	}
	if err != nil {
		return err
	}
	dimensions := map[string]any{}
	if rawDimensions != "" && (json.Unmarshal([]byte(rawDimensions), &dimensions) != nil || dimensions == nil) {
		return errors.New("现有资产视角数据无效，生成结果已保留")
	}
	views, _ := dimensions[viewField].(map[string]any)
	if views == nil {
		views = map[string]any{}
	}
	if len(views) == 0 {
		views["main"] = cover
	}
	if expected := assetViewJobMain(job.Kind, job.assetData); expected != "" {
		current, _ := views["main"].(string)
		if current != expected {
			return errors.New("参考主图已更改，原九宫格已保留，请使用当前主图重新生成")
		}
	}
	for _, view := range assetGridViews[job.Kind] {
		existing, _ := views[view].(string)
		if strings.TrimSpace(existing) == "" {
			if job.Images[view] == "" {
				return errors.New("九宫格裁片不完整")
			}
			views[view] = job.Images[view]
		}
	}
	dimensions[viewField] = views
	if job.Kind == "persona" {
		if face, _ := views["face"].(string); face != "" {
			cover = face
		}
	}
	sources, seen := []string{}, map[string]bool{}
	add := func(value string) {
		if value != "" && !seen[value] {
			seen[value] = true
			sources = append(sources, value)
		}
	}
	main, _ := views["main"].(string)
	add(main)
	for _, view := range assetGridViews[job.Kind] {
		text, _ := views[view].(string)
		add(text)
	}
	for _, value := range parseSourceImageList(rawSources, cover) {
		add(value)
	}
	encodedDimensions, err := json.Marshal(dimensions)
	if err != nil {
		return err
	}
	encodedSources, err := json.Marshal(sources)
	if err != nil {
		return err
	}
	result, err := tx.ExecContext(ctx, `UPDATE "`+table+`" SET "dimensions"=?,"sourceImages"=?,"`+coverColumn+`"=?,"updatedAt"=? WHERE "id"=? AND "workspaceId"=?`, string(encodedDimensions), string(encodedSources), cover, time.Now().UTC().Format(time.RFC3339Nano), job.AssetID, workspace)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count != 1 {
		return errors.New("资产已删除")
	}
	return tx.Commit()
}

func assetViewJobMain(kind string, data map[string]any) string {
	_, coverField, viewField := assetViewJobAssetTable(kind)
	var dimensions map[string]any
	raw, _ := data["dimensions"].(string)
	if json.Unmarshal([]byte(raw), &dimensions) == nil {
		if views, ok := dimensions[viewField].(map[string]any); ok {
			if main, ok := views["main"].(string); ok && main != "" {
				return main
			}
		}
	}
	cover, _ := data[coverField].(string)
	return cover
}
