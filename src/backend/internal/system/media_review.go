package system

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

type mediaReviewRecord struct {
	URL      string `json:"url"`
	Source   any    `json:"source"`
	State    string `json:"state"`
	QueuedAt string `json:"queuedAt"`
}

func mediaReviewHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		dir := filepath.Join(cfg.MediaReviewRoot(), httpx.WorkspaceFrom(r))
		entries, err := os.ReadDir(dir)
		items := []mediaReviewRecord{}
		if err == nil {
			for _, entry := range entries {
				if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
					continue
				}
				raw, readErr := os.ReadFile(filepath.Join(dir, entry.Name()))
				if readErr != nil {
					continue
				}
				var record mediaReviewRecord
				if json.Unmarshal(raw, &record) != nil || record.URL == "" {
					continue
				}
				items = append(items, record)
			}
		}
		sortMediaReviews(items)
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "count": len(items), "items": items})
	}
}

func sortMediaReviews(items []mediaReviewRecord) {
	for i := 1; i < len(items); i++ {
		item := items[i]
		j := i
		for j > 0 && items[j-1].QueuedAt > item.QueuedAt {
			items[j] = items[j-1]
			j--
		}
		items[j] = item
	}
}
