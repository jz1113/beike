package modelgw

import (
	"os"
	"regexp"
	"testing"
)

func TestImageCatalogMatchesSource(t *testing.T) {
	source, err := os.ReadFile("../../../../src/shared/domain/models/model-catalog/approvedImage.ts")
	if err != nil {
		t.Fatal(err)
	}
	found := regexp.MustCompile(`id: '([^']+)'`).FindAllStringSubmatch(string(source), -1)
	if len(found) != len(imageModelIDs) {
		t.Fatalf("source ids %d go ids %d", len(found), len(imageModelIDs))
	}
	for i, match := range found {
		if match[1] != imageModelIDs[i] {
			t.Fatalf("id %d source %s go %s", i, match[1], imageModelIDs[i])
		}
	}
}

func TestImageAliasIsApproved(t *testing.T) {
	if !IsApprovedImage("qwen-image-3") || !IsApprovedImage("vendor/gpt-image-2") || IsApprovedImage("not-a-model") {
		t.Fatal("image approval mismatch")
	}
}

func TestVideoCatalogMatchesSource(t *testing.T) {
	source, err := os.ReadFile("../../../../src/shared/domain/models/model-catalog/approvedVideo.ts")
	if err != nil {
		t.Fatal(err)
	}
	found := regexp.MustCompile(`id: '([^']+)'`).FindAllStringSubmatch(string(source), -1)
	if len(found) != len(videoModelIDs) {
		t.Fatalf("source ids %d go ids %d", len(found), len(videoModelIDs))
	}
	for i, match := range found {
		if match[1] != videoModelIDs[i] {
			t.Fatalf("id %d source %s go %s", i, match[1], videoModelIDs[i])
		}
	}
	if !IsApprovedVideo("doubao-seedance-2.0-mini") || IsApprovedVideo("gpt-image-2") {
		t.Fatal("video approval mismatch")
	}
}
