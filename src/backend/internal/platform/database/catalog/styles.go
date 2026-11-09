package catalog

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"time"
)

type StylePage struct {
	Total                 int
	Recipes               []map[string]any
	HiddenOfficialRecipes []map[string]any
}

func ListStyleRecipes(ctx context.Context, db *sql.DB, workspace, category string, page, pageSize int) (StylePage, error) {
	hidden, err := hiddenRecipeIDs(ctx, db, workspace)
	if err != nil {
		return StylePage{}, err
	}
	where := []string{`"workspaceId" IN (?, ?)`}
	args := []any{workspace, database.OfficialWorkspace}
	if category != "" && category != "all" {
		where = append(where, `"category" = ?`)
		args = append(args, category)
	}
	if len(hidden) > 0 {
		where = append(where, `"id" NOT IN (`+database.QuestionMarks(len(hidden))+`)`)
		for _, id := range hidden {
			args = append(args, id)
		}
	}
	filter := strings.Join(where, " AND ")
	var total int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM "StyleRecipe" WHERE `+filter, args...).Scan(&total); err != nil {
		return StylePage{}, err
	}
	listArgs := append(append([]any{}, args...), pageSize, (page-1)*pageSize)
	rows, err := db.QueryContext(ctx, `
		SELECT "id", "workspaceId", "name", "category", "tag", "desc", "coverUrl", "sampleImages", "isFavorite", "createdAt", "updatedAt", "promptSnippet", "sourceUrl"
		FROM "StyleRecipe" WHERE `+filter+`
		ORDER BY "isFavorite" DESC, "createdAt" DESC
		LIMIT ? OFFSET ?`, listArgs...)
	if err != nil {
		return StylePage{}, err
	}
	defer rows.Close()
	recipes := []map[string]any{}
	for rows.Next() {
		recipe, err := scanStyleRecipe(rows)
		if err != nil {
			return StylePage{}, err
		}
		recipes = append(recipes, recipe)
	}
	if err := rows.Err(); err != nil {
		return StylePage{}, err
	}
	hiddenRecipes, err := listHiddenOfficial(ctx, db, hidden)
	if err != nil {
		return StylePage{}, err
	}
	return StylePage{Total: total, Recipes: recipes, HiddenOfficialRecipes: hiddenRecipes}, nil
}

func hiddenRecipeIDs(ctx context.Context, db *sql.DB, workspace string) ([]string, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT "assetId" FROM "PromptAssetUsageEvent"
		WHERE "workspaceId" = ? AND "eventType" = 'recipe_hidden'`, workspace)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func listHiddenOfficial(ctx context.Context, db *sql.DB, ids []string) ([]map[string]any, error) {
	if len(ids) == 0 {
		return []map[string]any{}, nil
	}
	args := []any{database.OfficialWorkspace}
	for _, id := range ids {
		args = append(args, id)
	}
	rows, err := db.QueryContext(ctx, `
		SELECT "id", "name" FROM "StyleRecipe"
		WHERE "workspaceId" = ? AND "id" IN (`+database.QuestionMarks(len(ids))+`)
		ORDER BY "name" ASC`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, name string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, err
		}
		items = append(items, map[string]any{"id": id, "name": name})
	}
	return items, rows.Err()
}

func scanStyleRecipe(row database.Scanner) (map[string]any, error) {
	var id, workspaceID, name, category, promptSnippet, createdAt, updatedAt string
	var tag, desc, coverURL, sampleImages, sourceURL sql.NullString
	var favorite int
	if err := row.Scan(&id, &workspaceID, &name, &category, &tag, &desc, &coverURL, &sampleImages, &favorite, &createdAt, &updatedAt, &promptSnippet, &sourceURL); err != nil {
		return nil, err
	}
	return map[string]any{
		"id": id, "name": name, "category": category,
		"tag": database.NullText(tag), "desc": database.NullText(desc), "coverUrl": database.NullText(coverURL),
		"sampleImages": database.NullText(sampleImages), "isFavorite": favorite != 0,
		"sourceUrl": database.NullText(sourceURL),
		"createdAt": database.FormatSQLiteTime(createdAt), "updatedAt": database.FormatSQLiteTime(updatedAt),
		"promptSnippet": promptSnippet, "isOfficial": workspaceID == database.OfficialWorkspace,
	}, nil
}

