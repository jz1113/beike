package keywords

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"
)

const receiptTTL = 24 * time.Hour

type storedReceipt struct {
	Kind      string `json:"kind"`
	Status    int    `json:"status"`
	Body      string `json:"body"`
	CreatedAt int64  `json:"createdAt"`
}

// PurgeExpiredReceipts removes rejected non-keyword receipts older than 24 hours.
func PurgeExpiredReceipts(now time.Time) int {
	root := receiptsRoot()
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
			var saved storedReceipt
			if json.Unmarshal(raw, &saved) != nil {
				continue
			}
			if saved.Kind == "keyword-review" || !receiptExpired(saved.CreatedAt, now) || !receiptRejected(saved) {
				continue
			}
			if os.Remove(file) == nil {
				purged++
			}
		}
	}
	return purged
}

func receiptExpired(createdAt int64, now time.Time) bool {
	if createdAt <= 0 {
		return true
	}
	return now.Sub(time.UnixMilli(createdAt)) >= receiptTTL
}

func receiptRejected(saved storedReceipt) bool {
	if saved.Status < 400 || saved.Status >= 500 || saved.Body == "" {
		return false
	}
	var body struct {
		SubmissionRejected bool `json:"submissionRejected"`
	}
	if json.Unmarshal([]byte(saved.Body), &body) != nil {
		return false
	}
	return body.SubmissionRejected
}
