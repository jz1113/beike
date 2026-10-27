package learning

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
)

func TestTwentySevenGroupsKeepTwentyTwoPendingAfterFiveObservations(t *testing.T) {
	db := learningDB(t)
	ctx := context.Background()
	for i := 0; i < 27; i++ {
		id := fmt.Sprintf("phone-%02d", i)
		insertGroup(t, db, id, id, "a", "phone", "deconstructed")
	}
	dataset, err := LoadDataset(ctx, db, "a", testFolder)
	if err != nil {
		t.Fatal(err)
	}
	if dataset.Total != 27 || len(dataset.Samples) != 27 {
		t.Fatalf("total=%d samples=%d", dataset.Total, len(dataset.Samples))
	}
	for _, sample := range dataset.Samples[:5] {
		if err := SaveObservation(ctx, db, "a", testFolder, "vision", sample, json.RawMessage(`{"compatible":true,"reusableRules":["自然侧光"]}`)); err != nil {
			t.Fatal(err)
		}
	}
	if err := ChangeMemory(ctx, db, "a", testFolder, "remember", "", "prefer", "保留材质纹理", 0); err != nil {
		t.Fatal(err)
	}
	memory, err := ReadMemory(ctx, db, "a", testFolder, dataset)
	if err != nil {
		t.Fatal(err)
	}
	if memory.Learned != 5 || memory.Pending != 22 || len(memory.Entries) != 27 || len(memory.Notes) != 1 {
		t.Fatalf("learned=%d pending=%d entries=%d notes=%d", memory.Learned, memory.Pending, len(memory.Entries), len(memory.Notes))
	}
	// Editing one learned source returns only that group to the read queue.
	dataset.Samples[0].Fingerprint = "updated-source"
	memory, err = ReadMemory(ctx, db, "a", testFolder, dataset)
	if err != nil || memory.Learned != 4 || memory.Pending != 23 || len(memory.Entries) != 27 {
		t.Fatalf("changed source counts: learned=%d pending=%d entries=%d error=%v", memory.Learned, memory.Pending, len(memory.Entries), err)
	}
}
