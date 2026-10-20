package media

import "testing"

func TestProductImageNormalizationVectors(t *testing.T) {
	canonical := "https://img10.360buyimg.com/pcpubliccms/s1440x1440_jfs/t1/a.webp"
	cases := []struct {
		name, source, want, key string
		small                   bool
	}{
		{"jd native webp", "https://img14.360buyimg.com/n0/s48x48_jfs/t1/a.webp", canonical, "jd:jfs/t1/a.webp", false},
		{"jd relative jfs", "jfs/t1/a.webp", canonical, "jd:jfs/t1/a.webp", false},
		{"jd wrapped jpeg", "//img14.360buyimg.com/n5/s50x50_jfs/t1/a.jpg.dpg.webp!q70", "https://img10.360buyimg.com/pcpubliccms/s1440x1440_jfs/t1/a.jpg", "jd:jfs/t1/a.jpg", false},
		{"ali recover thumbnail", "https://img.alicdn.com/a.jpg_50x50.jpg_.webp", "https://img.alicdn.com/a.jpg", "ali:img.alicdn.com/a.jpg", false},
		{"ali native webp", "https://img.alicdn.com/native.webp", "https://img.alicdn.com/native.webp", "ali:img.alicdn.com/native.webp", false},
		{"unknown native webp", "https://cdn.example.com/native.webp", "https://cdn.example.com/native.webp", "https://cdn.example.com/native.webp", false},
		{"unknown small", "https://cdn.example.com/s80x80/native.webp", "https://cdn.example.com/s80x80/native.webp", "https://cdn.example.com/s80x80/native.webp", true},
		{"unknown small query", "https://cdn.example.com/native.webp?w=80&sign=A%2fb+%20&z=2&z=1#x", "https://cdn.example.com/native.webp?w=80&sign=A%2fb+%20&z=2&z=1#x", "https://cdn.example.com/native.webp?w=80&sign=A%2fb+%20&z=2&z=1#x", true},
		{"jd signed small", "https://img14.360buyimg.com/n5/jfs/t1/a.webp?sign=A%2fb+%20&z=2&z=1", "https://img14.360buyimg.com/n5/jfs/t1/a.webp?sign=A%2fb+%20&z=2&z=1", "jd:jfs/t1/a.webp", true},
		{"jd signed large", "https://img12.360buyimg.com/n0/s1200x1200_jfs/t1/a.webp?sign=X%2fy+Z", "https://img12.360buyimg.com/n0/s1200x1200_jfs/t1/a.webp?sign=X%2fy+Z", "jd:jfs/t1/a.webp", false},
		{"ali signed small", "https://img.alicdn.com/a.jpg_50x50.jpg?Signature=x%2Fy&k=1&k=0", "https://img.alicdn.com/a.jpg_50x50.jpg?Signature=x%2Fy&k=1&k=0", "ali:img.alicdn.com/a.jpg", true},
		{"jd high resolution retained", "https://img14.360buyimg.com/n0/s2000x2000_jfs/t1/high.webp", "https://img14.360buyimg.com/n0/s2000x2000_jfs/t1/high.webp", "jd:jfs/t1/high.webp", false},
		{"jd high long edge retained", "https://img14.360buyimg.com/pcpubliccms/s2000x1000_jfs/t1/wide.png", "https://img14.360buyimg.com/pcpubliccms/s2000x1000_jfs/t1/wide.png", "jd:jfs/t1/wide.png", false},
		{"jd exactly 1440 standardized", "https://img14.360buyimg.com/n0/s1440x1440_jfs/t1/a.webp", canonical, "jd:jfs/t1/a.webp", false},
		{"force query retained", "https://img14.360buyimg.com/n0/jfs/t1/a.webp?", "https://img14.360buyimg.com/n0/jfs/t1/a.webp?", "jd:jfs/t1/a.webp", false},
		{"empty fragment retained", "https://img14.360buyimg.com/n0/jfs/t1/a.webp#", "https://img14.360buyimg.com/n0/jfs/t1/a.webp#", "jd:jfs/t1/a.webp", false},
		{"nonstandard ali filename retained", "https://img.alicdn.com/a.jpg_50x50-custom.webp", "https://img.alicdn.com/a.jpg_50x50-custom.webp", "ali:img.alicdn.com/a.jpg_50x50-custom.webp", true},
	}
	for _, item := range cases {
		t.Run(item.name, func(t *testing.T) {
			got, ok := ParseProductImage(item.source)
			if !ok || got.URL != item.want || got.Key != item.key || got.Small != item.small {
				t.Fatalf("got %#v ok=%v, want %q key=%q small=%v", got, ok, item.want, item.key, item.small)
			}
		})
	}
}

func TestProductImageRejectsNonProductMedia(t *testing.T) {
	for _, source := range []string{
		"https://item.jd.com/1234567.html", "https://img.alicdn.com/video.mp4", "https://example.com/file.pdf",
		"https://example.com/blank.gif", "https://img.alicdn.com/picon/logo.png", "https://o0b.cn/a.jpg",
		"data:image/png;base64,abc", "/local/a.jpg", "https://user:pass@example.com/a.jpg", "https://example.com/product/12345",
	} {
		if got, ok := ParseProductImage(source); ok {
			t.Fatalf("accepted %q: %#v", source, got)
		}
	}
}

func TestProductImageSignedAndUnknownURLsRetainEveryByte(t *testing.T) {
	for _, source := range []string{
		"https://img14.360buyimg.com/n0/jfs/a.JPG.webp?sign=a%2Fb%2f+%20&b=2&a=1&a=0#frag",
		"https://IMG.ALICDN.COM/a.jpg_800x800.jpg?OSSAccessKeyId=X&Signature=a%2Fb%3D&Expires=123",
		"https://cdn.example.com/a.webp!q70",
		"https://cdn.example.com/a%2Fb.jpg?sig=x%2fy&x=+&x=%20",
		"https://img.alicdn.com/native.webp#signature",
	} {
		image, ok := ParseProductImage(source)
		if !ok || image.URL != source {
			t.Fatalf("URL bytes changed: %q => %#v", source, image)
		}
	}
}

func TestProductImageProcessingQuerySmall(t *testing.T) {
	for _, source := range []string{
		"https://cdn.example.com/a.jpg?imageView2/1/w/80/h/80&sign=x",
		"https://cdn.example.com/a.jpg?x-oss-process=image/resize,w_80,h_80&Signature=x",
	} {
		image, ok := ParseProductImage(source)
		if !ok || !image.Small || image.URL != source {
			t.Fatalf("unsafe small image: %#v", image)
		}
	}
}
