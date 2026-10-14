package system

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"
)

const mediaReviewTTL = 7 * 24 * time.Hour

// PurgeExpiredMediaReviews deletes review records older than seven days.
func PurgeExpiredMediaReviews(root string, now time.Time) int {
	if root == "" {
		return 0
	}
	dirs := []string{root}
	entries, _ := os.ReadDir(root)
	for _, entry := range entries {
		if entry.IsDir() {
			dirs = append(dirs, filepath.Join(root, entry.Name()))
		}
	}
	purged := 0
	for _, dir := range dirs {
		names, _ := os.ReadDir(dir)
		for _, name := range names {
			if name.IsDir() || filepath.Ext(name.Name()) != ".json" {
				continue
			}
			file := filepath.Join(dir, name.Name())
			raw, err := os.ReadFile(file)
			if err != nil {
				continue
			}
			var record struct {
				QueuedAt string `json:"queuedAt"`
			}
			if json.Unmarshal(raw, &record) != nil {
				_ = os.Remove(file)
				purged++
				continue
			}
			queued, err := time.Parse(time.RFC3339, record.QueuedAt)
			if err != nil || now.Sub(queued) >= mediaReviewTTL {
				if os.Remove(file) == nil {
					purged++
				}
			}
		}
	}
	return purged
}
