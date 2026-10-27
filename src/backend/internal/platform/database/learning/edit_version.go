package learning

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"unicode/utf8"
)

// EditVersion preserves published text and creates a candidate against the current active version.
func EditVersion(ctx context.Context, db *sql.DB, workspace, folder, sourceID, content, summary string, revision int) (string, error) {
	content = strings.TrimSpace(content)
	summary = strings.TrimSpace(summary)
	if sourceID == "" || content == "" || utf8.RuneCountInString(content) > 16000 || utf8.RuneCountInString(summary) > 200 {
		return "", errors.New("技能正文需为 1–16000 字，修改说明最多 200 字")
	}
	if _, err := ReadFolder(ctx, db, workspace, folder); err != nil {
		return "", err
	}
	if err := EnsureScope(ctx, db, workspace, folder); err != nil {
		return "", err
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	var active, running string
	var current int
	if err := tx.QueryRowContext(ctx, `SELECT "activeVersionId","runningToken","revision" FROM "CategorySkillScope" WHERE "workspaceId"=? AND "folderId"=?`, workspace, folder).Scan(&active, &running, &current); err != nil {
		return "", err
	}
	if current != revision || running != "" {
		return "", ErrConflict
	}
	source, err := scanVersion(tx.QueryRowContext(ctx, `SELECT "id","folderId","parentVersionId","sourceFingerprint","manifestJson","promptSnippet","summary","model","createdAt" FROM "CategorySkillVersion" WHERE "workspaceId"=? AND "folderId"=? AND "id"=?`, workspace, folder, sourceID))
	if err != nil {
		return "", errors.New("来源技能不可用，请刷新后重试")
	}
	if content == strings.TrimSpace(source.PromptSnippet) {
		return "", errors.New("技能正文未修改")
	}
	if summary == "" {
		summary = "手动编辑技能"
	}
	manifest, err := json.Marshal(source.Manifest)
	if err != nil {
		return "", err
	}
	id, created := ID(), now()
	if _, err := tx.ExecContext(ctx, `INSERT INTO "CategorySkillVersion" ("id","workspaceId","folderId","parentVersionId","sourceFingerprint","manifestJson","promptSnippet","summary","model","createdAt") VALUES (?,?,?,?,?,?,?,?,?,?)`, id, workspace, folder, active, source.SourceFingerprint, string(manifest), content, summary, "manual", created); err != nil {
		return "", err
	}
	result, err := tx.ExecContext(ctx, `UPDATE "CategorySkillScope" SET "revision"="revision"+1,"lastAttempt"='' WHERE "workspaceId"=? AND "folderId"=? AND "revision"=? AND "runningToken"=''`, workspace, folder, revision)
	if err != nil {
		return "", err
	}
	if n, _ := result.RowsAffected(); n != 1 {
		return "", ErrConflict
	}
	detail := "手动编辑保存为新候选；来源版本：" + sourceID
	if _, err := tx.ExecContext(ctx, `INSERT INTO "CategorySkillEvent" ("id","workspaceId","folderId","versionId","eventType","detail","createdAt") VALUES (?,?,?,?,?,?,?)`, ID(), workspace, folder, id, "edit", detail, created); err != nil {
		return "", err
	}
	if err := tx.Commit(); err != nil {
		return "", err
	}
	return id, nil
}
