package workshop

import (
	"encoding/json"
	"testing"
)

func TestDuplicatePendingCollectionKeepsInput(t *testing.T) {
	input := "https://item.jd.com/123456789.html"
	var snapshot map[string]any
	if err := json.Unmarshal([]byte(duplicateSnapshot(`{"items":[],"batchInputText":"`+input+`"}`)), &snapshot); err != nil {
		t.Fatal(err)
	}
	if snapshot["batchInputText"] != input {
		t.Fatalf("pending collection input lost: %#v", snapshot)
	}
}
