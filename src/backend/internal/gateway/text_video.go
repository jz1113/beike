package gateway

import (
	"context"
	"encoding/base64"
	"errors"
	"strings"
)

// Leave room for base64, images and conversation text in a 32 MiB request.
const TextVideoInlineByteLimit = 16_000_000

func textVideo(ctx context.Context, source string) (string, string, error) {
	if err := ctx.Err(); err != nil {
		return "", "", err
	}
	head, data, ok := strings.Cut(source, ",")
	if !ok || !strings.HasPrefix(head, "data:video/") || !strings.HasSuffix(head, ";base64") {
		return "", "", errors.New("视频必须先上传并转换为内嵌内容，不能使用本地或浏览器临时地址")
	}
	mime := strings.TrimSuffix(strings.TrimPrefix(head, "data:"), ";base64")
	if mime != "video/mp4" && mime != "video/quicktime" && mime != "video/webm" {
		return "", "", errors.New("原生视频分析支持 MP4、MOV 和 WebM")
	}
	if len(data) == 0 || len(data) > base64.StdEncoding.EncodedLen(TextVideoInlineByteLimit) {
		return "", "", errors.New("原生视频内容超过内嵌大小上限")
	}
	raw, err := base64.StdEncoding.DecodeString(data)
	if err != nil || len(raw) == 0 || len(raw) > TextVideoInlineByteLimit {
		return "", "", errors.New("无效的视频内嵌内容")
	}
	valid := len(raw) >= 12 && (string(raw[4:8]) == "ftyp" || string(raw[4:8]) == "moov" || string(raw[4:8]) == "mdat" || string(raw[4:8]) == "wide")
	if mime == "video/webm" {
		valid = len(raw) >= 4 && string(raw[:4]) == "\x1a\x45\xdf\xa3"
	}
	if !valid {
		return "", "", errors.New("视频内容与声明格式不匹配")
	}
	return mime, data, nil
}
