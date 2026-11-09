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

	imageExtension = regexp.MustCompile(`(?i)\.(?:jpe?g|png|webp|gif|bmp|dpg|avif|heic|tiff?)(?:[!~_./]|$)`)
	otherMedia     = regexp.MustCompile(`(?i)\.(?:html?|mp4|mov|webm|m4v|avi|flv|m3u8|mpd|mp3|m4a|wav|ogg|pdf)(?:[!~]|$)`)
	trackerPath    = regexp.MustCompile(`(?i)(?:i\.php|(?:space|spacer|1x1|blank)\.(?:gif|png)|taesite|tongji|picon/|imagetools/|service_ico|devfe/|s(?:48x48|54x54|30x30|20x20|60x60)_|error-new|jisushenhe|spiderfont)`)
	imageHosts     = []string{"360buyimg.com", "alicdn.com", "taobaocdn.com", "tbcdn.cn", "pddpic.com", "yangkeduo.com", "xhscdn.com", "xiaohongshu.com", "douyinpic.com", "byteimg.com", "snssdk.com", "pstatp.com", "kwaicdn.com", "kwimgs.com", "yximgs.com", "sinaimg.cn", "hdslb.com", "r2.dev", "qiniucdn.com", "upaiyun.com"}
	sizeBeforeJfs  = regexp.MustCompile(`(?i)/s\d+x\d+_`)
	sizeSegment    = regexp.MustCompile(`(?i)/s\d+x\d+/`)
	jdSuffix       = regexp.MustCompile(`(?i)![a-zA-Z0-9_.-]*$`)
	jpgWebp        = regexp.MustCompile(`(?i)\.(jpe?g|png)\.webp$`)
	cosHost        = regexp.MustCompile(`(?i)(?:^|\.)(?:cos\.|oss-)`)
	imageProcess   = regexp.MustCompile(`(?i)(?:imageView2|imageMogr2|image_process|imageView|format/)`)
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

func NormalizeImageURLToStandardJpg(value string) string {
	trimmed := strings.TrimSpace(value)
	if strings.HasPrefix(trimmed, "jfs/") {
		return "https://img10.360buyimg.com/pcpubliccms/s1440x1440_" + trimmed
	}
	source := normalizeImageSource(value)
	if source == "" || !strings.HasPrefix(strings.ToLower(source), "http://") && !strings.HasPrefix(strings.ToLower(source), "https://") {
		return source
	}
	parsed, err := url.Parse(source)
	if err != nil {
		return source
	}
	if strings.ContainsAny(source, "?#") {
		return source
	}
	host := strings.ToLower(parsed.Hostname())
	if host == "ci.xiaohongshu.com" {
		return regexp.MustCompile(`(?i)^https?://ci\.xiaohongshu\.com`).ReplaceAllString(source, "https://sns-img-hw.xhscdn.com")
	}
	if hostMatches(host, []string{"360buyimg.com"}) {
		if image, ok := ParseProductImage(source); ok && strings.HasPrefix(image.Key, "jd:") {
			return image.URL
		}
		source = replaceSizeUnlessJfs(source)
		source = sizeSegment.ReplaceAllString(source, "/")
		source = jdSuffix.ReplaceAllString(source, "")
		source = jdProductDpg.ReplaceAllString(source, "$1")
		return jpgWebp.ReplaceAllString(source, ".$1")
	}
	if hostMatches(host, []string{"alicdn.com", "taobaocdn.com", "tbcdn.cn"}) {
		return aliProductOriginal(source)
	}
	if hostMatches(host, []string{"pddpic.com", "yangkeduo.com"}) {
		// A standalone .webp is a native format, not evidence of a JPEG source.
		return jpgWebp.ReplaceAllString(source, ".$1")
	}
	return source
}

func IsProductImageURL(value string) bool {
	source := normalizeImageSource(value)
	if source == "" {
		return false
	}
	lower := strings.ToLower(source)
	if strings.HasPrefix(lower, "data:image/") || strings.HasPrefix(lower, "blob:") || (strings.HasPrefix(source, "/") && !strings.HasPrefix(source, "//")) {
		return true
	}
	parsed, err := url.Parse(source)
	if err != nil {
		return false
	}
	return imageExtension.MatchString(parsed.Path) || hostMatches(strings.ToLower(parsed.Hostname()), imageHosts) || cosHost.MatchString(parsed.Hostname()) || imageProcess.MatchString(parsed.RawQuery)
}

