package workshop

import (
	"encoding/json"
	"io"
	"net/http"
	"unicode/utf8"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func Review(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		taskID := r.PathValue("taskId")
		if taskID == "" {
			writeFail(w, http.StatusBadRequest, "任务标识不正确", "bad_request")
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if err != nil {
			writeFail(w, http.StatusBadRequest, "审核提交失败", "bad_request")
			return
		}
		review, message := parseReview(body)
		if message != "" {
			writeFail(w, http.StatusBadRequest, "审核提交失败", "bad_request")
			return
		}
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			writeFail(w, http.StatusNotFound, "当前没有活跃批次", "not_found")
			return
		}
		defer db.Close()
		batch, err := database.ReadActiveWorkshopBatch(r.Context(), db, httpx.WorkspaceFrom(r))
		if err != nil || batch.ID == "" || batch.Status == "archived" {
			writeFail(w, http.StatusNotFound, "当前没有活跃批次", "not_found")
			return
		}
		var snapshot map[string]any
		if json.Unmarshal([]byte(batch.Snapshot), &snapshot) != nil {
			writeFail(w, http.StatusNotFound, "任务不属于当前批次", "not_found")
			return
		}
		productID, assetIDs, ok := findReviewTarget(snapshot, taskID)
		if !ok {
			writeFail(w, http.StatusNotFound, "任务不属于当前批次", "not_found")
			return
		}
		review.BatchID = batch.ID
		review.ProductID = productID
		review.TaskID = taskID
		review.AssetIDs = assetIDs
		if err := database.InsertOutputReview(r.Context(), db, httpx.WorkspaceFrom(r), review); err != nil {
			writeFail(w, http.StatusBadRequest, "审核提交失败", "bad_request")
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "taskId": taskID, "decision": review.Decision})
	})
}

func parseReview(body []byte) (database.OutputReview, string) {
	var raw map[string]any
	if json.Unmarshal(body, &raw) != nil {
		return database.OutputReview{}, "invalid"
	}
	decision, _ := raw["decision"].(string)
	if decision != "accepted" && decision != "retry_requested" && decision != "rejected" {
		return database.OutputReview{}, "invalid"
	}
	review := database.OutputReview{Decision: decision}
	if scores, ok := raw["scores"].(map[string]any); ok {
		review.Fidelity, review.Composition, review.Aesthetic, review.Consistency = score(scores, "productFidelity"), score(scores, "composition"), score(scores, "aesthetic"), score(scores, "consistency")
		if review.Fidelity == nil && scores["productFidelity"] != nil || review.Composition == nil && scores["composition"] != nil || review.Aesthetic == nil && scores["aesthetic"] != nil || review.Consistency == nil && scores["consistency"] != nil {
			return database.OutputReview{}, "invalid"
		}
	}
	if codes, ok := raw["reasonCodes"].([]any); ok {
		if len(codes) > 32 {
			return database.OutputReview{}, "invalid"
		}
		for _, code := range codes {
			text, ok := code.(string)
			if !ok {
				return database.OutputReview{}, "invalid"
			}
			review.ReasonCodes = append(review.ReasonCodes, text)
		}
	}
	if note, ok := raw["note"].(string); ok {
		if utf8.RuneCountInString(note) > 2000 {
			return database.OutputReview{}, "invalid"
		}
		review.Note = note
	}
	return review, ""
}

func score(scores map[string]any, key string) *int {
	value, exists := scores[key]
	if !exists || value == nil {
		return nil
	}
	number, ok := whole(value)
	if !ok || number < 0 || number > 100 {
		return nil
	}
	return &number
}

func findReviewTarget(snapshot map[string]any, taskID string) (string, []string, bool) {
	items, _ := snapshot["items"].([]any)
	for _, item := range items {
		product, ok := item.(map[string]any)
		if !ok {
			continue
		}
		tasks, _ := product["tasks"].([]any)
		for _, rawTask := range tasks {
			task, ok := rawTask.(map[string]any)
			if !ok {
				continue
			}
			id, _ := task["id"].(string)
			upstream, _ := task["taskId"].(string)
			if id != taskID && upstream != taskID {
				continue
			}
			productID, _ := product["id"].(string)
			assets := []string{}
			for _, key := range []string{"appliedActionId"} {
				if value, ok := task[key].(string); ok && value != "" {
					assets = append(assets, value)
				}
			}
			for _, key := range []string{"selectedSceneAssetId", "selectedOutfitAssetId", "selectedPersonaAssetId"} {
				if value, ok := product[key].(string); ok && value != "" {
					assets = append(assets, value)
				}
			}
			return productID, assets, true
		}
	}
	return "", nil, false
}
