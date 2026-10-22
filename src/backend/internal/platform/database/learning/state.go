package learning

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"
)

var ErrConflict = errors.New("技能状态已变化或正在分析，请刷新后重试")

func ReadScope(ctx context.Context, db *sql.DB, workspace, folder string) (Scope, error) {
	s := Scope{FolderID: folder, MinSamples: 20}
	err := db.QueryRowContext(ctx, `SELECT "autoAnalyze","autoPublish","minSamples","activeVersionId","trialVersionId","comparisonVersionId","revision","runningToken","runningAt","progress","lastAttempt","error" FROM "CategorySkillScope" WHERE "workspaceId"=? AND "folderId"=?`, workspace, folder).Scan(&s.AutoAnalyze, &s.AutoPublish, &s.MinSamples, &s.ActiveVersionID, &s.TrialVersionID, &s.ComparisonVersionID, &s.Revision, &s.RunningToken, &s.RunningAt, &s.Progress, &s.LastAttempt, &s.Error)
	if err == sql.ErrNoRows {
		return s, nil
	}
	return s, err
}

func EnsureScope(ctx context.Context, db *sql.DB, workspace, folder string) error {
	_, err := db.ExecContext(ctx, `INSERT OR IGNORE INTO "CategorySkillScope" ("workspaceId","folderId") VALUES (?,?)`, workspace, folder)
	return err
}
func Configure(ctx context.Context, db *sql.DB, workspace, folder string, revision, min int, analyze, publish bool) error {
	if min < 20 || min > 30 {
		return errors.New("整体提炼阈值应在 20–30 套之间")
	}
	if err := EnsureScope(ctx, db, workspace, folder); err != nil {
		return err
	}
	result, err := db.ExecContext(ctx, `UPDATE "CategorySkillScope" SET "autoAnalyze"=?,"autoPublish"=?,"minSamples"=?,"revision"="revision"+1 WHERE "workspaceId"=? AND "folderId"=? AND "revision"=? AND "runningToken"=''`, analyze, publish, min, workspace, folder, revision)
	if err != nil {
		return err
	}
	if n, _ := result.RowsAffected(); n != 1 {
		return ErrConflict
	}
	return nil
}
func BeginRun(ctx context.Context, db *sql.DB, workspace, folder, fingerprint string, force bool) (string, error) {
	if err := EnsureScope(ctx, db, workspace, folder); err != nil {
		return "", err
	}
	token := ID()
	result, err := db.ExecContext(ctx, `UPDATE "CategorySkillScope" SET "runningToken"=?,"runningAt"=?,"lastAttempt"=?,"progress"=0,"error"='' WHERE "workspaceId"=? AND "folderId"=? AND ("runningToken"='' OR "runningAt"<?) AND (? OR "lastAttempt"<>?)`, token, now(), fingerprint, workspace, folder, time.Now().Add(-30*time.Minute).UTC().Format(time.RFC3339Nano), force, fingerprint)
	if err != nil {
		return "", err
	}
	if n, _ := result.RowsAffected(); n != 1 {
		return "", ErrConflict
	}
	return token, nil
}
func FinishRun(ctx context.Context, db *sql.DB, workspace, folder, token, message string) error {
	_, err := db.ExecContext(ctx, `UPDATE "CategorySkillScope" SET "runningToken"='',"error"=? WHERE "workspaceId"=? AND "folderId"=? AND "runningToken"=?`, message, workspace, folder, token)
	return err
}
func Progress(ctx context.Context, db *sql.DB, workspace, folder, token string, n int) error {
	result, err := db.ExecContext(ctx, `UPDATE "CategorySkillScope" SET "progress"=?,"runningAt"=? WHERE "workspaceId"=? AND "folderId"=? AND "runningToken"=?`, n, now(), workspace, folder, token)
	if err != nil {
		return err
	}
	if count, _ := result.RowsAffected(); count != 1 {
		return ErrConflict
	}
	return nil
}

func Observation(ctx context.Context, db *sql.DB, workspace, folder string, sample Sample) (json.RawMessage, error) {
	var raw string
	err := db.QueryRowContext(ctx, `SELECT "observationJson" FROM "CategorySkillObservation" WHERE "workspaceId"=? AND "folderId"=? AND "groupId"=? AND "fingerprint"=?`, workspace, folder, sample.ID, sample.Fingerprint).Scan(&raw)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return json.RawMessage(raw), err
}
func SaveObservation(ctx context.Context, db *sql.DB, workspace, folder, model string, sample Sample, raw json.RawMessage) error {
	_, err := db.ExecContext(ctx, `INSERT OR IGNORE INTO "CategorySkillObservation" ("workspaceId","folderId","groupId","fingerprint","observationJson","model","createdAt") VALUES (?,?,?,?,?,?,?)`, workspace, folder, sample.ID, sample.Fingerprint, string(raw), model, now())
	return err
}
func SaveRoles(ctx context.Context, db *sql.DB, workspace, folder string, samples []Sample) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	entries := []Sample{}
	for _, s := range samples {
		entries = append(entries, s, Sample{ID: sampleSourceRole(s), Role: s.Role})
	}
	for _, s := range entries {
		if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO "CategorySkillSampleRole" ("workspaceId","folderId","groupId","role") VALUES (?,?,?,?)`, workspace, folder, s.ID, s.Role); err != nil {
			return err
		}
	}
	return tx.Commit()
}
func Log(ctx context.Context, db *sql.DB, workspace, folder, version, kind, detail string) error {
	_, err := db.ExecContext(ctx, `INSERT INTO "CategorySkillEvent" ("id","workspaceId","folderId","versionId","eventType","detail","createdAt") VALUES (?,?,?,?,?,?,?)`, ID(), workspace, folder, version, kind, detail, now())
	return err
}
func Events(ctx context.Context, db *sql.DB, workspace, folder string) ([]Event, error) {
	rows, err := db.QueryContext(ctx, `SELECT "id","versionId","eventType","detail","createdAt" FROM "CategorySkillEvent" WHERE "workspaceId"=? AND "folderId"=? ORDER BY "createdAt" DESC LIMIT 30`, workspace, folder)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	events := []Event{}
	for rows.Next() {
		var event Event
		if err := rows.Scan(&event.ID, &event.VersionID, &event.Type, &event.Detail, &event.CreatedAt); err != nil {
			return nil, err
		}
		events = append(events, event)
	}
	return events, rows.Err()
}
