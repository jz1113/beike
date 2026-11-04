package sales

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestSweepOnlyDiscardsIdleScriptUploads(t *testing.T) {
	cfg := setupPromptExecutionTestConfig(t)
	root := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", root)
	key := "local/azhuo/refs/sales-script/202611/0123456789abcdef0123456789abcdef.mp4"
	unrelated := "local/azhuo/generated/videos/202611/0123456789abcdef0123456789abcdef.mp4"
	frame := "local/azhuo/refs/sales-script/frames/abcdef/frame.jpg"
	legacy := "local/azhuo/refs/sales-script/frames/0123456789abcdef0123456789abcdef/beat-00-5.jpg"
	for _, f := range []string{key, unrelated, frame, legacy} {
		file := filepath.Join(root, f)
		if err := os.MkdirAll(filepath.Dir(file), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(file, []byte("test"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	release := holdScriptSource("local", "/storage/"+key)
	if n, err := SweepScriptSources(cfg, time.Now()); err != nil || n != 0 {
		t.Fatal(n, err)
	}
	if _, err := os.Stat(filepath.Join(root, legacy)); !os.IsNotExist(err) {
		t.Fatal("legacy source preview was retained")
	}
	holdScriptSource("other", "/storage/"+key)()
	if _, err := os.Stat(filepath.Join(root, key)); err != nil {
		t.Fatal(err)
	}
	release()
	if _, err := os.Stat(filepath.Join(root, key)); !os.IsNotExist(err) {
		t.Fatal("terminal release did not delete source")
	}
	if err := os.WriteFile(filepath.Join(root, key), []byte("abandoned"), 0600); err != nil {
		t.Fatal(err)
	}
	if n, err := SweepScriptSources(cfg, time.Now()); err != nil || n != 1 {
		t.Fatal(n, err)
	}
	for _, f := range []string{unrelated, frame} {
		if _, err := os.Stat(filepath.Join(root, f)); err != nil {
			t.Fatal(err)
		}
	}
}
