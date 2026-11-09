package learning

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/platform/database"
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
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
	for _, sample := range dataset.Samples {
		if sample.Role != "training" {
			t.Fatal("effective original excluded from learning")
		}
	}
	if err := SaveRoles(ctx, db, "a", testFolder, dataset.Samples); err != nil {
		t.Fatal(err)
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
	// Optional independent comparisons still work for historical manifests.
	dataset.Samples[0].Role = "holdout"
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
	if bound["learningVersionId"] != id || !strings.Contains(bound["promptSnippet"].(string), version.PromptSnippet) || !strings.Contains(bound["promptSnippet"].(string), BaseRecipe()["promptSnippet"].(string)) {
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

func TestOneReferenceCanBeActivatedDirectlyWithRevisionAndRollback(t *testing.T) {
	db := learningDB(t)
	ctx := context.Background()
	insertGroup(t, db, "one", "one", "a", "phone", "deconstructed")
	dataset, err := LoadDataset(ctx, db, "a", testFolder)
	if err != nil {
		t.Fatal(err)
	}
	scope, _ := ReadScope(ctx, db, "a", testFolder)
	if scope.AutoAnalyze || scope.MinSamples != 1 {
		t.Fatal("learning is not manual and available from one group")
	}
	token, err := BeginRun(ctx, db, "a", testFolder, "first", true)
	if err != nil {
		t.Fatal(err)
	}
	version := Version{Manifest: Manifest{Samples: dataset.Samples}, PromptSnippet: "单组观察作为有条件的参考方法", Summary: "首版"}
	id, err := SaveVersion(ctx, db, "a", testFolder, token, version)
	if err != nil {
		t.Fatal(err)
	}
	if err := FinishRun(ctx, db, "a", testFolder, token, ""); err != nil {
		t.Fatal(err)
	}
	if err := Switch(ctx, db, "b", testFolder, "activate", id, 0); err == nil {
		t.Fatal("foreign activation accepted")
	}
	if err := Switch(ctx, db, "a", testFolder, "activate", id, 0); err != nil {
		t.Fatal(err)
	}
	scope, _ = ReadScope(ctx, db, "a", testFolder)
	if scope.ActiveVersionID != id || scope.TrialVersionID != "" {
		t.Fatal("direct activation lost")
	}
	if err := Switch(ctx, db, "a", testFolder, "rollback", "", 0); err == nil {
		t.Fatal("stale rollback accepted")
	}
	if err := Switch(ctx, db, "a", testFolder, "rollback", "", 1); err != nil {
		t.Fatal(err)
	}
}

func TestManualNotesCanFormVersionWithoutInventedImageEvidence(t *testing.T) {
	db := learningDB(t)
	ctx := context.Background()
	if err := ChangeMemory(ctx, db, "a", testFolder, "remember", "", "prefer", "保留自然纹理", 0); err != nil {
		t.Fatal(err)
	}
	notes, _ := Notes(ctx, db, "a", testFolder)
	token, _ := BeginRun(ctx, db, "a", testFolder, "notes", true)
	id, err := SaveVersion(ctx, db, "a", testFolder, token, Version{Manifest: Manifest{Notes: notes, MemoryFingerprint: Hash(notes)}, PromptSnippet: "仅有手动偏好，尚无图片验证"})
	if err != nil {
		t.Fatal(err)
	}
	_ = FinishRun(ctx, db, "a", testFolder, token, "")
	if err := Switch(ctx, db, "a", testFolder, "activate", id, 1); err != nil {
		t.Fatal(err)
	}
}

func TestEditSkillCreatesCandidateWithoutChangingProductionOrHistory(t *testing.T) {
	db := learningDB(t)
	ctx := context.Background()
	if err := ChangeMemory(ctx, db, "a", testFolder, "remember", "", "prefer", "自然侧光", 0); err != nil {
		t.Fatal(err)
	}
	notes, _ := Notes(ctx, db, "a", testFolder)
	token, _ := BeginRun(ctx, db, "a", testFolder, "initial", true)
	sourceID, err := SaveVersion(ctx, db, "a", testFolder, token, Version{Manifest: Manifest{Notes: notes, MemoryFingerprint: Hash(notes)}, PromptSnippet: "原始技能正文", Summary: "原版"})
	if err != nil {
		t.Fatal(err)
	}
	if err := FinishRun(ctx, db, "a", testFolder, token, ""); err != nil {
		t.Fatal(err)
	}
	if err := Switch(ctx, db, "a", testFolder, "activate", sourceID, 1); err != nil {
		t.Fatal(err)
	}
	if _, err := EditVersion(ctx, db, "b", testFolder, sourceID, "其他工作区", "", 0); err == nil {
		t.Fatal("foreign workspace edit accepted")
	}
	if _, err := EditVersion(ctx, db, "a", "prompt_subcategory:digital_3c:case", sourceID, "其他细分", "", 0); err == nil {
		t.Fatal("foreign folder edit accepted")
	}
	if _, err := EditVersion(ctx, db, "a", testFolder, sourceID, "并发旧版本", "", 1); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale revision: %v", err)
	}
	for _, content := range []string{"   ", "原始技能正文", strings.Repeat("字", 16001)} {
		if _, err := EditVersion(ctx, db, "a", testFolder, sourceID, content, "", 2); err == nil {
			t.Fatal("invalid content accepted")
		}
	}
	editedID, err := EditVersion(ctx, db, "a", testFolder, sourceID, "修改后的完整技能正文", "减少道具", 2)
	if err != nil {
		t.Fatal(err)
	}
	source, _ := ReadVersion(ctx, db, "a", testFolder, sourceID)
	edited, _ := ReadVersion(ctx, db, "a", testFolder, editedID)
	scope, _ := ReadScope(ctx, db, "a", testFolder)
	if source.PromptSnippet != "原始技能正文" || edited.ParentVersionID != sourceID || edited.Model != "manual" || edited.Summary != "减少道具" || edited.Manifest.MemoryFingerprint != source.Manifest.MemoryFingerprint {
		t.Fatalf("version provenance lost: %#v", edited)
	}
	if scope.ActiveVersionID != sourceID || scope.Revision != 3 {
		t.Fatalf("edit changed production: %#v", scope)
	}
	events, _ := Events(ctx, db, "a", testFolder)
	if len(events) == 0 || events[0].Type != "edit" || !strings.Contains(events[0].Detail, sourceID) {
		t.Fatal("edit provenance not recorded")
	}
	if err := Switch(ctx, db, "a", testFolder, "activate", editedID, 3); err != nil {
		t.Fatal(err)
	}
	if err := Switch(ctx, db, "a", testFolder, "rollback", "", 4); err != nil {
		t.Fatal(err)
	}
	scope, _ = ReadScope(ctx, db, "a", testFolder)
	if scope.ActiveVersionID != sourceID {
		t.Fatal("rollback did not restore original skill")
	}
	token, _ = BeginRun(ctx, db, "a", testFolder, "running", true)
	if _, err := EditVersion(ctx, db, "a", testFolder, sourceID, "学习中不能保存", "", scope.Revision); !errors.Is(err, ErrConflict) {
		t.Fatalf("concurrent learning accepted: %v", err)
	}
	_ = FinishRun(ctx, db, "a", testFolder, token, "")
	versions, _ := Versions(ctx, db, "a", testFolder)
	if len(versions) != 2 {
		t.Fatalf("failed edits wrote candidates: %d", len(versions))
	}
}

func TestProductSkillMatchesSubjectWithoutReferenceInventory(t *testing.T) {
	root := "home"
	lamp := database.PromptSubcategoryPrefix + "home:lamp"
	whitespace := database.PromptSubcategoryPrefix + "home:blank"
	categories := []dblibrary.OrganizationCategory{
		{ID: "digital_3c", Name: "手机通讯"},
		{ID: root, Name: "家居"},
		{ID: lamp, ParentID: &root, Name: "照明", Keywords: `["台灯"]`, Aliases: `["阅读灯"]`},
		{ID: whitespace, ParentID: &root, Name: "  "},
	}
	for _, tt := range []struct{ title, want string }{
		{"智能手机 5G 赠手机壳", database.BuiltinFolderID("phone")},
		{"适用智能手机的透明手机壳", database.BuiltinFolderID("case")},
		{"蓝牙耳机", database.BuiltinFolderID("earphone")},
		{"平板电脑", database.BuiltinFolderID("tablet")},
		{"护眼台灯", lamp},
		{"桌面阅读灯", lamp},
		{"陶瓷花瓶", ""},
	} {
		t.Run(tt.title, func(t *testing.T) {
			if got := productSkillFolder(categories, tt.title, nil); got != tt.want {
				t.Fatalf("matched %q, want %q", got, tt.want)
			}
		})
	}
	categories = append(categories, dblibrary.OrganizationCategory{ID: database.PromptSubcategoryPrefix + "home:other", ParentID: &root, Keywords: `["台灯"]`})
	if got := productSkillFolder(categories, "台灯", nil); got != "" {
		t.Fatalf("ambiguous rules selected %q", got)
	}
	categories[len(categories)-1].IsArchived = true
	if got := productSkillFolder(categories, "台灯", nil); got != lamp {
		t.Fatalf("archived folder interfered: %q", got)
	}
	categories[1].IsArchived = true
	if got := productSkillFolder(categories, "台灯", nil); got != "" {
		t.Fatalf("archived parent selected %q", got)
	}
}

func TestProductProductionKeepsActivatedSkillAfterTrainingImagesDisappear(t *testing.T) {
	db := learningDB(t)
	ctx := context.Background()
	insertGroup(t, db, "original", "original", "a", "phone", "deconstructed")
	dataset, err := LoadDataset(ctx, db, "a", testFolder)
	if err != nil {
		t.Fatal(err)
	}
	token, err := BeginRun(ctx, db, "a", testFolder, "input", true)
	if err != nil {
		t.Fatal(err)
	}
	id, err := SaveVersion(ctx, db, "a", testFolder, token, Version{Manifest: Manifest{Samples: dataset.Samples}, PromptSnippet: "独立设计生活摄影分镜，保留机身轮廓"})
	if err != nil {
		t.Fatal(err)
	}
	if err := FinishRun(ctx, db, "a", testFolder, token, ""); err != nil {
		t.Fatal(err)
	}
	if err := Switch(ctx, db, "a", testFolder, "activate", id, 0); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`DELETE FROM "FullPromptAsset" WHERE "id"='original'`); err != nil {
		t.Fatal(err)
	}
	if err := ChangeMemory(ctx, db, "a", testFolder, "remember", "", "avoid", "不要把磨砂画成镜面", 1); err != nil {
		t.Fatal(err)
	}
	skill, err := ForProduct(ctx, db, "a", "智能手机", nil, BaseRecipe())
	if err != nil {
		t.Fatal(err)
	}
	if skill["learningVersionId"] != id || !strings.Contains(text(skill, "promptSnippet"), "独立设计生活摄影分镜") || !strings.Contains(text(skill, "promptSnippet"), "不要把磨砂画成镜面") {
		t.Fatalf("activated skill or notes lost: %#v", skill)
	}
	other, err := ForProduct(ctx, db, "b", "智能手机", nil, BaseRecipe())
	if err != nil || other["learningVersionId"] != "" || strings.Contains(text(other, "promptSnippet"), "不要把磨砂画成镜面") {
		t.Fatalf("workspace skill leaked: %#v, %v", other, err)
	}
}

func TestSkillFeedbackReturnsToItsFolderAndPairsWithoutReferenceGroups(t *testing.T) {
	version := Version{ID: "next", FolderID: testFolder, ParentVersionID: "old"}
	feedback := []Feedback{}
	for _, product := range []string{"p1", "p2", "p3"} {
		for _, id := range []string{"old", "next"} {
			score := 80
			if id == "next" {
				score = 90
			}
			feedback = append(feedback, Feedback{VersionID: id, ComparisonKey: product + ":same-product-settings", GroupID: "skill:" + testFolder, Decision: "accepted", Scores: map[string]int{"productFidelity": score, "composition": score, "aesthetic": score, "consistency": score}})
		}
	}
	if result := Validate(version, feedback); !result.Passed || result.Products != 3 {
		t.Fatalf("skill comparisons require training images: %#v", result)
	}
	feedback = append(feedback, Feedback{GroupID: "skill:another-folder"})
	if got := TrainingFeedback(Dataset{Folder: Folder{ID: testFolder}}, feedback); len(got) != 6 {
		t.Fatalf("skill feedback missing or crossed folder: %#v", got)
	}
}
