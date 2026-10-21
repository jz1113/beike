package library

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"
)

// Commit reference groups and their review receipt together. A repeated receipt never creates duplicates.
func CommitDeconstructGroups(ctx context.Context, db *sql.DB, workspace, reviewID string, drafts []map[string]any) ([]string, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var status, raw string
	if err := tx.QueryRowContext(ctx, `SELECT "status","payload" FROM "DeconstructReview" WHERE "workspaceId"=? AND "id"=?`, workspace, reviewID).Scan(&status, &raw); err != nil {
		return nil, err
	}
	var payload map[string]any
	if json.Unmarshal([]byte(raw), &payload) != nil {
		return nil, errors.New("候选数据损坏")
	}
	ids := []string{}
	if saved, ok := payload["fullPromptIds"].([]any); ok {
		for _, id := range saved {
			if value, ok := id.(string); ok {
				ids = append(ids, value)
			}
		}
	}
	if len(ids) > 0 && status == "approved" {
		return ids, nil
	}
	if status != "pending" && status != "approved" {
		return nil, errors.New("请先恢复候选再入库")
	}
	if len(drafts) == 0 {
		return nil, errors.New("没有完整四图母本可入库，候选仍保留")
	}
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	for _, data := range drafts {
		album, err := ensurePromptAlbum(ctx, tx, workspace, data)
		if err != nil {
			return nil, err
		}
		inferred := inferCreateSubcategory(data)
		category, err := promptCreateCategory(ctx, tx, workspace, data, album, inferred)
		if err != nil {
			return nil, err
		}
		sub, err := promptCreateSubcategory(ctx, tx, workspace, data, category, inferred)
		if err != nil {
			return nil, err
		}
		if !sameStoredCategory(album.category, category) {
			if err := AssignAlbumCategory(ctx, tx, workspace, album.id, category); err != nil {
				return nil, err
			}
		}
		number, err := nextPromptDisplayNumber(ctx, tx)
		if err != nil {
			return nil, err
		}
		id, err := newLibraryID()
		if err != nil {
			return nil, err
		}
		provenance, err := insertFullPrompt(ctx, tx, workspace, id, now, number, album, category, sub, data)
		if err != nil {
			return nil, err
		}
		_, err = tx.ExecContext(ctx, `UPDATE "FullPromptAsset" SET "sourceImageIndices"=?,"groupIndex"=?,"shotPromptsJson"=?,"contentSummary"=?,"architectureSummary"=? WHERE "id"=? AND "workspaceId"=?`,
			data["sourceImageIndices"], data["groupIndex"], data["shotPromptsJson"], data["contentSummary"], data["architectureSummary"], id, workspace)
		if err != nil {
			return nil, err
		}
		if _, err := assignVisiblePromptNumbers(ctx, tx, workspace, id); err != nil {
			return nil, err
		}
		var parent any
		if parentID, ok := payload["parentFullPromptId"].(string); ok && parentID != "" {
			var registry string
			if err := tx.QueryRowContext(ctx, `SELECT "id" FROM "PromptAssetRegistry" WHERE "workspaceId" IN (?, 'official') AND "assetType"='full_prompt' AND "sourceAssetId"=?`, workspace, parentID).Scan(&registry); err != nil {
				return nil, err
			}
			parent = registry
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO "PromptAssetRegistry" ("id","workspaceId","assetType","sourceAssetId","status","version","provenance","sourceRef","publishedAt","createdAt","updatedAt") VALUES (?,?,'full_prompt',?,'published',1,?,?,?,?,?)`,
			"reg_"+id, workspace, id, provenance, parent, now, now, now)
		if err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	payload["fullPromptIds"] = ids
	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	changed, err := tx.ExecContext(ctx, `UPDATE "DeconstructReview" SET "status"='approved',"payload"=? WHERE "workspaceId"=? AND "id"=? AND "status"=?`, string(encoded), workspace, reviewID, status)
	if err != nil {
		return nil, err
	}
	if n, _ := changed.RowsAffected(); n != 1 {
		return nil, errors.New("候选状态已变化，入库未提交")
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return ids, nil
}
