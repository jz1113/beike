package catalog

import "testing"

func TestParseCategoryApply(t *testing.T) {
	if _, ok := parseCategoryApply([]byte(`{`)); ok {
		t.Fatal("坏 JSON 应拒绝")
	}
	if _, ok := parseCategoryApply([]byte(`{"items":[]}`)); ok {
		t.Fatal("空清单应拒绝")
	}
	items, ok := parseCategoryApply([]byte(`{"items":[{"id":"neck","parentId":"custom","label":"项链"}]}`))
	if !ok || len(items) != 1 || items[0].ParentID != "custom" || len(items[0].Keywords) != 0 {
		t.Fatalf("items %#v ok %v", items, ok)
	}
}