func normalizeImageSource(value string) string {
	source := strings.TrimSpace(value)
	if source == "" {
		return ""
	}
	if regexp.MustCompile(`(?i)^data:image/[a-z0-9.+-]+[;,]`).MatchString(source) || regexp.MustCompile(`(?i)^blob:(?:https?://|null/)`).MatchString(source) {
		return source
	}
	if strings.HasPrefix(source, "/") && !strings.HasPrefix(source, "//") {
		path := strings.SplitN(strings.SplitN(source, "?", 2)[0], "#", 2)[0]
		if otherMedia.MatchString(path) {
			return ""
		}
		return source
	}
	remote := normalizeRemoteMediaURL(source)
	if remote == "" {
		return ""
	}
	parsed, err := url.Parse(remote)
	if err != nil {
		return ""
	}
	if otherMedia.MatchString(parsed.Path) || trackerPath.MatchString(parsed.Path) || hostMatches(strings.ToLower(parsed.Hostname()), []string{"o0b.cn"}) {
		return ""
	}
	if hostMatches(strings.ToLower(parsed.Hostname()), []string{"item.jd.com", "item.taobao.com", "detail.tmall.com"}) {
		return ""
	}
	return remote
}

func normalizeRemoteMediaURL(value string) string {
	source := strings.TrimSpace(value)
	if strings.HasPrefix(source, "//") {
		source = "https:" + source
	}
	parsed, err := url.Parse(source)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Hostname() == "" || parsed.User != nil {
		return ""
	}
	return source
}

func hostMatches(host string, domains []string) bool {
	for _, domain := range domains {
		if host == domain || strings.HasSuffix(host, "."+domain) {
			return true
		}
	}
	return false
}

func replaceSizeUnlessJfs(source string) string {
	matches := sizeBeforeJfs.FindAllStringIndex(source, -1)
	if len(matches) == 0 {
		return source
	}
	var rebuilt strings.Builder
	last := 0
	for _, match := range matches {
		rebuilt.WriteString(source[last:match[0]])
		if strings.HasPrefix(strings.ToLower(source[match[1]:]), "jfs") {
			rebuilt.WriteString(source[match[0]:match[1]])
		} else {
			rebuilt.WriteString("/")
		}
		last = match[1]
	}
	rebuilt.WriteString(source[last:])
	return rebuilt.String()
}

// ProductImageGroups assigns ownership in main > skus > details order and uses
// the best usable URL for each resource across all groups. Equal-quality URLs
// retain first appearance; comparison keys never become download URLs.
func ProductImageGroups(main, skus, details []string) ([]string, []string, []string) {
	type entry struct {
		image ProductImage
		group int
	}
	entries := []entry{}
	indices := map[string]int{}
	for group, values := range [][]string{main, skus, details} {
		for _, value := range values {
			image, ok := ParseProductImage(value)
			if !ok {
				// Grouping also serves saved user materials; the remote collector
				// parser remains HTTP-only and cannot extract local addresses.
				source := NormalizeImageURLToStandardJpg(value)
				lower := strings.ToLower(source)
				local := strings.HasPrefix(lower, "data:image/") || strings.HasPrefix(lower, "blob:") || (strings.HasPrefix(source, "/") && !strings.HasPrefix(source, "//"))
				if !local || !IsProductImageURL(source) {
					continue
				}
				image = ProductImage{URL: source, Key: source, Quality: 10000}
			}
			if index, exists := indices[image.Key]; exists {
				previous := entries[index].image
				if (!image.Small && previous.Small) || (image.Small == previous.Small && image.Quality > previous.Quality) {
					entries[index].image = image
				}
			} else {
				indices[image.Key] = len(entries)
				entries = append(entries, entry{image, group})
			}
		}
	}
	groups := [3][]string{{}, {}, {}}
	for _, entry := range entries {
		if !entry.image.Small {
			groups[entry.group] = append(groups[entry.group], entry.image.URL)
		}
	}
	return groups[0], groups[1], groups[2]
}
