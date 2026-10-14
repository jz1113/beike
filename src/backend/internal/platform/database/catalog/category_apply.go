package catalog

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
)

type CategoryApplyItem struct {
	ID       string
	ParentID string
	Label    string
	Keywords []string
	Anatomy  string
}

func ApplyCategoryMigration(ctx context.Context, db *sql.DB, workspace, defaultsPath string, items []CategoryApplyItem) (json.RawMessage, error) {
	rows, err := loadScopedCategories(ctx, db, workspace)
	if err != nil {
		return nil, err
	}
	parents := map[string]struct{}{}
	for _, row := range rows {
		if row.parent == "" {
			parents[row.id] = struct{}{}
		}
	}
	for _, item := range items {
		if _, ok := parents[item.ParentID]; !ok {
			if _, err := db.ExecContext(ctx, `
				INSERT INTO "AssetProductCategory"
				("id","workspaceId","name","parentId","position","isArchived","aliases","keywords","anatomy")
				VALUES (?,?,?,NULL,?,0,'[]','[]','[]')`,
				item.ParentID, workspace, categoryParentLabel(item.ParentID), len(parents)); err != nil {
				return nil, err
			}
			parents[item.ParentID] = struct{}{}
		}
		keywords, anatomy := database.CategoryJSON(item.Keywords), anatomyJSON(item.Anatomy)
		if duplicate := findCategoryDuplicate(rows, item.ParentID, item.Label); duplicate != nil {
			_, _ = db.ExecContext(ctx, `
				UPDATE "AssetProductCategory" SET "keywords" = ?, "anatomy" = ?
				WHERE "id" = ? AND "workspaceId" = ?`, keywords, anatomy, duplicate.id, workspace)
			continue
		}
		id := item.ID
		if categoryIDTaken(rows, id) {
			id, err = newCategoryID()
			if err != nil {
				return nil, err
			}
		}
		if _, err := db.ExecContext(ctx, `
			INSERT INTO "AssetProductCategory"
			("id","workspaceId","name","parentId","position","isArchived","aliases","keywords","anatomy")
			VALUES (?,?,?,?,?,0,'[]','[]','[]')`,
			id, workspace, item.Label, item.ParentID, countCategoryChildren(rows, item.ParentID)); err != nil {
			return nil, err
		}
		_, _ = db.ExecContext(ctx, `
			UPDATE "AssetProductCategory" SET "keywords" = ?, "anatomy" = ?
			WHERE "id" = ? AND "workspaceId" = ?`, keywords, anatomy, id, workspace)
		rows = append(rows, storedCategory{id: id, workspace: workspace, name: item.Label, parent: item.ParentID})
	}
	return ListServerSubCategories(ctx, db, workspace, defaultsPath)
}

type storedCategory struct {
	id, workspace, name, parent string
}

func loadScopedCategories(ctx context.Context, db *sql.DB, workspace string) ([]storedCategory, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT "id", "workspaceId", "name", "parentId" FROM "AssetProductCategory"
		WHERE "workspaceId" IN (?, ?) ORDER BY "id" ASC`, workspace, database.OfficialWorkspace)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	stored := []storedCategory{}
	for rows.Next() {
		var row storedCategory
		var parent sql.NullString
		if err := rows.Scan(&row.id, &row.workspace, &row.name, &parent); err != nil {
			return nil, err
		}
		if parent.Valid {
			row.parent = parent.String
		}
		stored = append(stored, row)
	}
	return stored, rows.Err()
}

func findCategoryDuplicate(rows []storedCategory, parent, label string) *storedCategory {
	for index := range rows {
		if rows[index].parent == parent && rows[index].name == label {
			return &rows[index]
		}
	}
	return nil
}

func categoryIDTaken(rows []storedCategory, id string) bool {
	for _, row := range rows {
		if row.id == id {
			return true
		}
	}
	return false
}

func countCategoryChildren(rows []storedCategory, parent string) int {
	count := 0
	for _, row := range rows {
		if row.parent == parent {
			count++
		}
	}
	return count
}

func categoryParentLabel(id string) string {
	labels := map[string]string{
		"jewelry": "珠宝首饰", "digital_3c": "手机数码", "apparel": "服饰穿搭", "bag": "箱包",
		"shoes": "鞋靴", "beauty": "美妆", "eyewear": "眼镜", "universal": "通用日常",
	}
	if label, ok := labels[id]; ok {
		return label
	}
	return id
}

func anatomyJSON(value string) string {
	if value == "" {
		return "[]"
	}
	return database.CategoryJSON([]string{value})
}

func newCategoryID() (string, error) {
	var buf [6]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	return "cat_" + hex.EncodeToString(buf[:]), nil
}
