package media

import (
	"net/url"
	"regexp"
	"strings"
)

var (
	imageExtension = regexp.MustCompile(`(?i)\.(?:jpe?g|png|webp|gif|bmp|dpg|avif|heic|tiff?)(?:[!~_./]|$)`)
	otherMedia     = regexp.MustCompile(`(?i)\.(?:html?|mp4|mov|webm|m4v|avi|flv|m3u8|mpd|mp3|m4a|wav|ogg|pdf)(?:[!~]|$)`)
	trackerPath    = regexp.MustCompile(`(?i)(?:i\.php|(?:space|spacer|1x1|blank)\.(?:gif|png)|taesite|tongji|picon/|imagetools/|service_ico|devfe/|s(?:48x48|54x54|30x30|20x20|60x60)_|error-new|jisushenhe|spiderfont)`)
	imageHosts     = []string{"360buyimg.com", "alicdn.com", "taobaocdn.com", "tbcdn.cn", "pddpic.com", "yangkeduo.com", "xhscdn.com", "xiaohongshu.com", "douyinpic.com", "byteimg.com", "snssdk.com", "pstatp.com", "kwaicdn.com", "kwimgs.com", "yximgs.com", "sinaimg.cn", "hdslb.com", "r2.dev", "qiniucdn.com", "upaiyun.com"}
	jdResize       = regexp.MustCompile(`(?i)^https?://[^/]+/(?:mobilecms/|popWaterMark/|popWareDetail/|n\d+/|sku/|shaidan/|babel/|imgzone/|pcpubliccms/)?(?:s\d+x\d+_)?jfs/`)
	sizeBeforeJfs  = regexp.MustCompile(`(?i)/s\d+x\d+_`)
	sizeSegment    = regexp.MustCompile(`(?i)/s\d+x\d+/`)
	jdSuffix       = regexp.MustCompile(`(?i)![a-zA-Z0-9_.-]*$`)
	jdDpg          = regexp.MustCompile(`(?i)\.dpg(?:\.webp)?$`)
	jpgWebp        = regexp.MustCompile(`(?i)\.(jpe?g|png)\.webp$`)
	webpSuffix     = regexp.MustCompile(`(?i)\.webp$`)
	aliTail        = regexp.MustCompile(`(?i)_\.webp$|_(?:q\d+\.jpg|\d+x\d+|sum\.jpg|[bms]\.jpg).*$`)
	aliSize        = regexp.MustCompile(`(?i)\.\d+x\d+\.jpg.*$|\.(?:search|summ)\.jpg.*$`)
	cosHost        = regexp.MustCompile(`(?i)(?:^|\.)(?:cos\.|oss-)`)
	imageProcess   = regexp.MustCompile(`(?i)(?:imageView2|imageMogr2|image_process|imageView|format/)`)
)

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
	if parsed.RawQuery != "" || parsed.Fragment != "" {
		return source
	}
	host := strings.ToLower(parsed.Hostname())
	if host == "ci.xiaohongshu.com" {
		return regexp.MustCompile(`(?i)^https?://ci\.xiaohongshu\.com`).ReplaceAllString(source, "https://sns-img-hw.xhscdn.com")
	}
	if hostMatches(host, []string{"360buyimg.com"}) {
		source = jdResize.ReplaceAllString(source, "https://img10.360buyimg.com/pcpubliccms/s1440x1440_jfs/")
		source = replaceSizeUnlessJfs(source)
		source = sizeSegment.ReplaceAllString(source, "/")
		source = jdSuffix.ReplaceAllString(source, "")
		source = jdDpg.ReplaceAllString(source, "")
		source = jpgWebp.ReplaceAllString(source, ".$1")
		return webpSuffix.ReplaceAllString(source, ".jpg")
	}
	if hostMatches(host, []string{"alicdn.com", "taobaocdn.com", "tbcdn.cn"}) {
		source = aliTail.ReplaceAllString(source, "")
		source = aliSize.ReplaceAllString(source, ".jpg")
		source = jpgWebp.ReplaceAllString(source, ".$1")
		return webpSuffix.ReplaceAllString(source, ".jpg")
	}
	if hostMatches(host, []string{"pddpic.com", "yangkeduo.com"}) {
		return webpSuffix.ReplaceAllString(source, ".jpeg")
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
