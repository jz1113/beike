package database

import (
	"context"
	"database/sql"
	"sort"
	"strings"
)

func DuplicateSourceAlbumGroups(ctx context.Context, db *sql.DB, workspace string) ([][]map[string]any, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT GROUP_CONCAT(DISTINCT "albumId") AS "albumIds"
		FROM "FullPromptAsset"
		WHERE "workspaceId" = ? AND "albumId" IS NOT NULL AND "sourceImages" IS NOT NULL AND LENGTH("sourceImages") > 2
		GROUP BY "sourceImages"
		HAVING COUNT(DISTINCT "albumId") > 1
		LIMIT 50`, workspace)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	groups := [][]map[string]any{}
	seen := map[string]bool{}
	for rows.Next() {
		var joined sql.NullString
		if err := rows.Scan(&joined); err != nil {
			return nil, err
		}
		if !joined.Valid || joined.String == "" {
			continue
		}
		ids := strings.Split(joined.String, ",")
		sort.Strings(ids)
		key := strings.Join(ids, ",")
		if seen[key] {
			continue
		}
		seen[key] = true
		albums, err := albumsByID(ctx, db, workspace, ids)
		if err != nil {
			return nil, err
		}
		if len(albums) > 1 {
			groups = append(groups, albums)
		}
	}
	return groups, rows.Err()
}

func albumsByID(ctx context.Context, db *sql.DB, workspace string, ids []string) ([]map[string]any, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	args := []any{workspace, officialWorkspace}
	for _, id := range ids {
		args = append(args, id)
	}
	rows, err := db.QueryContext(ctx, `
		SELECT "id", "name" FROM "PromptAlbum"
		WHERE "workspaceId" IN (?, ?) AND "id" IN (`+questionMarks(len(ids))+`)`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	albums := []map[string]any{}
	for rows.Next() {
		var id, name string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, err
		}
		albums = append(albums, map[string]any{"id": id, "name": name})
	}
	return albums, rows.Err()
}
