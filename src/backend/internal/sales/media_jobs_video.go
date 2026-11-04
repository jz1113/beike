package sales

import (
	"beike.local/cloud/src/backend/internal/platform/storage"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"
)

// Mutable remote references cannot establish that two finished videos had identical input bytes.
func videoInputVersions(input map[string]any, workspace string) ([]string, bool) {
	hashes := []string{}
	for _, field := range []string{"images", "videos", "audios"} {
		refs, _ := input[field].([]any)
		for _, ref := range refs {
			source := assetCreationText(ref)
			if strings.HasPrefix(source, "data:") {
				continue
			}
			if !strings.HasPrefix(source, "/storage/") {
				return hashes, false
			}
			rel := strings.SplitN(strings.TrimPrefix(source, "/storage/"), "?", 2)[0]
			if !storage.WorkspaceRel(rel, workspace, true) {
				return hashes, false
			}
			h := fileHash(storage.StoredFile(rel))
			if h == "" {
				return hashes, false
			}
			hashes = append(hashes, h)
		}
	}
	return hashes, true
}

// Reuse a playable owned delivery or the original paid operation. A failed poll, service
// restart, or failed download never authorizes a second POST to the model provider.
func previousMediaVideo(db *sql.DB, workspace, key string, cacheable bool) (mediaJob, bool, error) {
	j, err := scanMediaJob(db.QueryRow(`SELECT `+mediaJobColumns+` FROM SalesMediaJob WHERE workspaceId=? AND inputKey=? AND kind='video' ORDER BY createdAt DESC LIMIT 1`, workspace, key))
	if errors.Is(err, sql.ErrNoRows) {
		return mediaJob{}, false, nil
	}
	if err != nil {
		return mediaJob{}, false, err
	}
	var receipt map[string]any
	_ = json.Unmarshal(j.Result, &receipt)
	if j.Status == "completed" {
		url := assetCreationText(receipt["resultUrl"])
		if cacheable && strings.HasPrefix(url, "/storage/"+workspace+"/") && storage.StoredFile(strings.TrimPrefix(url, "/storage/")) != "" {
			return j, true, nil
		}
		return mediaJob{}, false, nil
	}
	if receipt["rejected"] == true {
		return mediaJob{}, false, nil
	}
	if assetCreationText(receipt["taskKey"]) != "" || assetCreationText(receipt["taskId"]) != "" {
		return j, false, nil
	}
	return mediaJob{}, false, nil
}
func resumeVideoRequest(ctx context.Context, r *http.Request, receipt map[string]any) *http.Request {
	poll := r.Clone(ctx)
	poll.Method = http.MethodGet
	poll.Body = nil
	poll.URL.RawQuery = url.Values{"taskKey": {assetCreationText(receipt["taskKey"])}}.Encode()
	return poll
}
