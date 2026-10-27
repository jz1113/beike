package learning

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func TestClassMemoryIsScopedRevisionCheckedAndAppliedToFutureAnalysis(t *testing.T) {
	db := learningDB(t)
	ctx := context.Background()
	original, err := Apply(ctx, db, "a", map[string]any{"productSubcategory": "phone"}, nil, nil, BaseRecipe())
	if err != nil {
		t.Fatal(err)
	}
	if err := ChangeMemory(ctx, db, "a", testFolder, "remember", "", "avoid", "不要把磨砂画成镜面", 0); err != nil {
		t.Fatal(err)
	}
	if err := ChangeMemory(ctx, db, "a", testFolder, "remember", "", "prefer", "过期写入", 0); err == nil {
		t.Fatal("stale revision changed memory")
	}
	if _, err := BeginRun(ctx, db, "a", testFolder, "run", true); err != nil {
		t.Fatal(err)
	}
	if err := ChangeMemory(ctx, db, "a", testFolder, "remember", "", "prefer", "运行期间写入", 1); err == nil {
		t.Fatal("memory changed while model was reading it")
	}
	if err := RecoverRuns(ctx, db); err != nil {
		t.Fatal(err)
	}
	notes, _ := Notes(ctx, db, "a", testFolder)
	foreign, _ := Notes(ctx, db, "b", testFolder)
	otherCategory, _ := Notes(ctx, db, "a", "prompt_subcategory:digital_3c:case")
	if len(notes) != 1 || len(foreign) != 0 || len(otherCategory) != 0 {
		t.Fatal("class or workspace memories leaked")
	}
	bound, err := Apply(ctx, db, "a", map[string]any{"productSubcategory": "phone"}, nil, nil, BaseRecipe())
	if err != nil || !strings.Contains(bound["promptSnippet"].(string), notes[0].Content) || original["baseRecipeVersion"] == bound["baseRecipeVersion"] {
		t.Fatal("memory not bound to actual analysis or comparison fingerprint")
	}
	if strings.Contains(original["promptSnippet"].(string), notes[0].Content) {
		t.Fatal("historical snapshot changed")
	}
	if err := ChangeMemory(ctx, db, "b", testFolder, "forget", notes[0].ID, "", "", 0); err == nil {
		t.Fatal("foreign workspace deleted memory")
	}
	if err := ChangeMemory(ctx, db, "a", testFolder, "forget", notes[0].ID, "", "", 1); err != nil {
		t.Fatal(err)
	}
	after, _ := Notes(ctx, db, "a", testFolder)
	if len(after) != 0 {
		t.Fatal("memory was not removed")
	}
}

func TestMemorySeparatesRejectedHeldOutAndChangedSources(t *testing.T) {
	db := learningDB(t)
	ctx := context.Background()
	twentyGroups(t, db)
	dataset, _ := LoadDataset(ctx, db, "a", testFolder)
	if err := SaveRoles(ctx, db, "a", testFolder, dataset.Samples); err != nil {
		t.Fatal(err)
	}
	var training []Sample
	for _, sample := range dataset.Samples {
		if sample.Role == "training" {
			training = append(training, sample)
		} else {
			_ = SaveObservation(ctx, db, "a", testFolder, "old", sample, json.RawMessage(`{"compatible":true,"reusableRules":["must not be retrieved"]}`))
		}
	}
	_ = SaveObservation(ctx, db, "a", testFolder, "vision", training[0], json.RawMessage(`{"compatible":false,"reason":"图片主体是手机壳，不是手机本体"}`))
	_ = SaveObservation(ctx, db, "a", testFolder, "vision", training[1], json.RawMessage(`{"compatible":true,"reusableRules":["保持主体占比"],"conditions":["手持时"],"failuresToAvoid":["不改结构"]}`))
	memory, err := ReadMemory(ctx, db, "a", testFolder, dataset)
	if err != nil || memory.Learned != 1 || memory.Rejected != 1 || len(memory.Sources) != 1 || memory.Holdout != 0 {
		t.Fatalf("memory counts %#v error=%v", memory, err)
	}
	if MemoryCovered(memory, Version{}) {
		t.Fatal("unincorporated observations reported as already consolidated")
	}
	for i := range dataset.Samples {
		if dataset.Samples[i].ID == training[1].ID {
			dataset.Samples[i].Fingerprint = "changed"
		}
	}
	changed, _ := ReadMemory(ctx, db, "a", testFolder, dataset)
	if changed.Learned != 0 || changed.Pending != memory.Pending+1 {
		t.Fatal("changed original reused old observation")
	}
}

