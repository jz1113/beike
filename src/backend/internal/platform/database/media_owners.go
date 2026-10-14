package database

import (
	"context"
	"database/sql"
)

func ImageTaskOwners(ctx context.Context, db *sql.DB, resultURL string) ([]string, error) {
	rows, err := db.QueryContext(ctx, `SELECT DISTINCT "workspaceId" FROM "ImageTask" WHERE "resultUrl" = ?`, resultURL)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	owners := []string{}
	for rows.Next() {
		var owner string
		if err := rows.Scan(&owner); err != nil {
			return nil, err
		}
		owners = append(owners, owner)
	}
	return owners, rows.Err()
}
