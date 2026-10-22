package catalog

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"strings"
	"time"
)

var ErrStyleMissing = errors.New("style missing")

type StyleChanges struct {
	Name            *string
	Category        *string
	Tag             *string
	Desc            *string
	PromptSnippet   *string
	CoverURL        *string
	Favorite        *bool
	ExpectedVersion string
}

func SaveStyleRecipe(ctx context.Context, db *sql.DB, workspace, id string, changes StyleChanges) (map[string]any, bool, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, false, err
	}
	defer tx.Rollback()
	current, err := loadStyleRecipe(ctx, tx, workspace, id)
	if err == sql.ErrNoRows {
		return nil, false, ErrStyleMissing
	}
	if err != nil {
		return nil, false, err
	}
	if changes.ExpectedVersion != "" && SkillVersion(styleSnapshotContent(id, current)) != changes.ExpectedVersion {
		return nil, false, ErrSkillConflict
	}
	if current.workspace != database.OfficialWorkspace {
		recipe, err := updateStyleRecipeTx(ctx, tx, workspace, id, current, changes, time.Now().UTC().Format("2006-01-02T15:04:05.000Z"))
		if err != nil {
			return nil, false, err
		}
		return recipe, false, tx.Commit()
	}
	var hidden int
	err = tx.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM "PromptAssetUsageEvent" WHERE "id" = ? AND "workspaceId" = ?`,
		hiddenRecipeEventID(workspace, id), workspace).Scan(&hidden)
	if err != nil {
		return nil, false, err
	}
	if hidden > 0 {
		return nil, false, ErrStyleMissing
	}
	copyID, err := styleOverrideID(workspace, id)
	if err != nil {
		return nil, false, err
	}
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	current.created = now
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO "StyleRecipe"
		("id","workspaceId","name","category","tag","desc","promptSnippet","coverUrl","sampleImages","sourceUrl","isFavorite","createdAt","updatedAt")
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		copyID, workspace, current.name, current.category, current.tag, current.desc, current.prompt,
		current.coverURL, current.sampleImages, current.sourceURL, boolInt(current.favorite), now, now); err != nil {
		return nil, false, err
	}
	recipe, err := updateStyleRecipeTx(ctx, tx, workspace, copyID, current, changes, now)
	if err != nil {
		return nil, false, err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT OR IGNORE INTO "PromptAssetUsageEvent"
		("id", "workspaceId", "assetId", "batchId", "eventType", "createdAt", "metadata")
		VALUES (?, ?, ?, 'recipe-library', 'recipe_hidden', ?, '{}')`,
		hiddenRecipeEventID(workspace, id), workspace, id, now); err != nil {
		return nil, false, err
	}
	if err := tx.Commit(); err != nil {
		return nil, false, err
	}
	return recipe, true, nil
}

type storedStyle struct {
	name, category, prompt, created, updated     string
	tag, desc, coverURL, sampleImages, sourceURL sql.NullString
	favorite                                     bool
	workspace                                    string
}

type styleReader interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func loadStyleRecipe(ctx context.Context, db styleReader, workspace, id string) (storedStyle, error) {
	var style storedStyle
	var favorite int
	err := db.QueryRowContext(ctx, `
		SELECT "workspaceId", "name", "category", "tag", "desc", "promptSnippet", "coverUrl", "sampleImages", "sourceUrl", "isFavorite", "createdAt", "updatedAt"
		FROM "StyleRecipe" WHERE "id" = ? AND "workspaceId" IN (?, ?)`,
		id, workspace, database.OfficialWorkspace).Scan(&style.workspace, &style.name, &style.category, &style.tag, &style.desc, &style.prompt, &style.coverURL, &style.sampleImages, &style.sourceURL, &favorite, &style.created, &style.updated)
	style.favorite = favorite != 0
	return style, err
}

func styleSnapshotContent(id string, style storedStyle) map[string]any {
	content := styleRecipeMap(id, style.workspace, style, database.FormatSQLiteTime(style.created), database.FormatSQLiteTime(style.updated))
	delete(content, "workspaceId")
	content["isOfficial"] = style.workspace == database.OfficialWorkspace
	return content
}

func updateStyleRecipeTx(ctx context.Context, tx *sql.Tx, workspace, id string, current storedStyle, changes StyleChanges, now string) (map[string]any, error) {
	return updateStyleRecipeDB(ctx, tx, workspace, id, current, changes, now)
}

type styleExec interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func updateStyleRecipeDB(ctx context.Context, exec styleExec, workspace, id string, current storedStyle, changes StyleChanges, now string) (map[string]any, error) {
	next := current
	assignments := []string{`"updatedAt" = ?`}
	args := []any{now}
	if changes.Name != nil {
		next.name = *changes.Name
		assignments = append(assignments, `"name" = ?`)
		args = append(args, next.name)
	}
	if changes.Category != nil {
		next.category = *changes.Category
		assignments = append(assignments, `"category" = ?`)
		args = append(args, next.category)
	}
	if changes.Tag != nil {
		next.tag = sql.NullString{String: *changes.Tag, Valid: true}
		assignments = append(assignments, `"tag" = ?`)
		args = append(args, *changes.Tag)
	}
	if changes.Desc != nil {
		next.desc = sql.NullString{String: *changes.Desc, Valid: true}
		assignments = append(assignments, `"desc" = ?`)
		args = append(args, *changes.Desc)
	}
	if changes.PromptSnippet != nil {
		next.prompt = *changes.PromptSnippet
		assignments = append(assignments, `"promptSnippet" = ?`)
		args = append(args, next.prompt)
	}
	if changes.CoverURL != nil {
		next.coverURL = sql.NullString{String: *changes.CoverURL, Valid: true}
		assignments = append(assignments, `"coverUrl" = ?`)
		args = append(args, *changes.CoverURL)
	}
	if changes.Favorite != nil {
		next.favorite = *changes.Favorite
		assignments = append(assignments, `"isFavorite" = ?`)
		args = append(args, boolInt(next.favorite))
	}
	args = append(args, id, workspace)
	query := `UPDATE "StyleRecipe" SET ` + strings.Join(assignments, ", ") + ` WHERE "id" = ? AND "workspaceId" = ?`
	result, err := exec.ExecContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	updated, _ := result.RowsAffected()
	if updated != 1 {
		return nil, ErrStyleMissing
	}
	return styleRecipeMap(id, workspace, next, next.created, now), nil
}

func styleRecipeMap(id, workspace string, style storedStyle, created, updated string) map[string]any {
	return map[string]any{
		"id": id, "workspaceId": workspace, "name": style.name, "category": style.category,
		"tag": database.NullText(style.tag), "desc": database.NullText(style.desc), "promptSnippet": style.prompt,
		"coverUrl": database.NullText(style.coverURL), "sampleImages": database.NullText(style.sampleImages), "sourceUrl": database.NullText(style.sourceURL),
		"isFavorite": style.favorite, "createdAt": created, "updatedAt": updated,
	}
}

func styleOverrideID(workspace, id string) (string, error) {
	var buf [16]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	return "recipe_override_" + hiddenRecipeEventID(workspace, id)[len("recipe_hidden_"):] + "_" + hex.EncodeToString(buf[:]), nil
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
