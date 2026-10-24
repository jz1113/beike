package media

import (
	"net/url"
	"strings"
)

// RemoteMediaHeaders matches the browser preview request closely enough for
// retail CDNs to return the picture instead of an anti-hotlink page.
func RemoteMediaHeaders(rawURL, accept string) map[string]string {
	headers := map[string]string{
		"User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
		"Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
		"Accept":          accept,
	}
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return headers
	}
	host := strings.ToLower(parsed.Hostname())
	for _, rule := range []struct{ suffix, referer string }{
		{"xhscdn.com", "https://www.xiaohongshu.com/"},
		{"xiaohongshu.com", "https://www.xiaohongshu.com/"},
		{"douyinpic.com", "https://www.douyin.com/"},
		{"snssdk.com", "https://www.douyin.com/"},
		{"bytecdn.cn", "https://www.douyin.com/"},
		{"360buyimg.com", "https://www.jd.com/"},
		{"jd.com", "https://www.jd.com/"},
		{"alicdn.com", "https://www.taobao.com/"},
		{"tbcdn.cn", "https://www.taobao.com/"},
		{"taobao.com", "https://www.taobao.com/"},
		{"tmall.com", "https://www.taobao.com/"},
		{"pddpic.com", "https://mobile.yangkeduo.com/"},
		{"yangkeduo.com", "https://mobile.yangkeduo.com/"},
		{"kuaishou.com", "https://www.kuaishou.com/"},
		{"yximgs.com", "https://www.kuaishou.com/"},
		{"kwimgs.com", "https://www.kuaishou.com/"},
	} {
		if host == rule.suffix || strings.HasSuffix(host, "."+rule.suffix) {
			headers["Referer"] = rule.referer
			break
		}
	}
	return headers
}

// RemoteImageHeaders asks only for formats the vision pipeline can decode.
func RemoteImageHeaders(rawURL string) map[string]string {
	return RemoteMediaHeaders(rawURL, "image/jpeg,image/png,image/webp,image/gif,image/*;q=0.8,*/*;q=0.5")
}

// Inline protected retail/social images; public signed URLs retain their bytes.
func RemoteImageNeedsInline(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	if strings.HasSuffix(strings.ToLower(u.Path), ".octet-stream") {
		return true
	}
	return RemoteImageHeaders(raw)["Referer"] != ""
}
