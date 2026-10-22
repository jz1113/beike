package learning

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/platform/database"
	"beike.local/cloud/src/backend/internal/platform/database/migrate"
)

const testFolder = "prompt_subcategory:digital_3c:phone"

func learningDB(t *testing.T) *sql.DB {
	t.Helper()
	root, err := filepath.Abs("../../../../../..")
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "learning.db")
	if err := migrate.Run(path, root, false); err != nil {
		t.Fatal(err)
	}
	db, err := database.OpenWrite(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if _, err := db.Exec(`INSERT OR IGNORE INTO "AssetProductCategory" ("id","name","workspaceId") VALUES ('digital_3c','手机通讯','official')`); err != nil {
		t.Fatal(err)
	}
	return db
}
func insertGroup(t *testing.T, db *sql.DB, id, source, workspace, subcategory, provenance string) {
	t.Helper()
	images := []string{}
	shots := []map[string]any{}
	for i := 1; i <= 4; i++ {
		images = append(images, fmt.Sprintf("https://example.com/%s-%d.jpg", source, i))
		shots = append(shots, map[string]any{"shot_no": i, "prompt": "手机本体，保留自然光与手部接触", "shot_type": "hand_held_only"})
	}
	rawImages, _ := json.Marshal(images)
	rawShots, _ := json.Marshal(shots)
	_, err := db.Exec(`INSERT INTO "FullPromptAsset" ("id","title","reversePromptZh","sourceImages","sourceImageIndices","shotPromptsJson","productCategoryIds","productSubcategory","groupIndex","workspaceId","provenance","updatedAt") VALUES (?,?,?,?,'[1,2,3,4]',?,'["digital_3c"]',?,1,?,?,CURRENT_TIMESTAMP)`, id, id, "完整分镜", string(rawImages), string(rawShots), subcategory, workspace, provenance)
	if err != nil {
		t.Fatal(err)
	}
}
func twentyGroups(t *testing.T, db *sql.DB) {
	for i := 0; i < 20; i++ {
		id := fmt.Sprintf("g%02d", i)
		insertGroup(t, db, id, id, "a", "phone", "deconstructed")
	}
}
func TestDatasetRequiresScopedCompleteUniqueOriginalGroups(t *testing.T) {
	db := learningDB(t)
	ctx := context.Background()
	twentyGroups(t, db)
	insertGroup(t, db, "g_duplicate", "g00", "a", "phone", "deconstructed")
	insertGroup(t, db, "g_missing", "missing", "a", "phone", "deconstructed")
	_, _ = db.Exec(`UPDATE "FullPromptAsset" SET "sourceImages"='["a","b","c"]' WHERE "id"='g_missing'`)
	insertGroup(t, db, "g_generated", "generated", "a", "phone", "workshop_generated")
	insertGroup(t, db, "g_wrong", "wrong", "a", "phone", "deconstructed")
	_, _ = db.Exec(`UPDATE "FullPromptAsset" SET "productCategoryIds"='["jewelry"]' WHERE "id"='g_wrong'`)
	insertGroup(t, db, "foreign", "foreign", "b", "phone", "deconstructed")
	insertGroup(t, db, "case", "case", "a", "case", "deconstructed")
	dataset, err := LoadDataset(ctx, db, "a", testFolder)
	if err != nil {
		t.Fatal(err)
	}
	if dataset.Total != 24 || len(dataset.Samples) != 20 || dataset.Duplicates != 1 || dataset.Excluded != 3 {
		t.Fatalf("dataset total=%d valid=%d duplicate=%d excluded=%d", dataset.Total, len(dataset.Samples), dataset.Duplicates, dataset.Excluded)
	}
	holdouts := 0
	var holdout Sample
	for _, s := range dataset.Samples {
		if s.Role == "holdout" {
			holdouts++
			holdout = s
		}
	}
	if holdouts < 3 {
		t.Fatal("no independent holdout set")
	}
	if err := SaveRoles(ctx, db, "a", testFolder, dataset.Samples); err != nil {
		t.Fatal(err)
	}
	// A reimport with a different id must not turn previously held-out images into training.
	insertGroup(t, db, "a_reimport", holdout.ID, "a", "phone", "deconstructed")
	next, err := LoadDataset(ctx, db, "a", testFolder)
	if err != nil {
		t.Fatal(err)
	}
	for _, s := range next.Samples {
		if s.ID == "a_reimport" && s.Role != "holdout" {
			t.Fatal("held-out source leaked into learning")
		}
	}
	if _, err := ReadFolder(ctx, db, "a", "jewelry"); err == nil {
		t.Fatal("major accepted as subcategory")
	}
	_, _ = db.Exec(`INSERT INTO "AssetProductCategory" ("id","name","parentId","workspaceId") VALUES ('prompt_subcategory:private','私有','digital_3c','b')`)
	if _, err := ReadFolder(ctx, db, "a", "prompt_subcategory:private"); err == nil {
		t.Fatal("foreign folder visible")
	}
	observation := json.RawMessage(`{"observations":["cached"]}`)
	sample := dataset.Samples[0]
	if err := SaveObservation(ctx, db, "a", testFolder, "vision", sample, observation); err != nil {
		t.Fatal(err)
	}
	sample.Fingerprint = "edited"
	raw, err := Observation(ctx, db, "a", testFolder, sample)
	if err != nil || raw != nil {
		t.Fatal("edited source reused old observation")
	}
}

