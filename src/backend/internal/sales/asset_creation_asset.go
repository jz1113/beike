package sales

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"
)

func assetCreationFacts(kind string, data map[string]any) map[string]any {
	if kind == "scene" {
		return map[string]any{"spatialType": assetCreationText(data["spatialType"]), "lighting": assetCreationText(data["lighting"])}
	}
	var dimensions map[string]any
	_ = json.Unmarshal([]byte(assetCreationText(data["dimensions"])), &dimensions)
	labels := map[string]string{"adult_male": "成年男", "adult_female": "成年女", "senior_male": "老年男", "senior_female": "老年女", "child_male": "男童", "child_female": "女童", "adult_unisex": "成年人", "senior_unisex": "老年人", "child_unisex": "儿童"}
	audience := assetCreationText(dimensions["audience"])
	return map[string]any{"audience": labels[audience]}
}

// Commit the main image and its prompt before supplementary views. A failed grid
// remains a usable saved asset, and retries preserve the exact main image.
func saveAssetCreationMain(ctx context.Context, db *sql.DB, workspace string, job assetViewJob) error {
	creation := assetCreationResultFor(job.generation)
	if creation == nil || creation.ImageURL == "" || creation.Prompt == "" {
		return errors.New("资产主图或绘图提示词尚未生成")
	}
	table, coverField, viewField := assetViewJobAssetTable(job.Kind)
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var raw, cover string
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE("dimensions",''),COALESCE("`+coverField+`",'') FROM "`+table+`" WHERE "id"=? AND "workspaceId"=?`, job.AssetID, workspace).Scan(&raw, &cover); err != nil {
		return errors.New("资产不存在，生成结果已保留")
	}
	var dimensions map[string]any
	if json.Unmarshal([]byte(raw), &dimensions) != nil || dimensions == nil {
		return errors.New("资产视角数据无效，生成结果已保留")
	}
	current := assetCreationFromData(map[string]any{"dimensions": raw})
	views, _ := dimensions[viewField].(map[string]any)
	main := assetCreationText(views["main"])
	if len(views) == 0 {
		main = cover
	}
	if current == nil || current.ReferenceImageURL != creation.ReferenceImageURL {
		return errors.New("资产参考图已更改，生成结果已保留，请重新生成")
	}
	if main == creation.ImageURL && current.ImageURL == creation.ImageURL && current.Prompt == creation.Prompt {
		return nil
	}
	if main != assetViewJobMain(job.Kind, job.assetData) {
		return errors.New("资产主图已更改，生成结果已保留，请重新生成")
	}
	dimensions["assetCreation"] = creation
	dimensions[viewField] = map[string]any{"main": creation.ImageURL}
	encoded, err := json.Marshal(dimensions)
	if err != nil {
		return err
	}
	sources, _ := json.Marshal([]string{creation.ImageURL})
	if _, err := tx.ExecContext(ctx, `UPDATE "`+table+`" SET "dimensions"=?,"sourceImages"=?,"`+coverField+`"=?,"updatedAt"=? WHERE "id"=? AND "workspaceId"=?`, string(encoded), string(sources), creation.ImageURL, time.Now().UTC().Format(time.RFC3339Nano), job.AssetID, workspace); err != nil {
		return err
	}
	return tx.Commit()
}
