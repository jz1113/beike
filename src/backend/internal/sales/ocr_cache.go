package sales

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"time"

	"beike.local/cloud/src/backend/internal/config"
)

func ocrCachePath(cfg config.Config, workspace string, data []byte) string {
	scope := sha256.Sum256([]byte(workspace))
	hash := sha256.New()
	hash.Write([]byte(engineRevision))
	hash.Write(data)
	return filepath.Join(ocrDataDir(cfg), "ocr-cache", hex.EncodeToString(scope[:]), hex.EncodeToString(hash.Sum(nil))+".json")
}

func readOCRCache(file string) (ocrResult, bool) {
	var result ocrResult
	stat, err := os.Stat(file)
	if err != nil || stat.Size() > 4<<20 || time.Since(stat.ModTime()) > 7*24*time.Hour {
		return result, false
	}
	data, err := os.ReadFile(file)
	if err != nil || json.Unmarshal(data, &result) != nil || result.Engine != engineRevision || result.Lines == nil {
		return result, false
	}
	result.Cached = true
	return result, true
}

func writeOCRCache(file string, result ocrResult) {
	directory := filepath.Dir(file)
	if os.MkdirAll(directory, 0700) != nil {
		return
	}
	data, err := json.Marshal(result)
	if err != nil {
		return
	}
	// A failed cache write never prevents returning the successful recognition.
	temp, err := os.CreateTemp(directory, ".ocr-*")
	if err != nil {
		return
	}
	defer os.Remove(temp.Name())
	_, err = temp.Write(data)
	closeErr := temp.Close()
	if err != nil || closeErr != nil || os.Rename(temp.Name(), file) != nil {
		return
	}
	entries, _ := os.ReadDir(directory)
	type item struct {
		path     string
		modified time.Time
	}
	files := make([]item, 0, len(entries))
	for _, entry := range entries {
		if filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		if info, err := entry.Info(); err == nil {
			files = append(files, item{filepath.Join(directory, entry.Name()), info.ModTime()})
		}
	}
	sort.Slice(files, func(i, j int) bool { return files[i].modified.After(files[j].modified) })
	for index, entry := range files {
		if index >= 200 || time.Since(entry.modified) > 7*24*time.Hour {
			_ = os.Remove(entry.path)
		}
	}
}
