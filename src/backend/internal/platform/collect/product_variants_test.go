package collect

import (
	"context"
	"encoding/json"
	"net/http"
	"reflect"
	"testing"

	"beike.local/cloud/src/backend/internal/platform/database/catalog"
)

func variantResult(t *testing.T, result Result) *catalog.ProductVariantMetadata {
	t.Helper()
	var body struct {
		Product struct {
			VariantMetadata *catalog.ProductVariantMetadata `json:"variantMetadata"`
		} `json:"product"`
	}
	if err := json.Unmarshal([]byte(mustJSON(t, result.Body)), &body); err != nil {
		t.Fatal(err)
	}
	return body.Product.VariantMetadata
}

func TestCollectVariantMappingFreshCacheAndGenericSaves(t *testing.T) {
	db := openCollectDB(t)
	small := "https://img13.360buyimg.com/n5/jfs/t1/shared.webp"
	large := "https://img14.360buyimg.com/n0/s2000x2000_jfs/t1/shared.webp"
	item := map[string]any{
		"title": "实物规格", "pic_url": small,
		"props_list": map[string]any{"1627207:1": "颜色:黑色", "1627207:2": "颜色:灰色"},
		"props_img":  map[string]any{"1627207:1": small, "1627207:2": small, "1627207:3": "//img.alicdn.com/unknown.webp"},
		"prop_imgs":  map[string]any{"prop_img": []any{map[string]any{"properties": "1627207:1", "url": large}}},
		"skus": map[string]any{"sku": []any{
			map[string]any{"sku_id": "1234567", "properties": "1627207:1;20509:10", "properties_name": "1627207:1:颜色:黑色;20509:10:尺码:M"},
			map[string]any{"sku_id": "1234568", "properties": "1627207:1;20509:11"},
			map[string]any{"sku_id": "1234569", "properties": "1627207:2"},
		}},
		"desc_img": []any{"//img.alicdn.com/detail.webp"},
	}
	calls := 0
	client := routeCollectServer(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		_ = json.NewEncoder(w).Encode(map[string]any{"item": item})
	})
	fresh := Product(context.Background(), db, "local", map[string]any{"url": "1234567"}, "fake-key", "fake-secret", client)
	cached := Product(context.Background(), db, "local", map[string]any{"url": "1234567"}, "", "", client)
	actual := variantResult(t, fresh)
	if fresh.Status != 200 || cached.Status != 200 || calls != 1 || actual == nil || !reflect.DeepEqual(actual, variantResult(t, cached)) {
		t.Fatalf("fresh/cache diverged: %#v %#v calls=%d", fresh, cached, calls)
	}
	if len(actual.Variants) != 3 || actual.SelectedVariantID != "1627207:1" || actual.RequestedSKUID != "1234567" {
		t.Fatalf("metadata %#v", actual)
	}
	if !reflect.DeepEqual(actual.Variants[0].SKUIDs, []string{"1234567", "1234568"}) || !reflect.DeepEqual(actual.Variants[0].ImageURLs, []string{large}) || !reflect.DeepEqual(actual.Variants[1].ImageURLs, []string{large}) {
		t.Fatalf("SKU/shared image mapping %#v", actual.Variants)
	}
	if actual.Variants[2].Label != "未知" || actual.Variants[2].Color != "" || len(actual.Variants[2].SKUIDs) != 0 {
		t.Fatalf("invented unknown metadata %#v", actual.Variants[2])
	}
	// Saving a flattened list must retain both classification and metadata.
	images := resultImages(t, fresh)
	flat := append(append(append([]string{}, images.Main...), images.Skus...), images.Details...)
	saved, err := catalog.SaveCollectedProduct(context.Background(), db, "local", "jd", "1234567", "改标题", large, flat)
	if err != nil {
		t.Fatal(err)
	}
	update := `{"main":["` + large + `"]}`
	if _, err = catalog.UpdateProduct(context.Background(), db, "local", saved["id"].(string), nil, nil, nil, &update); err != nil {
		t.Fatal(err)
	}
	after := Product(context.Background(), db, "local", map[string]any{"url": "1234567"}, "", "", client)
	if !reflect.DeepEqual(variantResult(t, after), actual) || !reflect.DeepEqual(resultImages(t, after), images) || calls != 1 {
		t.Fatalf("save/update lost collected data: %#v", after)
	}
}

func TestVariantsDoNotGuessSelectionColorOrImageAssociation(t *testing.T) {
	item := map[string]any{
		"skuId": "1234567", "sku_id": "1234567", "pic_url": "//img.alicdn.com/main.webp",
		"props_img": map[string]any{"1:2": "//img.alicdn.com/a.webp"},
	}
	main, skus, details := extractProductImages(item)
	images := append(append(main, skus...), details...)
	metadata := extractProductVariants(item, productInput{platform: "jd", itemID: "1234567"}, images)
	if metadata.SelectedVariantID != "" || len(metadata.Variants) != 1 || metadata.Variants[0].Color != "" || len(metadata.Variants[0].SKUIDs) != 0 {
		t.Fatalf("guessed metadata %#v", metadata)
	}
	if !reflect.DeepEqual(metadata.Variants[0].ImageURLs, []string{"https://img.alicdn.com/a.webp"}) {
		t.Fatalf("main image guessed as SKU %#v", metadata)
	}
	metadata = extractProductVariants(map[string]any{"pic_url": "//img.alicdn.com/main.webp"}, productInput{platform: "taobao", itemID: "1234567"}, images)
	if len(metadata.Variants) != 0 || metadata.RequestedSKUID != "" || metadata.SelectedVariantID != "" {
		t.Fatalf("fabricated metadata %#v", metadata)
	}
}

func TestVariantExplicitSelectionAndChangedRequestedSKU(t *testing.T) {
	item := map[string]any{"props_img": `{"1:1":"//img.alicdn.com/a.webp","1:2":"//img.alicdn.com/b.webp"}`, "selected_sku_id": "1234568", "skus": map[string]any{"sku": []any{
		map[string]any{"sku_id": "1234567", "properties": "1:1"}, map[string]any{"sku_id": "1234568", "properties": "1:2"},
	}}}
	_, skus, _ := extractProductImages(item)
	metadata := extractProductVariants(item, productInput{platform: "taobao", itemID: "9999999"}, skus)
	if metadata.SelectedVariantID != "1:2" || metadata.RequestedSKUID != "" {
		t.Fatalf("explicit selection missing %#v", metadata)
	}
	changed := selectRequestedVariant(metadata, productInput{platform: "taobao", itemID: "9999999", requestedSKUID: "1234567"})
	if changed.SelectedVariantID != "1:1" || changed.RequestedSKUID != "1234567" || metadata.SelectedVariantID != "1:2" {
		t.Fatalf("cached selection stale %#v", changed)
	}
	parsed, message := resolveProductInput(map[string]any{"url": "https://item.taobao.com/item.htm?id=9999999&skuId=1234567"})
	if message != "" || parsed.requestedSKUID != "1234567" {
		t.Fatalf("request sku not retained %#v %s", parsed, message)
	}
}
