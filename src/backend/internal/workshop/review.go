package workshop

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	learning "beike.local/cloud/src/backend/internal/platform/database/learning"
	dbworkshop "beike.local/cloud/src/backend/internal/platform/database/workshop"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"unicode/utf8"
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
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			writeFail(w, http.StatusNotFound, "当前没有活跃批次", "not_found")
			return
		}
		defer db.Close()
		batch, err := dbworkshop.ReadActiveWorkshopBatch(r.Context(), db, httpx.WorkspaceFrom(r))
		var target struct {
			BatchID string `json:"batchId"`
		}
		_ = json.Unmarshal(body, &target)
		if dbworkshop.IsCanvasWorkshopBatch(target.BatchID) {
			row, readErr := dbworkshop.GetWorkshopBatch(r.Context(), db, httpx.WorkspaceFrom(r), target.BatchID)
			err = readErr
			batch = dbworkshop.ActiveWorkshopBatch{ID: row.ID, Snapshot: row.Snapshot, Status: row.Status}
		} else if target.BatchID != "" && target.BatchID != batch.ID {
			batch.ID = ""
		}
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
		if err := saveReviewedOutput(r.Context(), db, httpx.WorkspaceFrom(r), snapshot, review); err != nil {
			writeFail(w, http.StatusBadRequest, "审核提交失败", "bad_request")
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "taskId": taskID, "decision": review.Decision})
	})
}

func parseReview(body []byte) (dbworkshop.OutputReview, string) {
	var raw map[string]any
	if json.Unmarshal(body, &raw) != nil {
		return dbworkshop.OutputReview{}, "invalid"
	}
	decision, _ := raw["decision"].(string)
	if decision != "accepted" && decision != "retry_requested" && decision != "rejected" {
		return dbworkshop.OutputReview{}, "invalid"
	}
	review := dbworkshop.OutputReview{Decision: decision}
	if scores, ok := raw["scores"].(map[string]any); ok {
		review.Fidelity, review.Composition, review.Aesthetic, review.Consistency = score(scores, "productFidelity"), score(scores, "composition"), score(scores, "aesthetic"), score(scores, "consistency")
		if review.Fidelity == nil && scores["productFidelity"] != nil || review.Composition == nil && scores["composition"] != nil || review.Aesthetic == nil && scores["aesthetic"] != nil || review.Consistency == nil && scores["consistency"] != nil {
			return dbworkshop.OutputReview{}, "invalid"
		}
	}
	if codes, ok := raw["reasonCodes"].([]any); ok {
		if len(codes) > 32 {
			return dbworkshop.OutputReview{}, "invalid"
		}
		for _, code := range codes {
			text, ok := code.(string)
			if !ok {
				return dbworkshop.OutputReview{}, "invalid"
			}
			review.ReasonCodes = append(review.ReasonCodes, text)
		}
	}
	if note, ok := raw["note"].(string); ok {
		if utf8.RuneCountInString(note) > 2000 {
			return dbworkshop.OutputReview{}, "invalid"
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
			for _, key := range []string{"selectedSceneAssetId", "selectedOutfitAssetId", "selectedPersonaAssetId", "appliedFullPromptId"} {
				if value, ok := product[key].(string); ok && value != "" {
					assets = append(assets, value)
				}
			}
			return productID, assets, true
		}
	}
	return "", nil, false
}

func saveReviewedOutput(ctx context.Context, db *sql.DB, workspace string, snapshot map[string]any, review dbworkshop.OutputReview) error {
	folder, feedback := learningReview(snapshot, review)
	if folder != "" {
		if _, err := learning.ReadFolder(ctx, db, workspace, folder); err != nil {
			return err
		}
		if feedback.VersionID != "" {
			if _, err := learning.ReadVersion(ctx, db, workspace, folder, feedback.VersionID); err != nil {
				return errors.New("成图技能版本无法核对")
			}
		}
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := dbworkshop.InsertOutputReview(ctx, tx, workspace, review); err != nil {
		return err
	}
	if folder != "" {
		if err := learning.SaveFeedback(ctx, tx, workspace, folder, feedback); err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	if folder != "" {
		autoPromoteSkill(ctx, db, workspace, folder)
	}
	return nil
}

func learningReview(snapshot map[string]any, review dbworkshop.OutputReview) (string, learning.Feedback) {
	items, _ := snapshot["items"].([]any)
	for _, raw := range items {
		product, _ := raw.(map[string]any)
		tasks, _ := product["tasks"].([]any)
		for _, rawTask := range tasks {
			task, _ := rawTask.(map[string]any)
			if field(task, "id") != review.TaskID && field(task, "taskId") != review.TaskID {
				continue
			}
			context, _ := task["learningContext"].(map[string]any)
			if field(task, "status") != "SUCCESS" || field(task, "resultStatus") == "superseded" || field(task, "resultUrl") == "" || field(context, "scopeId") == "" || field(context, "groupId") == "" || field(context, "referenceFingerprint") == "" {
				return "", learning.Feedback{}
			}
			images, _ := context["productImages"].([]any)
			if len(images) == 0 {
				return "", learning.Feedback{}
			}
			settings := map[string]any{}
			for key, value := range context {
				if key != "versionId" {
					settings[key] = value
				}
			}
			settings["shotNo"], settings["outputSize"], settings["generationSize"] = task["shot_no"], task["outputSize"], task["generationSize"]
			scores := map[string]int{}
			for key, value := range map[string]*int{"productFidelity": review.Fidelity, "composition": review.Composition, "aesthetic": review.Aesthetic, "consistency": review.Consistency} {
				if value != nil {
					scores[key] = *value
				}
			}
			attempt := field(task, "idempotencyKey")
			if attempt == "" {
				attempt = review.TaskID
			}
			return field(context, "scopeId"), learning.Feedback{VersionID: field(context, "versionId"), TaskID: review.BatchID + ":" + attempt, GroupID: field(context, "groupId"), ComparisonKey: learning.Hash(images) + ":" + learning.Hash(settings), Decision: review.Decision, Scores: scores, Note: review.Note, Evidence: map[string]any{"productImage": images[0], "referenceImage": context["referenceImage"], "resultImage": task["resultUrl"]}}
		}
	}
	return "", learning.Feedback{}
}
func field(object map[string]any, key string) string { value, _ := object[key].(string); return value }
func autoPromoteSkill(ctx context.Context, db *sql.DB, workspace, folder string) {
	scope, err := learning.ReadScope(ctx, db, workspace, folder)
	if err != nil || !scope.AutoPublish || scope.ComparisonVersionID == "" {
		return
	}
	_ = learning.Switch(ctx, db, workspace, folder, "publish", scope.ComparisonVersionID, scope.Revision)
}