func TestConsolidationAcceptsOneObservationOrManualNotes(t *testing.T) {
	if ReadyToConsolidate(Memory{Holdout: 100, Rejected: 20}, 20) {
		t.Fatal("unobserved or rejected samples accepted")
	}
	if !ReadyToConsolidate(Memory{Learned: 1}, 30) {
		t.Fatal("single observation blocked")
	}
	if !ReadyToConsolidate(Memory{Notes: []Note{{Content: "真实商品优先"}}}, 20) {
		t.Fatal("manual notes blocked")
	}
}

func TestHistoricalHoldoutsBecomeAvailableWithoutLosingObservations(t *testing.T) {
	db := learningDB(t)
	ctx := context.Background()
	insertGroup(t, db, "first", "first", "a", "phone", "deconstructed")
	dataset, _ := LoadDataset(ctx, db, "a", testFolder)
	dataset.Samples[0].Role = "holdout"
	if err := SaveRoles(ctx, db, "a", testFolder, dataset.Samples); err != nil {
		t.Fatal(err)
	}
	all, err := LoadDataset(ctx, db, "a", testFolder)
	if err != nil || all.Samples[0].Role != "training" {
		t.Fatal("historical role blocked learning", err)
	}
}

func TestObservationCacheIsInvalidatedBySkillInstructionChanges(t *testing.T) {
	db := learningDB(t)
	ctx := context.Background()
	insertGroup(t, db, "g1", "g1", "a", "phone", "deconstructed")
	first, err := LoadDataset(ctx, db, "a", testFolder)
	if err != nil || len(first.Samples) != 1 {
		t.Fatalf("initial dataset: %#v %v", first, err)
	}
	raw := json.RawMessage(`{"compatible":true,"groupFramework":"四镜递进","differenceAxes":["机位","动作","场景"],"observations":[{"shot":1,"visual":"可见","replacement":"替换","purpose":"展示","promptTemplate":"主体→机位","promptExample":"@图片1"}],"reusableRules":["保真"],"conditions":["手持"],"failuresToAvoid":["变形"]}`)
	if err := SaveObservation(ctx, db, "a", testFolder, "vision", first.Samples[0], raw); err != nil {
		t.Fatal(err)
	}
	before, err := ReadMemory(ctx, db, "a", testFolder, first)
	if err != nil || before.Learned != 1 || before.Stale != 0 {
		t.Fatalf("cached observation not learned: %#v %v", before, err)
	}
	_, err = db.Exec(`INSERT INTO "CategorySkillVersion" ("id","workspaceId","folderId","parentVersionId","sourceFingerprint","manifestJson","promptSnippet","summary","model","createdAt") VALUES ('manual-v1','a',?, '', '', '{}', '改用更细的提示词架构并重新核对证据', '', 'manual', CURRENT_TIMESTAMP)`, testFolder)
	if err != nil {
		t.Fatal(err)
	}
	second, err := LoadDataset(ctx, db, "a", testFolder)
	if err != nil || second.LearningFingerprint == first.LearningFingerprint {
		t.Fatalf("skill instruction did not change learning fingerprint: %#v %v", second, err)
	}
	after, err := ReadMemory(ctx, db, "a", testFolder, second)
	if err != nil || after.Learned != 0 || after.Stale != 1 || after.Pending != 1 {
		t.Fatalf("changed instruction reused old observation: %#v %v", after, err)
	}
}
