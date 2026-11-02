package sales

import "testing"

func TestSummaryCopyReferencesExistingBuyingPoints(t *testing.T) {
	input := exampleSummaryRequest().summaryInput
	for _, test := range []struct {
		name    string
		indexes []int
		valid   bool
	}{
		{"one focus", []int{1}, true},
		{"selected priorities", []int{3, 1}, true},
		{"three priorities", []int{1, 2, 3}, true},
		{"missing", nil, false},
		{"zero based", []int{0}, false},
		{"negative", []int{-1}, false},
		{"invented", []int{4}, false},
		{"duplicate", []int{1, 1}, false},
		{"too many", []int{1, 2, 3, 1}, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			result := exampleSummaryResult()
			result.Points = append(result.Points, result.Points[0], result.Points[0])
			result.CopyPointIndexes = test.indexes
			parsed, err := parseSummaryCompletion(summaryCompletion(result), input)
			if (err == nil) != test.valid {
				t.Fatalf("valid=%v error=%v", test.valid, err)
			}
			if err == nil && len(parsed.CopyPointIndexes) != len(test.indexes) {
				t.Fatal("selected buying points lost")
			}
		})
	}
}

func TestSummaryWithoutBuyingPointsRequestsEvidenceInsteadOfGenericCopy(t *testing.T) {
	input := exampleSummaryRequest().summaryInput
	result := summaryResult{Summary: "图片不足以辨认商品", Questions: []string{"请补充商品清晰正面图"}}
	parsed, err := parseSummaryCompletion(summaryCompletion(result), input)
	if err != nil || parsed.CopyPointIndexes == nil || len(parsed.CopyPointIndexes) != 0 {
		t.Fatalf("clarification rejected: %+v %v", parsed, err)
	}
	result.Copy = "这款商品兼顾品质与实用，满足日常所需。"
	if _, err := parseSummaryCompletion(summaryCompletion(result), input); err == nil {
		t.Fatal("accepted generic copy without supported buying points")
	}
}
