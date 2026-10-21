package media

import (
	"strings"
	"testing"
)

func TestRemoteImageHeadersUseRetailRefererWithoutAvif(t *testing.T) {
	ali := RemoteImageHeaders("https://img.alicdn.com/bao/uploaded/a.jpg")
	if ali["Referer"] != "https://www.taobao.com/" || !strings.Contains(ali["User-Agent"], "Mozilla") || strings.Contains(ali["Accept"], "avif") {
		t.Fatalf("ali headers %#v", ali)
	}
	jd := RemoteImageHeaders("https://img10.360buyimg.com/n0/a.jpg")
	if jd["Referer"] != "https://www.jd.com/" {
		t.Fatalf("jd referer %s", jd["Referer"])
	}
	plain := RemoteImageHeaders("https://cdn.example/a.jpg")
	if _, ok := plain["Referer"]; ok || plain["Accept"] == "" {
		t.Fatalf("plain headers %#v", plain)
	}
	video := RemoteMediaHeaders("https://img.alicdn.com/a.mp4", "*/*")
	if video["Accept"] != "*/*" || video["Referer"] != "https://www.taobao.com/" {
		t.Fatalf("video headers %#v", video)
	}
}
