package collect

import (
	"encoding/json"
	"html"
	"io"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"beike.local/cloud/src/backend/internal/platform/media"
	xhtml "golang.org/x/net/html"
)

var imageIndexKey = regexp.MustCompile(`^\d+(?::\d+)*$`)

// Only descend through image fields, documented containers and numeric property
// maps. Never walk arbitrary sku/shop/product metadata looking for URLs.
func extractURLs(source any, allowHTML bool) []string {
	result := []string{}
	var walk func(any)
	walk = func(source any) {
		switch value := source.(type) {
		case string:
			text := strings.TrimSpace(value)
			if text == "" {
				return
			}
			if strings.HasPrefix(text, "[") || strings.HasPrefix(text, "{") || strings.HasPrefix(text, `"`) {
				var nested any
				if json.Unmarshal([]byte(text), &nested) == nil {
					walk(nested)
					return
				}
			}
			if strings.Contains(text, "<") || strings.Contains(strings.ToLower(text), "&lt;") {
				if allowHTML {
					result = append(result, htmlProductImages(text)...)
				}
				return
			}
			if strings.HasPrefix(text, "//") || strings.HasPrefix(text, "jfs/") || strings.HasPrefix(strings.ToLower(text), "http://") || strings.HasPrefix(strings.ToLower(text), "https://") {
				result = append(result, text)
			}
		case []string:
			for _, item := range value {
				walk(item)
			}
		case []any:
			for _, item := range value {
				walk(item)
			}
		case map[string]any:
			keys := make([]string, 0, len(value))
			for key := range value {
				keys = append(keys, key)
			}
			sort.Strings(keys)
			for _, key := range keys {
				switch strings.ToLower(key) {
				case "url", "pic", "pic_url", "picurl", "image", "image_url", "imageurl", "img", "img_url", "src", "original", "original_url", "item_img", "item_imgs", "prop_img", "prop_imgs", "props_img", "sku", "skus", "sku_img", "sku_image", "sku_image_url", "desc_img", "desc", "images", "imgs", "list", "items":
					walk(value[key])
				default:
					if imageIndexKey.MatchString(key) {
						walk(value[key])
					}
				}
			}
		}
	}
	walk(source)
	return uniqueStrings(result)
}

func htmlProductImages(source string) []string {
	// Token attributes are entity-decoded by the tokenizer. Decode the entire
	// document only when the tags themselves are escaped, to avoid double-decoding
	// query bytes in ordinary HTML attributes.
	if !strings.Contains(source, "<") {
		source = html.UnescapeString(source)
	}
	result := []string{}
	tokenizer := xhtml.NewTokenizer(strings.NewReader(source))
	for {
		switch tokenizer.Next() {
		case xhtml.ErrorToken:
			if tokenizer.Err() == io.EOF {
				return result
			}
			return result
		case xhtml.StartTagToken, xhtml.SelfClosingTagToken:
			token := tokenizer.Token()
			if token.Data != "img" {
				continue
			}
			attrs := map[string]string{}
			for _, attr := range token.Attr {
				attrs[attr.Key] = attr.Val
			}
			selected := ""
			var chosen media.ProductImage
			for _, key := range []string{"data-original", "data-actualsrc", "data-lazy-src", "data-lazyload", "data-ks-lazyload", "data-src", "data-srcset", "srcset", "src"} {
				value := attrs[key]
				if strings.HasSuffix(key, "srcset") {
					value = bestSrcset(value)
				}
				if image, ok := media.ParseProductImage(value); ok && !image.Small {
					if selected == "" || (image.Key == chosen.Key && image.Quality > chosen.Quality) {
						selected, chosen = value, image
					}
				}
			}
			if selected != "" {
				result = append(result, selected)
			}
		}
	}
}

func bestSrcset(value string) string {
	best, quality := "", -1.0
	for text := strings.TrimSpace(value); text != ""; {
		end := strings.IndexAny(text, " \t\r\n\f")
		if end < 0 {
			if quality < 1 {
				best = strings.TrimRight(text, ",")
			}
			break
		}
		candidate := text[:end]
		text = strings.TrimSpace(text[end:])
		descriptor := ""
		if !strings.HasSuffix(candidate, ",") {
			end = strings.IndexByte(text, ',')
			if end < 0 {
				descriptor, text = text, ""
			} else {
				descriptor, text = text[:end], strings.TrimSpace(text[end+1:])
			}
		}
		candidate = strings.TrimRight(candidate, ",")
		score := 1.0
		if number, err := strconv.ParseFloat(strings.TrimRight(strings.TrimSpace(descriptor), "wx"), 64); err == nil {
			score = number
		}
		if score > quality {
			if image, ok := media.ParseProductImage(candidate); ok && !image.Small {
				best, quality = candidate, score
			}
		}
	}
	return best
}

// Group ownership follows first appearance in main > skus > details, while the
// download URL is selected from the best usable candidate across all groups.
func productImageGroups(main, skus, details []string) ([]string, []string, []string) {
	return media.ProductImageGroups(main, skus, details)
}

func extractProductImages(item map[string]any) ([]string, []string, []string) {
	main := append(extractURLs(item["pic_url"], true), extractURLs(item["item_imgs"], true)...)
	skus := []string{}
	for _, key := range []string{"prop_imgs", "props_img", "skus"} {
		skus = append(skus, extractURLs(item[key], true)...)
	}
	details := append(extractURLs(item["desc_img"], true), extractURLs(item["desc"], true)...)
	return productImageGroups(main, skus, details)
}
