package sales

import (
	"errors"
	"io/fs"
	"log"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/database"
	"beike.local/cloud/src/backend/internal/platform/storage"
)

// Only files created by ScriptVideoUpload are disposable inputs. Depth clips,
// generated media and user files have different paths and ownership.
var scriptUploadKey = regexp.MustCompile(`^([^/]+)/azhuo/refs/sales-script/[0-9]{6}/([a-f0-9]{32}|request)\.(mp4|mov|webm)$`)
var legacyScriptFrameKey = regexp.MustCompile(`^[^/]+/azhuo/refs/sales-script/frames/[a-f0-9]{32}/beat-[0-9]{2}-[0-9]+\.jpg$`)
var uploadsMu sync.Mutex
var inUse = map[string]int{}

func managedScriptSource(workspace, url string) string {
	url, _, _ = strings.Cut(url, "?")
	url, _, _ = strings.Cut(url, "#")
	key := strings.TrimPrefix(url, "/storage/")
	m := scriptUploadKey.FindStringSubmatch(key)
	if key == url || m == nil || m[1] != workspace || strings.Contains(key, "..") {
		return ""
	}
	return key
}
func savedSource(workspace, url string) string {
	if managedScriptSource(workspace, url) != "" {
		return ""
	}
	return url
}

func holdScriptSource(workspace, url string) func() {
	key := managedScriptSource(workspace, url)
	if key == "" {
		return func() {}
	}
	uploadsMu.Lock()
	inUse[key]++
	uploadsMu.Unlock()
	return func() {
		uploadsMu.Lock()
		defer uploadsMu.Unlock()
		inUse[key]--
		if inUse[key] == 0 {
			delete(inUse, key)
			root, err := os.OpenRoot(storage.ResolveRoot())
			if err == nil {
				err = root.Remove(key)
				root.Close()
			}
			if err != nil && !os.IsNotExist(err) {
				log.Printf("[参考视频] 清理失败: %v", err)
			}
		}
	}
}

// Sweep only the reference upload namespace, including uploads abandoned before
// analysis. Call before serving on startup; running jobs hold their inputs.
func SweepScriptSources(cfg config.Config, before time.Time) (int, error) {
	uploadsMu.Lock()
	defer uploadsMu.Unlock()
	root, err := os.OpenRoot(storage.ResolveRoot())
	if errors.Is(err, fs.ErrNotExist) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	defer root.Close()
	// Previous versions kept a JPEG from the source for each beat. Depth playback
	// replaces those previews. Only remove files matching the old writer's path.
	frames, err := fs.Glob(root.FS(), "*/azhuo/refs/sales-script/frames/*/beat-*.jpg")
	if err != nil {
		return 0, err
	}
	for _, frame := range frames {
		if legacyScriptFrameKey.MatchString(frame) {
			if err := root.Remove(frame); err != nil && !errors.Is(err, fs.ErrNotExist) {
				return 0, err
			}
		}
	}
	keys, err := fs.Glob(root.FS(), "*/azhuo/refs/sales-script/??????/*")
	if err != nil {
		return 0, err
	}
	count := 0
	for _, key := range keys {
		if !scriptUploadKey.MatchString(key) || inUse[key] > 0 {
			continue
		}
		info, err := root.Lstat(key)
		if err != nil {
			return count, err
		}
		if !info.Mode().IsRegular() || info.ModTime().After(before) {
			continue
		}
		if err = root.Remove(key); err != nil {
			return count, err
		}
		count++
	}
	db, err := database.OpenRequired(cfg.SQLiteFile())
	if err != nil {
		return count, err
	}
	defer db.Close()
	rows, err := db.Query(`SELECT workspaceId,videoUrl FROM SalesReferenceScript WHERE videoUrl LIKE '%/refs/sales-script/%' GROUP BY workspaceId,videoUrl`)
	if err != nil {
		return count, err
	}
	var stale [][2]string
	for rows.Next() {
		var w, u string
		if err = rows.Scan(&w, &u); err != nil {
			rows.Close()
			return count, err
		}
		if key := managedScriptSource(w, u); key != "" {
			if _, err := root.Stat(key); os.IsNotExist(err) {
				stale = append(stale, [2]string{w, u})
			}
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return count, err
	}
	for _, row := range stale {
		if _, err = db.Exec(`UPDATE SalesReferenceScript SET videoUrl='' WHERE workspaceId=? AND videoUrl=?`, row[0], row[1]); err != nil {
			return count, err
		}
	}
	return count, nil
}
