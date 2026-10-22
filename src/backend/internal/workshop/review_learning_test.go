package workshop

import (
	"encoding/json"
	"testing"

	dbworkshop "beike.local/cloud/src/backend/internal/platform/database/workshop"
)

func TestLearningReviewUsesFrozenAttemptNotCurrentProductSkill(t *testing.T) {
	raw := `{"items":[{"id":"p","appliedSkillSnapshot":{"learningVersionId":"newer-version"},"tasks":[{"id":"task","status":"SUCCESS","resultUrl":"https://example.com/result","idempotencyKey":"generation:a0","shot_no":1,"outputSize":"1536x2048","generationSize":"1536x2048","learningContext":{"scopeId":"folder","versionId":"candidate","groupId":"reference","referenceFingerprint":"four-source-images-and-prompts","baseRecipeVersion":"base","productImages":["https://example.com/product"],"referenceImage":"https://example.com/original","model":"image-model","aspectRatio":"3:4","quality":"high","strategy":"single_shot","anchorFaceUrl":"","replacements":["","",""]}}]}]}`
	var snapshot map[string]any
	if err := json.Unmarshal([]byte(raw), &snapshot); err != nil {
		t.Fatal(err)
	}
	score := 90
	review := dbworkshop.OutputReview{BatchID: "batch", TaskID: "task", Decision: "accepted", Fidelity: &score, Composition: &score, Aesthetic: &score, Consistency: &score}
	folder, first := learningReview(snapshot, review)
	if folder != "folder" || first.VersionID != "candidate" || first.TaskID != "batch:generation:a0" || first.Evidence["resultImage"] != "https://example.com/result" || len(first.Scores) != 4 {
		t.Fatal("missing frozen generation evidence")
	}
	task := snapshot["items"].([]any)[0].(map[string]any)["tasks"].([]any)[0].(map[string]any)
	context := task["learningContext"].(map[string]any)
	context["versionId"] = ""
	_, control := learningReview(snapshot, review)
	if first.ComparisonKey != control.ComparisonKey {
		t.Fatal("same product/reference/settings not paired")
	}
	context["model"] = "different-model"
	_, changed := learningReview(snapshot, review)
	if changed.ComparisonKey == control.ComparisonKey {
		t.Fatal("different models paired")
	}
	context["model"] = "image-model"
	task["outputSize"] = "1024x1024"
	_, changed = learningReview(snapshot, review)
	if changed.ComparisonKey == control.ComparisonKey {
		t.Fatal("different output dimensions paired")
	}
	task["idempotencyKey"] = "generation:a1"
	_, retry := learningReview(snapshot, review)
	if retry.TaskID == first.TaskID {
		t.Fatal("retry overwrote previous attempt rating")
	}
	task["resultStatus"] = "superseded"
	if folder, _ := learningReview(snapshot, review); folder != "" {
		t.Fatal("obsolete output entered feedback pool")
	}
}