func TestCandidateRequiresActualPairedHoldoutResultsAndCanRollback(t *testing.T) {
	db := learningDB(t)
	ctx := context.Background()
	twentyGroups(t, db)
	dataset, err := LoadDataset(ctx, db, "a", testFolder)
	if err != nil {
		t.Fatal(err)
	}
	if err := SaveRoles(ctx, db, "a", testFolder, dataset.Samples); err != nil {
		t.Fatal(err)
	}
	token, err := BeginRun(ctx, db, "a", testFolder, "input", false)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := BeginRun(ctx, db, "a", testFolder, "input", true); err == nil {
		t.Fatal("concurrent model run accepted")
	}
	version := Version{Manifest: Manifest{Samples: dataset.Samples}, PromptSnippet: strings.Repeat("商品保真规则。", 60), Summary: "首版", Model: "vision", SourceFingerprint: dataset.Fingerprint}
	if _, err := SaveVersion(ctx, db, "a", testFolder, "wrong-token", version); err == nil {
		t.Fatal("stale run wrote candidate")
	}
	id, err := SaveVersion(ctx, db, "a", testFolder, token, version)
	if err != nil {
		t.Fatal(err)
	}
	version.ID = id
	if err := FinishRun(ctx, db, "a", testFolder, token, ""); err != nil {
		t.Fatal(err)
	}
	if err := Switch(ctx, db, "a", testFolder, "trial", id, 0); err != nil {
		t.Fatal(err)
	}
	group := dataset.Samples[0]
	bound, err := Apply(ctx, db, "a", map[string]any{"productSubcategory": "phone"}, group.Images, group.Shots, BaseRecipe())
	if err != nil {
		t.Fatal(err)
	}
	if bound["learningVersionId"] != id || bound["promptSnippet"] != version.PromptSnippet {
		t.Fatal("candidate not used for new analysis")
	}
	if err := Switch(ctx, db, "a", testFolder, "publish", id, 1); err == nil {
		t.Fatal("unrated self-assessment published")
	}
	holdout := ""
	for _, s := range dataset.Samples {
		if s.Role == "holdout" {
			holdout = s.ID
			break
		}
	}
	for i := 0; i < 3; i++ {
		for _, v := range []string{"", id} {
			scores := map[string]int{"productFidelity": 80, "composition": 80, "aesthetic": 80, "consistency": 80}
			if v == id {
				scores["productFidelity"] = 90
			}
			f := Feedback{VersionID: v, TaskID: fmt.Sprintf("%s-%d", v, i), ComparisonKey: fmt.Sprintf("product%d:same-reference-settings", i), GroupID: holdout, Decision: "accepted", Scores: scores}
			if err := SaveFeedback(ctx, db, "a", testFolder, f); err != nil {
				t.Fatal(err)
			}
		}
	}
	feedback, err := Feedbacks(ctx, db, "a", testFolder)
	if err != nil {
		t.Fatal(err)
	}
	if !Validate(version, feedback).Passed {
		t.Fatal("valid paired trial refused")
	}
	if len(TrainingFeedback(dataset, feedback)) != 0 {
		t.Fatal("holdout feedback sent to rule writer")
	}
	if err := Switch(ctx, db, "a", testFolder, "publish", id, 1); err != nil {
		t.Fatal(err)
	}
	if err := Switch(ctx, db, "a", testFolder, "rollback", "", 1); err == nil {
		t.Fatal("stale revision overwrote state")
	}
	if err := Switch(ctx, db, "a", testFolder, "rollback", "", 2); err != nil {
		t.Fatal(err)
	}
	scope, _ := ReadScope(ctx, db, "a", testFolder)
	if scope.ActiveVersionID != "" || scope.TrialVersionID != "" {
		t.Fatal("rollback did not restore baseline")
	}
	_, _ = db.Exec(`UPDATE "FullPromptAsset" SET "shotPromptsJson"='[]' WHERE "id"=?`, group.ID)
	if err := Switch(ctx, db, "a", testFolder, "trial", id, 3); err == nil {
		t.Fatal("edited training evidence was not rejected")
	}
}

func TestValidationRejectsUnmatchedRegressionAndRepeatedSingleProduct(t *testing.T) {
	v := Version{ID: "candidate", Manifest: Manifest{Samples: []Sample{{ID: "heldout", Role: "holdout"}}}}
	base := Feedback{VersionID: "", ComparisonKey: "product:settings", GroupID: "heldout", Decision: "accepted", Scores: map[string]int{"productFidelity": 80, "composition": 80, "aesthetic": 80, "consistency": 80}}
	next := base
	next.VersionID = v.ID
	next.Scores = map[string]int{"productFidelity": 95, "composition": 90, "aesthetic": 90, "consistency": 90}
	fs := []Feedback{}
	for i := 0; i < 3; i++ {
		old, new := base, next
		old.ComparisonKey = fmt.Sprintf("product:%d", i)
		new.ComparisonKey = old.ComparisonKey
		fs = append(fs, old, new)
	}
	if Validate(v, fs).Passed {
		t.Fatal("three shots of one product counted as three products")
	}
	fs = nil
	for i := 0; i < 3; i++ {
		old, new := base, next
		old.ComparisonKey = fmt.Sprintf("p%d:settings", i)
		new.ComparisonKey = old.ComparisonKey
		fs = append(fs, old, new)
	}
	if !Validate(v, fs).Passed {
		t.Fatal("valid control failed")
	}
	fs[1].ComparisonKey = "p0:different-model"
	if Validate(v, fs).Passed {
		t.Fatal("different generation settings paired")
	}
	fs[1].ComparisonKey = "p0:settings"
	for i := 1; i < len(fs); i += 2 {
		fs[i].Scores = map[string]int{"productFidelity": 95, "composition": 70, "aesthetic": 90, "consistency": 90}
	}
	if Validate(v, fs).Passed {
		t.Fatal("regression passed")
	}
}
