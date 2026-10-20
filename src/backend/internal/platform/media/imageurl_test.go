package media

import "testing"

func TestNormalizeKeepsSignedQueryAndRewritesJd(t *testing.T) {
	signed := "https://img.alicdn.com/a.jpg?sign=1"
	if got := NormalizeImageURLToStandardJpg(signed); got != signed {
		t.Fatalf("signed query changed: %s", got)
	}
	got := NormalizeImageURLToStandardJpg("https://img14.360buyimg.com/n0/s800x800_jfs/t1/a.webp")
	if got != "https://img10.360buyimg.com/pcpubliccms/s1440x1440_jfs/t1/a.webp" {
		t.Fatalf("jd url %s", got)
	}
	if IsProductImageURL("https://example.com/video.mp4") {
		t.Fatal("视频地址不应算作商品图")
	}
	if !IsProductImageURL("https://img.alicdn.com/imgextra/a.jpg") {
		t.Fatal("阿里商品图应保留")
	}
}
