package sales

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"modernc.org/sqlite"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/database"
)

var errPromptConflict = errors.New("prompt version conflict")

func loadSalesPrompts(ctx context.Context, cfg config.Config, workspace string) ([]salesPrompt, error) {
	overrides := map[string]string{}
	if cfg.SQLiteFile() != "" {
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			return nil, err
		}
		defer db.Close()
		rows, err := db.QueryContext(ctx, `SELECT "promptId","prompt" FROM "SalesPromptOverride" WHERE "workspaceId"=?`, workspace)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		for rows.Next() {
			var id, text string
			if err := rows.Scan(&id, &text); err != nil {
				return nil, err
			}
			overrides[id] = text
		}
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}
	items := []salesPrompt{}
	for _, d := range promptDefinitions() {
		var override *string
		if text, exists := overrides[d.id]; exists {
			override = &text
		}
		items = append(items, d.resolve(override))
	}
	return items, nil
}

func loadSalesPrompt(ctx context.Context, cfg config.Config, workspace, id string) (salesPrompt, error) {
	items, err := loadSalesPrompts(ctx, cfg, workspace)
	if err != nil {
		return salesPrompt{}, err
	}
	for _, item := range items {
		if item.ID == id {
			return item, nil
		}
	}
	return salesPrompt{}, errors.New("unknown sales prompt")
}

// Opening a connection also sets journal_mode(WAL). SQLite can return BUSY
// there without invoking busy_timeout. Retry the complete uncommitted attempt;
// the version must be checked again after acquiring the write lock.
func saveSalesPrompt(ctx context.Context, cfg config.Config, workspace string, d promptDefinition, text *string, expectedVersion string) (salesPrompt, error) {
	deadline := time.Now().Add(time.Second)
	for {
		if err := ctx.Err(); err != nil {
			return salesPrompt{}, err
		}
		item, err := trySaveSalesPrompt(ctx, cfg, workspace, d, text, expectedVersion)
		if err == nil {
			return item, nil
		}
		if ctx.Err() != nil {
			return salesPrompt{}, ctx.Err()
		}
		var sqliteErr *sqlite.Error
		if !errors.As(err, &sqliteErr) || sqliteErr.Code()&0xff != 5 || time.Now().After(deadline) {
			return item, err
		}
		timer := time.NewTimer(25 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return salesPrompt{}, ctx.Err()
		case <-timer.C:
		}
	}
}

func trySaveSalesPrompt(ctx context.Context, cfg config.Config, workspace string, d promptDefinition, text *string, expectedVersion string) (salesPrompt, error) {
	path := cfg.SQLiteFile()
	if path == "" {
		return salesPrompt{}, errors.New("missing database")
	}
	// Driver connection initialization does not receive ctx. Keep its busy wait
	// short; the bounded outer loop owns retries and cancellation for this write.
	db, err := sql.Open("sqlite", "file:"+path+"?_pragma=busy_timeout(50)&_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)")
	if err != nil {
		return salesPrompt{}, err
	}
	defer db.Close()
	conn, err := db.Conn(ctx)
	if err != nil {
		return salesPrompt{}, err
	}
	defer conn.Close()
	if _, err := conn.ExecContext(ctx, `BEGIN IMMEDIATE`); err != nil {
		return salesPrompt{}, err
	}
	defer func() { _, _ = conn.ExecContext(context.Background(), `ROLLBACK`) }()
	var currentText string
	var override *string
	err = conn.QueryRowContext(ctx, `SELECT "prompt" FROM "SalesPromptOverride" WHERE "workspaceId"=? AND "promptId"=?`, workspace, d.id).Scan(&currentText)
	if err == nil {
		override = &currentText
	} else if !errors.Is(err, sql.ErrNoRows) {
		return salesPrompt{}, err
	}
	current := d.resolve(override)
	if current.Version != expectedVersion {
		return current, errPromptConflict
	}
	if text == nil {
		_, err = conn.ExecContext(ctx, `DELETE FROM "SalesPromptOverride" WHERE "workspaceId"=? AND "promptId"=?`, workspace, d.id)
	} else {
		_, err = conn.ExecContext(ctx, `INSERT INTO "SalesPromptOverride" ("workspaceId","promptId","prompt","updatedAt") VALUES (?,?,?,?) ON CONFLICT("workspaceId","promptId") DO UPDATE SET "prompt"=excluded."prompt","updatedAt"=excluded."updatedAt"`, workspace, d.id, *text, time.Now().UTC().Format(time.RFC3339Nano))
	}
	if err != nil {
		return salesPrompt{}, err
	}
	if _, err := conn.ExecContext(ctx, `COMMIT`); err != nil {
		return salesPrompt{}, err
	}
	return d.resolve(text), nil
}
