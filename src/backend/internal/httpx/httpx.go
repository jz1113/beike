// Package httpx holds HTTP helpers shared by domain handlers.
package httpx

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/database"
)

type workspaceIDKey struct{}

const localWorkspace = "local"

func WriteJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func WithWorkspace(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, workspaceIDKey{}, id)
}

func WorkspaceFrom(r *http.Request) string {
	if value, ok := r.Context().Value(workspaceIDKey{}).(string); ok && value != "" {
		return value
	}
	return localWorkspace
}

func QueryInt(r *http.Request, name string, fallback int) int {
	parsed, err := strconv.Atoi(r.URL.Query().Get(name))
	if err != nil {
		return fallback
	}
	return parsed
}

func OpenDB(cfg config.Config) (*sql.DB, error) {
	path := cfg.SQLiteFile()
	if path == "" {
		return nil, errors.New("missing database")
	}
	return database.OpenWrite(path)
}
