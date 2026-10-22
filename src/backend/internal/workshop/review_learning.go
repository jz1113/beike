package workshop

import (
	"context"
	"database/sql"
	"errors"

	learning "beike.local/cloud/src/backend/internal/platform/database/learning"
	dbworkshop "beike.local/cloud/src/backend/internal/platform/database/workshop"
)

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
