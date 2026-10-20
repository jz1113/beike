package media

import (
	"reflect"
	"testing"
)

func TestGeneralNormalizerKeepsNativeFormatsAcrossProductHosts(t *testing.T) {
	for _, source := range []string{
		"https://img10.360buyimg.com/pcpubliccms/s1440x1440_jfs/t1/native.webp",
		"https://img10.360buyimg.com/pcpubliccms/s1440x1440_jfs/t1/native.dpg",
		"https://img.alicdn.com/native.webp",
		"https://img.alicdn.com/native.avif",
		"https://img.taobaocdn.com/native.webp",
		"https://img.pddpic.com/native.webp",
		"https://img.yangkeduo.com/native.webp",
		"https://cdn.example.com/native.webp",
		"https://img14.360buyimg.com/n0/s2000x2000_jfs/t1/native.webp",
		"https://img14.360buyimg.com/n0/jfs/t1/native.webp?sign=A%2fb+%20&z=2&z=1",
		"https://img14.360buyimg.com/n0/jfs/t1/native.webp?",
		"https://img14.360buyimg.com/n0/jfs/t1/native.webp#",
	} {
		if actual := NormalizeImageURLToStandardJpg(source); actual != source {
			t.Fatalf("native/protected URL changed: %s => %s", source, actual)
		}
	}
}

func TestGeneralNormalizerOnlyRemovesKnownDerivativeWrappers(t *testing.T) {
	for _, item := range []struct{ source, want string }{
		{"https://img14.360buyimg.com/n0/jfs/t1/a.jpg.dpg.webp", "https://img10.360buyimg.com/pcpubliccms/s1440x1440_jfs/t1/a.jpg"},
		{"https://img14.360buyimg.com/n0/jfs/t1/a.png.webp", "https://img10.360buyimg.com/pcpubliccms/s1440x1440_jfs/t1/a.png"},
		{"https://img.alicdn.com/a.webp_400x400.jpg_.webp", "https://img.alicdn.com/a.webp"},
		{"https://img.alicdn.com/a.png.webp", "https://img.alicdn.com/a.png"},
		{"https://img.pddpic.com/a.jpeg.webp", "https://img.pddpic.com/a.jpeg"},
		{"https://img.yangkeduo.com/a.png.webp", "https://img.yangkeduo.com/a.png"},
	} {
		if actual := NormalizeImageURLToStandardJpg(item.source); actual != item.want {
			t.Fatalf("wrapper URL %s => %s, want %s", item.source, actual, item.want)
		}
	}
}

func TestProductImageGroupsExportedPreservesHighResolutionAndOwnership(t *testing.T) {
	high := "https://img14.360buyimg.com/n0/s2000x2000_jfs/t1/a.webp"
	mainSource := []string{"https://img10.360buyimg.com/pcpubliccms/s1440x1440_jfs/t1/a.webp"}
	skuSource := []string{high, "https://img.alicdn.com/sku.webp"}
	detailSource := []string{"https://img.alicdn.com/sku.webp", "https://img.alicdn.com/detail.webp"}
	main, skus, details := ProductImageGroups(mainSource, skuSource, detailSource)
	if !reflect.DeepEqual(main, []string{high}) || !reflect.DeepEqual(skus, []string{"https://img.alicdn.com/sku.webp"}) || !reflect.DeepEqual(details, []string{"https://img.alicdn.com/detail.webp"}) {
		t.Fatalf("groups main=%#v skus=%#v details=%#v", main, skus, details)
	}
	if mainSource[0] == high {
		t.Fatal("input mutated")
	}
	// Catalog/list's existing generic normalization cannot undo this result.
	if got := NormalizeImageURLToStandardJpg(main[0]); got != high {
		t.Fatalf("generic normalization degraded selected high-resolution URL: %s", got)
	}
}

func TestProductImageGroupsExportedKeepsSKUOnlyAndSignedBestURL(t *testing.T) {
	small := "https://img14.360buyimg.com/n5/jfs/t1/a.webp?sign=small%2fb"
	high := "https://img12.360buyimg.com/n0/s2000x2000_jfs/t1/a.webp?sign=large%2fb&part=+&part=%20"
	main, skus, details := ProductImageGroups(nil, []string{small}, []string{high})
	if len(main) != 0 || len(details) != 0 || !reflect.DeepEqual(skus, []string{high}) {
		t.Fatalf("signed/SKU-only groups main=%#v skus=%#v details=%#v", main, skus, details)
	}
}
