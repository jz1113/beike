package system

import "testing"

func TestParseDefaultGroupPrices(t *testing.T) {
	prices := parseDefaultGroupPrices(map[string]any{
		"group_ratio": map[string]any{"default": 1.0},
		"data": []any{
			map[string]any{
				"model_name": "GPT-4o", "quota_type": float64(0), "model_ratio": 2.0, "completion_ratio": 3.0,
				"enable_groups": []any{"default"},
			},
			map[string]any{
				"model_name": "skip", "quota_type": float64(1), "model_ratio": 1.0, "completion_ratio": 1.0,
				"enable_groups": []any{"default"},
			},
		},
	})
	got := prices["gpt-4o"]
	if got.PromptPer1k != 0.004 || got.CompletionPer1k != 0.012 {
		t.Fatalf("prices %#v", prices)
	}
	if _, ok := prices["skip"]; ok {
		t.Fatal("非默认计费类型不应进入报价")
	}
}
