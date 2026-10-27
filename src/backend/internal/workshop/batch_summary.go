package workshop

import (
	"encoding/json"
	"strings"

	dbworkshop "beike.local/cloud/src/backend/internal/platform/database/workshop"
)

// History sends only labels, four preview URLs and counts, never full prompts or image data.
func summarizeBatch(row dbworkshop.WorkshopBatchRow) map[string]any {
	var snapshot struct {
		BatchInputText string `json:"batchInputText"`
		Items          []struct {
			Title                 string   `json:"title"`
			ItemID                string   `json:"itemId"`
			Status                string   `json:"status"`
			Selected              bool     `json:"selected"`
			CoverImage            string   `json:"coverImage"`
			SelectedProductImages []string `json:"selectedProductImages"`
			Tasks                 []struct {
				Status       string `json:"status"`
				ResultURL    string `json:"resultUrl"`
				ResultStatus string `json:"resultStatus"`
			} `json:"tasks"`
		} `json:"items"`
	}
	_ = json.Unmarshal([]byte(row.Snapshot), &snapshot)
	titles, ids, previews := []string{}, []string{}, []string{}
	ready, tasks, results, failed := 0, 0, 0, 0
	for _, item := range snapshot.Items {
		if title := strings.TrimSpace(item.Title); title != "" {
			titles = append(titles, title)
		}
		if id := strings.TrimSpace(item.ItemID); id != "" {
			ids = append(ids, id)
		}
		if item.Status == "success" && item.Selected {
			ready++
		}
		preview := ""
		for _, task := range item.Tasks {
			if task.ResultStatus == "superseded" {
				continue
			}
			tasks++
			if task.Status == "FAILURE" {
				failed++
			}
			if task.Status == "SUCCESS" && usableHistoryResult(task.ResultURL) {
				results++
				if preview == "" && durableHistoryImage(task.ResultURL) {
					preview = task.ResultURL
				}
			}
		}
		if preview == "" {
			for _, image := range append(append([]string{}, item.SelectedProductImages...), item.CoverImage) {
				if durableHistoryImage(image) {
					preview = image
					break
				}
			}
		}
		if preview != "" && len(previews) < 4 {
			previews = append(previews, preview)
		}
	}
	return map[string]any{
		"id": row.ID, "name": row.Name, "status": row.Status, "revision": row.Revision,
		"createdAt": row.CreatedAt, "updatedAt": row.UpdatedAt, "legacyRecovered": row.LegacyRecovered,
		"itemCount": len(snapshot.Items), "readyCount": ready, "taskCount": tasks,
		"hasInput": strings.TrimSpace(snapshot.BatchInputText) != "", "resultCount": results, "failedCount": failed, "productTitles": titles, "productIds": ids, "previewImages": previews,
	}
}

func durableHistoryImage(url string) bool {
	return strings.TrimSpace(url) != "" && !strings.HasPrefix(url, "blob:") && !strings.HasPrefix(url, "data:")
}

// Match the browser's usable-result rule for legacy short data URLs, without sending them as thumbnails.
func usableHistoryResult(url string) bool {
	return url != "" && !strings.HasPrefix(url, "blob:") && !(strings.HasPrefix(url, "data:") && len(url) > 800)
}
