// Package config reads the same environment variables the Node API already uses.
package config

import (
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type Config struct {
	Hostname     string
	Port         int
	NodeEnv      string
	AccessToken  string
	AdminToken   string
	Upstream     string
	WebDistDir   string
	DatabasePath string
	DatabaseURL  string
	Root         string
	ExtraOrigins []string
}

func Load() Config {
	port, _ := strconv.Atoi(env("PORT", "3000"))
	if port < 1 || port > 65535 {
		port = 3000
	}
	nodeEnv := env("NODE_ENV", "development")
	access := strings.TrimSpace(os.Getenv("LOCAL_ACCESS_TOKEN"))
	if access == "" && nodeEnv != "production" {
		access = "azhuo-local-dev"
	}
	root, _ := os.Getwd()
	return Config{
		Hostname:     env("HOSTNAME", "127.0.0.1"),
		Port:         port,
		NodeEnv:      nodeEnv,
		AccessToken:  access,
		AdminToken:   strings.TrimSpace(os.Getenv("ADMIN_ACCESS_TOKEN")),
		Upstream:     env("BEIKE_NODE_UPSTREAM", "http://127.0.0.1:3100"),
		WebDistDir:   strings.TrimSpace(os.Getenv("WEB_DIST_DIR")),
		DatabasePath: databasePath(os.Getenv("DATABASE_URL")),
		DatabaseURL:  strings.TrimSpace(os.Getenv("DATABASE_URL")),
		Root:         root,
		ExtraOrigins: splitOrigins(env("PUBLIC_WEB_ORIGIN", os.Getenv("PUBLIC_WEB_ORIGINS"))),
	}
}

func (c Config) Production() bool { return c.NodeEnv == "production" }

func (c Config) Addr() string { return c.Hostname + ":" + strconv.Itoa(c.Port) }

func env(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func splitOrigins(raw string) []string {
	parts := strings.FieldsFunc(raw, func(r rune) bool { return r == ',' || r == ' ' || r == '\n' || r == '\t' })
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}

func (c Config) SQLiteFile() string {
	raw := strings.TrimSpace(c.DatabaseURL)
	if raw == "" {
		return ""
	}
	filePath := raw
	if strings.HasPrefix(filePath, "file:") {
		filePath = strings.TrimPrefix(filePath, "file:")
	}
	switch {
	case strings.HasPrefix(filePath, "//"):
		filePath = filePath[2:]
	case strings.HasPrefix(filePath, "/"):
	case len(filePath) >= 3 && filePath[1] == ':' && (filePath[2] == '/' || filePath[2] == '\\'):
	default:
		filePath = filepath.Join(c.Root, filePath)
	}
	return filepath.Clean(filePath)
}

func (c Config) DataDir() string {
	if dir := strings.TrimSpace(os.Getenv("AZHUO_DATA_DIR")); dir != "" {
		return dir
	}
	if dbPath := c.SQLiteFile(); dbPath != "" {
		return filepath.Dir(dbPath)
	}
	return ""
}

func (c Config) MediaReviewRoot() string {
	if dir := strings.TrimSpace(os.Getenv("AZHUO_DATA_DIR")); dir != "" {
		return filepath.Join(dir, "media-review")
	}
	return filepath.Join(c.Root, ".local", "media-review")
}

func databasePath(raw string) string {
	raw = strings.TrimSpace(raw)
	if !strings.HasPrefix(raw, "file:") {
		return ""
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	return parsed.Path
}
