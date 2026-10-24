package learning

import (
	"context"
	"testing"
)

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
