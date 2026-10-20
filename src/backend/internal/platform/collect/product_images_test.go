package collect

import (
	"fmt"
	"reflect"
	"testing"
)

func TestExtractProductImagesAllFieldsAndStableOrder(t *testing.T) {
	item := map[string]any{
		"pic_url":   `"//img.alicdn.com/cover.jpg"`,
		"item_imgs": map[string]any{"item_img": []any{"https://img.alicdn.com/main2.jpg", map[string]any{"url": "jfs/t1/main3.webp"}}},
		"prop_imgs": map[string]any{"prop_img": []any{map[string]any{"url": "//img.alicdn.com/sku1.jpg", "sku_url": "https://item.jd.com/1234567.html", "shop_logo": "https://img.alicdn.com/shop.jpg"}}},
		"props_img": `{"123:456":"//img.alicdn.com/sku2.jpg","123:789":["//img.alicdn.com/sku3.jpg"]}`,
		"skus":      map[string]any{"sku": []any{map[string]any{"image": []any{`["//img.alicdn.com/sku4.jpg"]`}, "detail_url": "https://item.jd.com/7654321.html", "shop": map[string]any{"url": "//img.alicdn.com/shop2.jpg"}}}},
		"desc_img":  []any{"//img.alicdn.com/detail1.jpg", `[["//img.alicdn.com/detail2.jpg"]]`},
		"desc":      `<DIV><IMG SRC=//img.alicdn.com/detail3.jpg><img data-original="//img.alicdn.com/detail4.jpg" src="//img.alicdn.com/placeholder.jpg"></DIV>`,
		"shop_logo": "//img.alicdn.com/shop3.jpg", "url": "https://item.jd.com/1234567.html",
	}
	main, skus, details := extractProductImages(item)
	if !reflect.DeepEqual(main, []string{"https://img.alicdn.com/cover.jpg", "https://img.alicdn.com/main2.jpg", "https://img10.360buyimg.com/pcpubliccms/s1440x1440_jfs/t1/main3.webp"}) ||
		!reflect.DeepEqual(skus, []string{"https://img.alicdn.com/sku1.jpg", "https://img.alicdn.com/sku2.jpg", "https://img.alicdn.com/sku3.jpg", "https://img.alicdn.com/sku4.jpg"}) ||
		!reflect.DeepEqual(details, []string{"https://img.alicdn.com/detail1.jpg", "https://img.alicdn.com/detail2.jpg", "https://img.alicdn.com/detail3.jpg", "https://img.alicdn.com/detail4.jpg"}) {
		t.Fatalf("groups main=%#v skus=%#v details=%#v", main, skus, details)
	}
	for i := 0; i < 20; i++ {
		m, s, d := extractProductImages(item)
		if !reflect.DeepEqual(m, main) || !reflect.DeepEqual(s, skus) || !reflect.DeepEqual(d, details) {
			t.Fatal("unstable extraction order")
		}
	}
}

func TestExtractProductHTMLTokenizerAndSourcePriority(t *testing.T) {
	cases := []struct{ source, want string }{
		{`<IMG SRC=//img.alicdn.com/a.jpg DATA-ORIGINAL="//img.alicdn.com/original.webp">`, "https://img.alicdn.com/original.webp"},
		{`&lt;IMG DATA-SRC=&quot;//img.alicdn.com/entity.jpg?sign=A%2fb&amp;amp;b=+&quot;&gt;`, "https://img.alicdn.com/entity.jpg?sign=A%2fb&b=+"},
		{`<img src="//img.alicdn.com/a.jpg" data-srcset="//img.alicdn.com/small.jpg 400w, //img.alicdn.com/large.webp 1600w">`, "https://img.alicdn.com/large.webp"},
		{`<img data-lazyload=//img.alicdn.com/lazy.jpg src=//img.alicdn.com/a.jpg>`, "https://img.alicdn.com/lazy.jpg"},
		{`<img srcset="//img.alicdn.com/a.jpg 1x,//img.alicdn.com/b.webp 2x" src="//img.alicdn.com/fallback.jpg">`, "https://img.alicdn.com/b.webp"},
		{`<img data-original="data:image/gif;base64,placeholder" data-src="//img.alicdn.com/valid.jpg">`, "https://img.alicdn.com/valid.jpg"},
		{`<img src="https://img.alicdn.com/a.jpg?sign=x%2Fy&amp;part=+&amp;part=%20">`, "https://img.alicdn.com/a.jpg?sign=x%2Fy&part=+&part=%20"},
		{`<img src=jfs/t1/raw.webp>`, "https://img10.360buyimg.com/pcpubliccms/s1440x1440_jfs/t1/raw.webp"},
		{`<img data-original="https://img12.360buyimg.com/n0/s600x600_jfs/t1/a.webp?sign=small" srcset="https://img13.360buyimg.com/n0/s1600x1600_jfs/t1/a.webp?sign=large 1600w" src="//img.alicdn.com/placeholder.jpg">`, "https://img13.360buyimg.com/n0/s1600x1600_jfs/t1/a.webp?sign=large"},
	}
	for _, item := range cases {
		main, _, _ := productImageGroups(extractURLs(item.source, true), nil, nil)
		if !reflect.DeepEqual(main, []string{item.want}) {
			t.Fatalf("source %s got %#v want %s", item.source, main, item.want)
		}
	}
}

func TestExtractProductHasNoTwentyFourImageCap(t *testing.T) {
	values := []any{}
	for i := 0; i < 75; i++ {
		values = append(values, fmt.Sprintf("https://img.alicdn.com/image-%03d.jpg", i))
	}
	main, skus, details := extractProductImages(map[string]any{"item_imgs": values, "desc_img": values})
	if len(main) != 75 || len(skus) != 0 || len(details) != 0 || main[74] != "https://img.alicdn.com/image-074.jpg" {
		t.Fatalf("lost images: main=%d sku=%d details=%d", len(main), len(skus), len(details))
	}
}

func TestProductImageGroupsCrossGroupBestResolutionAndSignedBytes(t *testing.T) {
	small := "https://img13.360buyimg.com/n5/s50x50_jfs/t1/a.webp?sign=small%2fb"
	high := "https://img12.360buyimg.com/n0/s1200x1200_jfs/t1/a.webp?sign=large%2fb&part=+&part=%20"
	main, skus, details := productImageGroups(
		[]string{small, "https://img.alicdn.com/main.jpg_50x50.jpg", "https://cdn.example.com/80x80/unrecoverable.jpg"},
		[]string{high, "https://img.alicdn.com/sku.jpg_50x50.jpg?sign=small", "https://img.alicdn.com/main.jpg"},
		[]string{"https://img.alicdn.com/sku.jpg?sign=large", "https://img.alicdn.com/detail.jpg", "https://img.alicdn.com/main.jpg_800x800.jpg"},
	)
	if !reflect.DeepEqual(main, []string{high, "https://img.alicdn.com/main.jpg"}) || !reflect.DeepEqual(skus, []string{"https://img.alicdn.com/sku.jpg?sign=large"}) || !reflect.DeepEqual(details, []string{"https://img.alicdn.com/detail.jpg"}) {
		t.Fatalf("main=%#v skus=%#v details=%#v", main, skus, details)
	}
	main, skus, details = productImageGroups([]string{small}, nil, nil)
	if len(main)+len(skus)+len(details) != 0 {
		t.Fatalf("signed small was fabricated: %#v", main)
	}
}
