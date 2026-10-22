package catalog

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"time"
)

// Content versions are immutable. Workshop rows retain their existing IDs and
// ownership; the library materializes snapshots when those rows are read.
func SkillVersion(content map[string]any) string {
	copy := make(map[string]any, len(content))
	for key, value := range content {
		if key != "libraryVersion" && key != "isFavorite" {
			copy[key] = value
		}
	}
	body, _ := json.Marshal(copy)
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}

func RememberSkillRevision(ctx context.Context, db *sql.DB, workspace, kind, id string, content map[string]any) (string, error) {
	version := SkillVersion(content)
	body, err := json.Marshal(content)
	if err != nil {
		return "", err
	}
	_, err = db.ExecContext(ctx, `INSERT OR IGNORE INTO "SkillRevision"
		("workspaceId","kind","skillId","version","contentJson","createdAt") VALUES (?,?,?,?,?,?)`,
		workspace, kind, id, version, string(body), time.Now().UTC().Format(time.RFC3339Nano))
	return version, err
}

func ReadSkillRevision(ctx context.Context, db *sql.DB, workspace, kind, id, version string) (map[string]any, error) {
	var body string
	err := db.QueryRowContext(ctx, `SELECT "contentJson" FROM "SkillRevision"
		WHERE "workspaceId" = ? AND "kind" = ? AND "skillId" = ? AND "version" = ?`, workspace, kind, id, version).Scan(&body)
	if err != nil {
		return nil, err
	}
	var content map[string]any
	if err := json.Unmarshal([]byte(body), &content); err != nil {
		return nil, err
	}
	content["libraryVersion"] = version
	return content, nil
}
