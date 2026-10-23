package config

import (
	"path/filepath"
	"runtime"
	"testing"
)

func TestStartupAndHandlersUseTheSameDatabase(t *testing.T) {
	for _, value := range []string{`file:C:\Users\Example\AppData\azhuo.db`, "file:./dev.db", "file:/tmp/azhuo.db"} {
		t.Run(value, func(t *testing.T) {
			t.Setenv("DATABASE_URL", value)
			cfg := Load()
			if cfg.DatabasePath == "" || cfg.DatabasePath != cfg.SQLiteFile() {
				t.Fatalf("startup=%q handler=%q", cfg.DatabasePath, cfg.SQLiteFile())
			}
		})
	}
}

func TestSQLiteFileResolvesNativePathsAndFileURIs(t *testing.T) {
	root := t.TempDir()
	cases := map[string]string{
		"":                           "",
		"file:./dev.db":              filepath.Join(root, "dev.db"),
		"file:///tmp/data%20file.db": filepath.Clean("/tmp/data file.db"),
		"file://localhost/tmp/a.db":  filepath.Clean("/tmp/a.db"),
	}
	if runtime.GOOS == "windows" {
		cases["file:C:\\data\\azhuo.db"] = `C:\data\azhuo.db`
		cases["file:///C:/data/azhuo.db"] = `C:\data\azhuo.db`
	}
	for raw, want := range cases {
		if got := (Config{Root: root, DatabaseURL: raw}).SQLiteFile(); got != want {
			t.Errorf("%q: got %q want %q", raw, got, want)
		}
	}
}
