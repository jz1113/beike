package learning

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
)

func Versions(ctx context.Context, db *sql.DB, workspace, folder string) ([]Version, error) {
	rows, err := db.QueryContext(ctx, `SELECT "id","folderId","parentVersionId","sourceFingerprint","manifestJson","promptSnippet","summary","model","createdAt" FROM "CategorySkillVersion" WHERE "workspaceId"=? AND "folderId"=? ORDER BY "createdAt" DESC LIMIT 50`, workspace, folder)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	versions := []Version{}
	for rows.Next() {
		v, err := scanVersion(rows)
		if err != nil {
			return nil, err
		}
		versions = append(versions, v)
	}
	return versions, rows.Err()
}

type scanner interface{ Scan(...any) error }

func scanVersion(row scanner) (Version, error) {
	var v Version
	var manifest string
	err := row.Scan(&v.ID, &v.FolderID, &v.ParentVersionID, &v.SourceFingerprint, &manifest, &v.PromptSnippet, &v.Summary, &v.Model, &v.CreatedAt)
	if err != nil {
		return v, err
	}
	err = json.Unmarshal([]byte(manifest), &v.Manifest)
	return v, err
}
func ReadVersion(ctx context.Context, db *sql.DB, workspace, folder, id string) (Version, error) {
	return scanVersion(db.QueryRowContext(ctx, `SELECT "id","folderId","parentVersionId","sourceFingerprint","manifestJson","promptSnippet","summary","model","createdAt" FROM "CategorySkillVersion" WHERE "workspaceId"=? AND "folderId"=? AND "id"=?`, workspace, folder, id))
}
func SaveVersion(ctx context.Context, db *sql.DB, workspace, folder, token string, version Version) (string, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	var parent, running string
	if err := tx.QueryRowContext(ctx, `SELECT "activeVersionId","runningToken" FROM "CategorySkillScope" WHERE "workspaceId"=? AND "folderId"=?`, workspace, folder).Scan(&parent, &running); err != nil {
		return "", err
	}
	if running != token || parent != version.ParentVersionID {
		return "", ErrConflict
	}
	version.ID = ID()
	manifest, err := json.Marshal(version.Manifest)
	if err != nil {
		return "", err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO "CategorySkillVersion" ("id","workspaceId","folderId","parentVersionId","sourceFingerprint","manifestJson","promptSnippet","summary","model","createdAt") VALUES (?,?,?,?,?,?,?,?,?,?)`, version.ID, workspace, folder, parent, version.SourceFingerprint, string(manifest), version.PromptSnippet, version.Summary, version.Model, now())
	if err != nil {
		return "", err
	}
	if err := tx.Commit(); err != nil {
		return "", err
	}
	return version.ID, nil
}
func ManifestCurrent(version Version, dataset Dataset) bool {
	current := map[string]string{}
	for _, s := range dataset.Samples {
		current[s.ID] = s.Fingerprint
	}
	for _, s := range version.Manifest.Samples {
		if current[s.ID] != s.Fingerprint {
			return false
		}
	}
	return len(version.Manifest.Samples) > 0 || len(version.Manifest.Notes) > 0
}

func Switch(ctx context.Context, db *sql.DB, workspace, folder, action, versionID string, revision int) error {
	scope, err := ReadScope(ctx, db, workspace, folder)
	if err != nil {
		return err
	}
	if scope.Revision != revision {
		return ErrConflict
	}
	active, trial, comparison := scope.ActiveVersionID, scope.TrialVersionID, scope.ComparisonVersionID
	switch action {
	case "baseline":
		trial = ""
	case "rollback":
		if active == "" {
			return errors.New("尚无可回滚的生产版本")
		}
		v, err := ReadVersion(ctx, db, workspace, folder, active)
		if err != nil {
			return err
		}
		active = v.ParentVersionID
		trial = ""
		comparison = ""
		versionID = active
	case "trial", "publish", "activate":
		version, err := ReadVersion(ctx, db, workspace, folder, versionID)
		if err != nil {
			return err
		}
		if version.ParentVersionID != active {
			return errors.New("候选版本的基础版本已变化，请重新提炼")
		}
		dataset, err := LoadDataset(ctx, db, workspace, folder)
		if err != nil {
			return err
		}
		if !ManifestCurrent(version, dataset) {
			return errors.New("候选版本的参考样本已修改或移除，请重新提炼")
		}
		notes, err := Notes(ctx, db, workspace, folder)
		if err != nil {
			return err
		}
		if version.Manifest.MemoryFingerprint != "" && version.Manifest.MemoryFingerprint != Hash(notes) {
			return errors.New("类目经验已更新，请先整理新技能再试用或发布")
		}
		if action == "trial" {
			trial = versionID
			comparison = versionID
		} else if action == "activate" {
			active = versionID
			trial = ""
			comparison = ""
		} else {
			feedback, err := Feedbacks(ctx, db, workspace, folder)
			if err != nil {
				return err
			}
			validation := Validate(version, feedback)
			if !validation.Passed {
				return errors.New(validation.Reason)
			}
			active = versionID
			trial = ""
			comparison = ""
		}
	default:
		return errors.New("技能操作无效")
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, `UPDATE "CategorySkillScope" SET "activeVersionId"=?,"trialVersionId"=?,"comparisonVersionId"=?,"revision"="revision"+1 WHERE "workspaceId"=? AND "folderId"=? AND "revision"=?`, active, trial, comparison, workspace, folder, revision)
	if err != nil {
		return err
	}
	if n, _ := result.RowsAffected(); n != 1 {
		return ErrConflict
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO "CategorySkillEvent" ("id","workspaceId","folderId","versionId","eventType","detail","createdAt") VALUES (?,?,?,?,?,?,?)`, ID(), workspace, folder, versionID, action, map[string]string{"trial": "后续分析试用候选版本；已分析批次不变", "baseline": "后续分析恢复生产版，用于同商品同母本对照", "publish": "候选通过留出图组的实际成图对照，升级为生产版", "activate": "直接设为当前细分的正式技能", "rollback": "恢复上一生产版本，保留历史记录"}[action], now())
	if err != nil {
		return err
	}
	return tx.Commit()
}
