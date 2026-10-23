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
	if err != nil || memory.Learned != 1 || memory.Rejected != 1 || len(memory.Sources) != 1 || memory.Holdout < 3 {
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

func TestConsolidationNeedsActualTrainingAndIndependentValidation(t *testing.T) {
	if ReadyToConsolidate(Memory{Learned: 5, Holdout: 100}, 20) {
		t.Fatal("validation images substituted for training observations")
	}
	if !ReadyToConsolidate(Memory{Learned: 16, Holdout: 4}, 20) {
		t.Fatal("ready evidence not accepted")
	}
	if ReadyToConsolidate(Memory{Learned: 30, Holdout: 2}, 20) {
		t.Fatal("insufficient independent validation")
	}
}

func TestNewGroupsFillValidationWithoutReassigningLearnedTraining(t *testing.T) {
	db := learningDB(t)
	ctx := context.Background()
	insertGroup(t, db, "first", "first", "a", "phone", "deconstructed")
	first, _ := LoadDataset(ctx, db, "a", testFolder)
	first.Samples[0].Role = "training"
	if err := SaveRoles(ctx, db, "a", testFolder, first.Samples); err != nil {
		t.Fatal(err)
	}
	twentyGroups(t, db)
	all, err := LoadDataset(ctx, db, "a", testFolder)
	if err != nil {
		t.Fatal(err)
	}
	holdout := 0
	for _, sample := range all.Samples {
		if sample.ID == "first" && sample.Role != "training" {
			t.Fatal("old training leaked into validation")
		}
		if sample.Role == "holdout" {
			holdout++
		}
	}
	if holdout < 3 {
		t.Fatal("new groups did not establish validation set")
	}
}
