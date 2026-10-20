package catalog

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestCleanProductImagesSharesQualityOwnershipAndCount(t *testing.T) {
	small := "https://img14.360buyimg.com/n0/s60x60_jfs/t1/a.webp"
	large := "https://img13.360buyimg.com/n0/s2000x2000_jfs/t1/a.webp"
	raw := `{"main":["` + small + `","/uploads/user.png"],"skus":["` + large + `","/uploads/user.png"],"details":["https://img.pddpic.com/native.webp","https://cdn.example.com/a.jpg?w=80"],"price":12}`
	cleaned, count := cleanDetailURLs(raw)
	if count != 3 {
		t.Fatalf("count = %d, cleaned = %v", count, cleaned)
	}
	var groups struct {
		Main, Skus, Details []string
		Price               int
	}
	if err := json.Unmarshal([]byte(cleaned.(string)), &groups); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(groups.Main, []string{large, "/uploads/user.png"}) || len(groups.Skus) != 0 || !reflect.DeepEqual(groups.Details, []string{"https://img.pddpic.com/native.webp"}) || groups.Price != 12 {
		t.Fatalf("unexpected groups: %#v", groups)
	}
	if cover := cleanProductCover(small, cleaned); cover != large {
		t.Fatalf("cover = %s, want %s", cover, large)
	}
	if cover := cleanProductCover("/uploads/user.png", cleaned); cover != "/uploads/user.png" {
		t.Fatalf("user cover changed: %s", cover)
	}
}

func TestCleanProductImagesPreservesLocalMaterials(t *testing.T) {
	raw := `{"main":["data:image/png;base64,YQ==","blob:https://example.com/user","/uploads/native.webp"],"skus":[],"details":["/uploads/native.webp"]}`
	cleaned, count := cleanDetailURLs(raw)
	if count != 3 {
		t.Fatalf("count = %d, cleaned = %v", count, cleaned)
	}
	again, againCount := cleanDetailURLs(cleaned)
	if again != cleaned || againCount != count {
		t.Fatalf("not idempotent: %v / %v", cleaned, again)
	}
}
