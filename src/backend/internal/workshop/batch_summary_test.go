package workshop

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	dbworkshop "beike.local/cloud/src/backend/internal/platform/database/workshop"
)

func TestBatchSummaryExcludesObsoleteAndEphemeralResults(t *testing.T) {
	summary := summarizeBatch(dbworkshop.WorkshopBatchRow{ID: "history", Snapshot: `{"items":[{"title":" 包 ","itemId":"123456789","status":"success","selected":true,"coverImage":"/product.jpg","tasks":[{"status":"SUCCESS","resultUrl":"/new.jpg"},{"status":"SUCCESS","resultUrl":"/old.jpg","resultStatus":"superseded"},{"status":"SUCCESS","resultUrl":"blob:expired"},{"status":"FAILURE"},{"status":"PENDING"}]},{"title":"衬衫","itemId":"987654321","coverImage":"/shirt.jpg","tasks":[]}]}`})
	for key, want := range map[string]int{"itemCount": 2, "readyCount": 1, "taskCount": 4, "resultCount": 1, "failedCount": 1} {
		if got := summary[key]; got != want {
			t.Errorf("%s = %v, want %d", key, got, want)
		}
	}
	if !reflect.DeepEqual(summary["productTitles"], []string{"包", "衬衫"}) {
		t.Fatalf("titles: %v", summary["productTitles"])
	}
	if !reflect.DeepEqual(summary["productIds"], []string{"123456789", "987654321"}) {
		t.Fatalf("ids: %v", summary["productIds"])
	}
	if !reflect.DeepEqual(summary["previewImages"], []string{"/new.jpg", "/shirt.jpg"}) {
		t.Fatalf("previews: %v", summary["previewImages"])
	}
}

func TestBatchSummaryCapsPreviewsAndNeverIncludesEmbeddedImagesOrPrompts(t *testing.T) {
	items := []map[string]any{}
	for i := 0; i < 8; i++ {
		items = append(items, map[string]any{"title": "商品", "selectedProductImages": []string{"data:" + strings.Repeat("x", 1000), "blob:expired", "/thumb.jpg"}, "prompts": []string{"private prompt"}})
	}
	raw, err := json.Marshal(map[string]any{"items": items})
	if err != nil {
		t.Fatal(err)
	}
	summary := summarizeBatch(dbworkshop.WorkshopBatchRow{Snapshot: string(raw)})
	if got := len(summary["previewImages"].([]string)); got != 4 {
		t.Fatalf("preview count: %d", got)
	}
	encoded, _ := json.Marshal(summary)
	if strings.Contains(string(encoded), "data:") || strings.Contains(string(encoded), "private prompt") {
		t.Fatal("summary leaked full image data or prompts")
	}
	if summary["itemCount"] != 8 {
		t.Fatal("preview cap must not truncate items")
	}
}

func TestBatchSummaryHandlesHistoricalEmptySnapshot(t *testing.T) {
	summary := summarizeBatch(dbworkshop.WorkshopBatchRow{Snapshot: `{"items":[]}`})
	if summary["itemCount"] != 0 || summary["resultCount"] != 0 {
		t.Fatalf("summary: %v", summary)
	}
	if summary["previewImages"] == nil || summary["productTitles"] == nil {
		t.Fatal("empty lists should be JSON arrays")
	}
}

func TestBatchSummaryKeepsUncollectedInputDistinctFromEmptyDraft(t *testing.T) {
	summary := summarizeBatch(dbworkshop.WorkshopBatchRow{Snapshot: `{"items":[],"batchInputText":" 123456789 "}`})
	if summary["hasInput"] != true || summary["itemCount"] != 0 {
		t.Fatalf("summary: %v", summary)
	}
}
