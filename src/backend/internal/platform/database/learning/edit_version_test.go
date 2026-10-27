package learning

import (
	"context"
	"errors"
	"strings"
	"testing"
)

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
