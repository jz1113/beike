package catalog

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestMergeProductDetailPreservesOwnershipMetadataAndBestURL(t *testing.T) {
	small := "https://img13.360buyimg.com/n5/jfs/t1/a.webp"
	large := "https://img14.360buyimg.com/n0/s2000x2000_jfs/t1/a.webp"
	old := `{"main":[],"skus":["` + small + `"],"details":["https://img.alicdn.com/detail.webp"],"category":"鞋包","props":{"材质":"皮革"},"variantMetadata":{"version":1,"variants":[{"id":"1:2","label":"未知","skuIds":[],"imageUrls":["` + small + `"]}]}}`
	incoming := `{"main":["` + large + `","https://img.alicdn.com/detail.webp","https://img.alicdn.com/new.webp"],"skus":[],"details":[],"variantMetadata":null}`
	merged := mergeProductDetail(old, incoming)
	var parsed map[string]any
	if err := json.Unmarshal([]byte(merged), &parsed); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(parsed["main"], []any{"https://img.alicdn.com/new.webp"}) || !reflect.DeepEqual(parsed["skus"], []any{large}) || !reflect.DeepEqual(parsed["details"], []any{"https://img.alicdn.com/detail.webp"}) || parsed["category"] != "鞋包" || parsed["props"] == nil {
		t.Fatalf("detail overwritten %s", merged)
	}
	metadata := ReadProductVariantMetadata(parsed["variantMetadata"])
	if metadata == nil || !reflect.DeepEqual(metadata.Variants[0].ImageURLs, []string{large}) {
		t.Fatalf("metadata URL stale %s", merged)
	}
	for _, invalid := range []string{"", "bad", "null", `{"variantMetadata":{"version":99}}`} {
		if !json.Valid([]byte(mergeProductDetail(merged, invalid))) {
			t.Fatalf("malformed update destroyed detail: %q", invalid)
		}
		var again map[string]any
		_ = json.Unmarshal([]byte(mergeProductDetail(merged, invalid)), &again)
		if ReadProductVariantMetadata(again["variantMetadata"]) == nil {
			t.Fatalf("malformed update removed variants: %q", invalid)
		}
	}
}

func TestMergeProductDetailKeepsLegacyList(t *testing.T) {
	merged := mergeProductDetail(`["https://img.alicdn.com/old.webp"]`, `{"main":["https://img.alicdn.com/new.webp"]}`)
	var parsed struct{ Main []string }
	if err := json.Unmarshal([]byte(merged), &parsed); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(parsed.Main, []string{"https://img.alicdn.com/old.webp", "https://img.alicdn.com/new.webp"}) {
		t.Fatalf("lost legacy images %s", merged)
	}
}
