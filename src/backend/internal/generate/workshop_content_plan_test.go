package generate

import (
	"beike.local/cloud/src/backend/internal/config"
	"encoding/json"
	"strings"
	"testing"
)

func TestWorkshopContentPlanReachesVisionAlongsideProductOnlyImages(t *testing.T) {
	payload := map[string]json.RawMessage{}
	for key, value := range map[string]any{
		"imageUrls":   []string{"https://example.com/current-product.jpg"},
		"contentPlan": map[string]any{"current": map[string]any{"index": 3, "total": 5, "theme": "日常使用情境"}, "siblings": []any{map[string]any{"completedShots": []any{map[string]any{"scene": "此前窗边木桌"}}}}},
	} {
		payload[key], _ = json.Marshal(value)
	}
	parts := workshopAnalyzeContent(config.Config{}, payload, nil, 4)
	text := parts[0].(map[string]any)["text"].(string)
	for _, expected := range []string{"日常使用情境", "此前窗边木桌", "数量不代表镜数", "至少两个实质维度", "严格输出 4 镜", "先读商品图"} {
		if !strings.Contains(text, expected) {
			t.Fatalf("missing %s", expected)
		}
	}
	if len(parts) != 3 {
		t.Fatalf("unexpected reference inputs: %d", len(parts))
	}
}
