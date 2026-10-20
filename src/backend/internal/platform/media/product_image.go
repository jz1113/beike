package media

import (
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

// ProductImage retains the original bytes of query-bearing URLs. Key is only
// used for comparison; it must never be used as a replacement download URL.
type ProductImage struct {
	URL, Key string
	Quality  int
	Small    bool
}

var (
	productTracker   = regexp.MustCompile(`(?i)(?:i\.php|(?:space|spacer|1x1|blank)\.(?:gif|png)|taesite|tongji|picon/|imagetools/|service_ico|devfe/|error-new|jisushenhe|spiderfont)`)
	productSize      = regexp.MustCompile(`(?i)(?:^|[/_!.-])s?(\d{1,5})x(\d{1,5})(?:[a-z]{1,3})?(?:q\d{1,3})?(?:[_.!/-]|$)`)
	aliProductTail   = regexp.MustCompile(`(?i)_(?:\d{1,5}x\d{1,5}(?:[a-z]{1,3})?(?:q\d{1,3})?(?:\.(?:jpe?g|png|webp))?|q\d+\.jpg|sum\.jpg|[bms]\.jpg|\.webp)$`)
	aliProductSize   = regexp.MustCompile(`(?i)\.(?:\d+x\d+|search|summ)\.jpg$`)
	jdProductSuffix  = regexp.MustCompile(`(?i)![a-z0-9_.-]+$`)
	jdProductLevel   = regexp.MustCompile(`(?i)^/(n\d+)/`)
	productQuerySize = regexp.MustCompile(`(?i)(?:^|[/,])([wh])[_/](\d{1,5})`)
	jdProductDpg     = regexp.MustCompile(`(?i)(\.(?:jpe?g|png|webp))\.dpg(?:\.webp)?$`)
	jdProductSizes   = map[string]int{"n0": 800, "n1": 350, "n2": 40, "n3": 130, "n4": 50, "n5": 50, "n6": 50, "n7": 350, "n9": 40, "n11": 350, "n12": 800}
)

// ParseProductImage only restores documented JD jfs and Ali image derivatives.
// Unknown CDNs, every query/fragment-bearing URL, and JD images with a known
// maximum edge above 1440 retain their source URL rather than being downsized.
func ParseProductImage(value string) (ProductImage, bool) {
	source := strings.TrimSpace(value)
	if strings.HasPrefix(source, "jfs/") {
		source = "https://img10.360buyimg.com/pcpubliccms/s1440x1440_" + source
	}
	source = normalizeRemoteMediaURL(source)
	parsed, err := url.Parse(source)
	if source == "" || err != nil || otherMedia.MatchString(parsed.Path) || productTracker.MatchString(parsed.Path) {
		return ProductImage{}, false
	}
	host := strings.ToLower(parsed.Hostname())
	if hostMatches(host, []string{"o0b.cn", "item.jd.com", "item.taobao.com", "detail.tmall.com"}) || !(imageExtension.MatchString(parsed.Path) || hostMatches(host, imageHosts) || cosHost.MatchString(host) || imageProcess.MatchString(parsed.RawQuery)) {
		return ProductImage{}, false
	}
	image := ProductImage{URL: source, Key: source, Quality: 10000}
	path := parsed.EscapedPath()
	width, height := productDimensions(parsed)
	if width > 0 || height > 0 {
		image.Quality = max(width, height)
		image.Small = (width > 0 && width < 200) || (height > 0 && height < 200)
	}
	protected := strings.ContainsAny(source, "?#")
	if hostMatches(host, []string{"360buyimg.com"}) {
		if resource := jdProductResource(path); resource != "" {
			image.Key = "jd:" + resource
			if !protected && max(width, height) <= 1440 {
				image.URL = "https://img10.360buyimg.com/pcpubliccms/s1440x1440_" + resource
				image.Quality, image.Small = 1440, false
			}
		}
	} else if hostMatches(host, []string{"alicdn.com", "taobaocdn.com", "tbcdn.cn"}) {
		original := aliProductOriginal(path)
		image.Key = "ali:" + strings.ToLower(parsed.Host) + original
		if !protected && original != path {
			image.URL = parsed.Scheme + "://" + parsed.Host + original
			image.Quality, image.Small = 10000, false
		}
	}
	return image, true
}

func jdProductResource(path string) string {
	index := strings.Index(strings.ToLower(path), "jfs/")
	if index < 0 || (index > 0 && path[index-1] != '/' && path[index-1] != '_') {
		return ""
	}
	resource := path[index:]
	resource = jdProductSuffix.ReplaceAllString(resource, "")
	// Remove only explicit derivative wrappers, never a native .webp/.dpg.
	resource = jpgWebp.ReplaceAllString(resource, ".$1")
	resource = jdProductDpg.ReplaceAllString(resource, "$1")
	return resource
}

func aliProductOriginal(path string) string {
	original := path
	for {
		next := aliProductTail.ReplaceAllString(original, "")
		if next == original {
			break
		}
		original = next
	}
	original = aliProductSize.ReplaceAllString(original, "")
	original = jpgWebp.ReplaceAllString(original, ".$1")
	if !imageExtension.MatchString(original) {
		return path
	}
	return original
}

func productDimensions(parsed *url.URL) (int, int) {
	width, height := 0, 0
	if hostMatches(strings.ToLower(parsed.Hostname()), []string{"360buyimg.com"}) {
		if match := jdProductLevel.FindStringSubmatch(parsed.Path); match != nil {
			size := jdProductSizes[strings.ToLower(match[1])]
			width, height = size, size
		}
	}
	for _, match := range productSize.FindAllStringSubmatch(parsed.Path, -1) {
		width, _ = strconv.Atoi(match[1])
		height, _ = strconv.Atoi(match[2])
	}
	for _, keys := range [][2]string{{"w", "h"}, {"width", "height"}} {
		if value, err := strconv.Atoi(parsed.Query().Get(keys[0])); err == nil && value > 0 {
			width = value
		}
		if value, err := strconv.Atoi(parsed.Query().Get(keys[1])); err == nil && value > 0 {
			height = value
		}
	}
	query := parsed.Query()
	for _, key := range []string{"imageView2", "imageMogr2", "x-oss-process", "x-tos-process", "image_process"} {
		text := query.Get(key)
		// Qiniu commonly uses a bare processing expression as the query key.
		for _, part := range strings.Split(parsed.RawQuery, "&") {
			if strings.HasPrefix(part, key+"/") {
				text = part
			}
		}
		for _, match := range productQuerySize.FindAllStringSubmatch(text, -1) {
			size, _ := strconv.Atoi(match[2])
			if strings.EqualFold(match[1], "w") {
				width = size
			} else {
				height = size
			}
		}
	}
	return width, height
}
