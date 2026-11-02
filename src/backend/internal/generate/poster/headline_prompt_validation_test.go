package poster

import (
	"strings"
	"testing"
)

func TestCoverDesignRejectsReferenceDependencyAndChangedTitle(t *testing.T) {
	makePlan := func() map[string]any {
		raw := map[string]any{}
		for _, key := range []string{"composition", "material", "palette", "typographySystem", "typography", "visualAnchor", "styleFamily", "layout", "typeface", "textColor", "background", "subject", "harmony", "variation"} {
			raw[key] = "具体设计"
		}
		raw["imagePrompt"] = strings.Repeat("主体置于画面右侧，保留原图标识，左侧排版标题。", 12)
		raw["titleLines"] = []any{"轻巧随身", "记录生活"}
		return raw
	}
	for _, dependency := range []string{"参考图2", "参考图 2", "沿用参考图排版", "同款风格", "上一张"} {
		raw := makePlan()
		raw["imagePrompt"] = raw["imagePrompt"].(string) + dependency
		if _, message := validateCoverDesign(raw, "轻巧随身记录生活", ""); message == "" {
			t.Fatalf("accepted dependent prompt: %s", dependency)
		}
	}
	raw := makePlan()
	raw["titleLines"] = []any{"虚构效果", "记录生活"}
	if _, message := validateCoverDesign(raw, "轻巧随身记录生活", ""); message == "" {
		t.Fatal("accepted changed title")
	}
	valid, message := validateCoverDesign(makePlan(), "轻巧随身记录生活", "")
	if message != "" || !strings.Contains(valid["imagePrompt"].(string), "第 2 行「记录生活」") {
		t.Fatalf("valid design: %v %s", valid, message)
	}
}

func TestCoverSupplementaryRequirementsValidation(t *testing.T) {
	for _, raw := range []string{`{"imageUrls":["a"],"supplementaryRequirements":3}`, `{"imageUrls":["a"],"supplementaryRequirements":"` + strings.Repeat("字", 2001) + `"}`} {
		if message := headlineDesignSchemaError([]byte(raw)); !strings.Contains(message, "supplementaryRequirements") {
			t.Fatal(message)
		}
	}
	if message := headlineDesignSchemaError([]byte(`{"imageUrls":["a"],"supplementaryRequirements":"暖白配色"}`)); message != "" {
		t.Fatal(message)
	}
}
