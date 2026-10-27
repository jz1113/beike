package learning

import (
	"context"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/platform/database"
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
)

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