func DeleteStyleRecipe(ctx context.Context, db *sql.DB, workspace, id string, expected ...string) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var owner string
	err = tx.QueryRowContext(ctx, `
		SELECT "workspaceId" FROM "StyleRecipe" WHERE "id" = ? AND "workspaceId" IN (?, ?)`,
		id, workspace, database.OfficialWorkspace).Scan(&owner)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		return err
	}
	if len(expected) > 0 && expected[0] != "" {
		current, err := loadStyleRecipe(ctx, tx, workspace, id)
		if err != nil {
			return err
		}
		if SkillVersion(styleSnapshotContent(id, current)) != expected[0] {
			return ErrSkillConflict
		}
	}
	if owner == database.OfficialWorkspace {
		if err := hideOfficialRecipe(ctx, tx, workspace, id); err != nil {
			return err
		}
	} else {
		if _, err := tx.ExecContext(ctx, `DELETE FROM "StyleRecipe" WHERE "id" = ? AND "workspaceId" = ?`, id, workspace); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func RestoreOfficialStyleRecipe(ctx context.Context, db *sql.DB, workspace, id string) (string, error) {
	var owner string
	err := db.QueryRowContext(ctx, `
		SELECT "workspaceId" FROM "StyleRecipe" WHERE "id" = ? AND "workspaceId" IN (?, ?)`,
		id, workspace, database.OfficialWorkspace).Scan(&owner)
	if err == sql.ErrNoRows {
		return "not_found", nil
	}
	if err != nil {
		return "", err
	}
	if owner != database.OfficialWorkspace {
		return "not_official", nil
	}
	result, err := db.ExecContext(ctx, `
		DELETE FROM "PromptAssetUsageEvent"
		WHERE "id" = ? AND "workspaceId" = ? AND "assetId" = ? AND "eventType" = 'recipe_hidden'`,
		hiddenRecipeEventID(workspace, id), workspace, id)
	if err != nil {
		return "", err
	}
	deleted, _ := result.RowsAffected()
	if deleted > 0 {
		return "restored", nil
	}
	return "already_visible", nil
}

func CreateStyleRecipe(ctx context.Context, db *sql.DB, workspace string, recipe StyleRecipeInput) (map[string]any, error) {
	id, err := newCategoryRecordID()
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	_, err = db.ExecContext(ctx, `
		INSERT INTO "StyleRecipe"
		("id","workspaceId","name","category","tag","desc","promptSnippet","coverUrl","sampleImages","sourceUrl","isFavorite","createdAt","updatedAt")
		VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?)`,
		id, workspace, recipe.Name, recipe.Category, recipe.Tag, recipe.Desc, recipe.PromptSnippet,
		recipe.CoverURL, recipe.SampleImages, recipe.SourceURL, now, now)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"id": id, "workspaceId": workspace, "name": recipe.Name, "category": recipe.Category,
		"tag": recipe.Tag, "desc": recipe.Desc, "promptSnippet": recipe.PromptSnippet,
		"coverUrl": recipe.CoverURL, "sampleImages": recipe.SampleImages, "sourceUrl": recipe.SourceURL,
		"isFavorite": false, "createdAt": now, "updatedAt": now,
	}, nil
}

type StyleRecipeInput struct {
	Name, Category, Tag, Desc, PromptSnippet, CoverURL, SampleImages, SourceURL string
}

func hiddenRecipeEventID(workspace, id string) string {
	payload, _ := json.Marshal([]string{workspace, id})
	sum := sha256.Sum256(payload)
	return "recipe_hidden_" + hex.EncodeToString(sum[:])
}

func hideOfficialRecipe(ctx context.Context, db styleExec, workspace, id string) error {
	_, err := db.ExecContext(ctx, `
		INSERT OR IGNORE INTO "PromptAssetUsageEvent"
		("id", "workspaceId", "assetId", "batchId", "eventType", "createdAt", "metadata")
		VALUES (?, ?, ?, 'recipe-library', 'recipe_hidden', ?, '{}')`,
		hiddenRecipeEventID(workspace, id), workspace, id, time.Now().UTC().Format("2006-01-02T15:04:05.000Z"))
	return err
}

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

type officialMasterRecipe struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	Category      string  `json:"category"`
	Tag           string  `json:"tag"`
	Desc          string  `json:"desc"`
	PromptSnippet string  `json:"promptSnippet"`
	CoverURL      *string `json:"coverUrl"`
	SampleImages  *string `json:"sampleImages"`
}

func LoadOfficialMasterRecipes(path string) ([]officialMasterRecipe, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var recipes []officialMasterRecipe
	if err := json.Unmarshal(raw, &recipes); err != nil {
		return nil, err
	}
	return recipes, nil
}

func UpsertOfficialMasterRecipes(ctx context.Context, db *sql.DB, recipes []officialMasterRecipe) error {
	if len(recipes) == 0 {
		_, err := db.ExecContext(ctx, `DELETE FROM "StyleRecipe" WHERE "workspaceId" = ?`, database.OfficialWorkspace)
		return err
	}
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	for _, recipe := range recipes {
		var existing string
		err := db.QueryRowContext(ctx, `SELECT "id" FROM "StyleRecipe" WHERE "id" = ?`, recipe.ID).Scan(&existing)
		if err == sql.ErrNoRows {
			if _, err := db.ExecContext(ctx, `
				INSERT INTO "StyleRecipe"
				("id","workspaceId","name","category","tag","desc","promptSnippet","coverUrl","sampleImages","sourceUrl","isFavorite","createdAt","updatedAt")
				VALUES (?,?,?,?,?,?,?,?,?,NULL,1,?,?)`,
				recipe.ID, database.OfficialWorkspace, recipe.Name, recipe.Category, recipe.Tag, recipe.Desc, recipe.PromptSnippet,
				recipe.CoverURL, recipe.SampleImages, now, now); err != nil {
				return err
			}
			continue
		}
		if err != nil {
			return err
		}
		if _, err := db.ExecContext(ctx, `
			UPDATE "StyleRecipe"
			SET "workspaceId" = ?, "name" = ?, "category" = ?, "tag" = ?, "desc" = ?, "promptSnippet" = ?,
				"coverUrl" = ?, "sampleImages" = ?, "isFavorite" = 1, "updatedAt" = ?
			WHERE "id" = ?`,
			database.OfficialWorkspace, recipe.Name, recipe.Category, recipe.Tag, recipe.Desc, recipe.PromptSnippet,
			recipe.CoverURL, recipe.SampleImages, now, recipe.ID); err != nil {
			return err
		}
	}
	return nil
}
