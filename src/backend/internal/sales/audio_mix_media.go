package sales

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/platform/media"
)

const audioMixVideoLimit int64 = 128 << 20
const audioMixAudioLimit int64 = 32 << 20

type audioMixMediaClient interface {
	Do(*http.Request) (*http.Response, error)
}

// Object-store uploads and generated clips can return signed HTTPS URLs. Download
// those through the public-network client; FFmpeg only ever receives local files.
func resolveAudioMixMedia(ctx context.Context, source, workspace string, video bool, client audioMixMediaClient) (string, func(), error) {
	cleanup := func() {}
	source = strings.TrimSpace(source)
	if strings.HasPrefix(source, "/storage/") {
		var file string
		var err error
		if video {
			file, err = localScriptVideoFile(source, workspace)
		} else {
			file, err = localWorkspaceAudioFile(source, workspace)
		}
		return file, cleanup, err
	}
	parsed, err := url.Parse(source)
	if err != nil || len(source) > 8192 || (parsed.Scheme != "https" && parsed.Scheme != "http") || parsed.Host == "" || parsed.User != nil {
		return "", cleanup, errors.New("仅支持当前工作区文件或公网 HTTP 音视频地址")
	}
	ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, source, nil)
	if err != nil {
		return "", cleanup, errors.New("音视频地址无效")
	}
	accept, limit := "audio/*", audioMixAudioLimit
	if video {
		accept, limit = "video/*", audioMixVideoLimit
	}
	for key, value := range media.RemoteMediaHeaders(source, accept) {
		req.Header.Set(key, value)
	}
	response, err := client.Do(req)
	if err != nil {
		return "", cleanup, errors.New("远程音视频读取失败，请确认地址可访问后重试")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return "", cleanup, errors.New("远程音视频已失效或不可访问，请重新生成或上传")
	}
	sizeError := func() error {
		return fmt.Errorf("待合成媒体超过 %d MB，请压缩或截取后重试", limit>>20)
	}
	if response.ContentLength > limit {
		return "", cleanup, sizeError()
	}
	// Inspect bytes, not the filename or content-type: reject playlists/HTML before
	// a media parser can follow an embedded URL or interpret another local path.
	header := make([]byte, 16)
	n, readErr := io.ReadFull(response.Body, header)
	if readErr != nil && readErr != io.EOF && readErr != io.ErrUnexpectedEOF {
		return "", cleanup, errors.New("远程音视频下载中断，请重试")
	}
	header = header[:n]
	extension := audioMixMediaExtension(header, video)
	if extension == "" {
		return "", cleanup, errors.New("远程地址未返回支持的音视频文件，请重新上传 MP4/MOV/WebM 视频或常见音频文件")
	}
	file, err := os.CreateTemp("", "sales-mix-input-*"+extension)
	if err != nil {
		return "", cleanup, errors.New("准备合成临时文件失败")
	}
	cleanup = func() { _ = os.Remove(file.Name()) }
	if _, err := file.Write(header); err != nil {
		_ = file.Close()
		cleanup()
		return "", func() {}, errors.New("写入合成临时文件失败")
	}
	written, copyErr := io.Copy(file, io.LimitReader(response.Body, limit-int64(n)+1))
	closeErr := file.Close()
	if int64(n)+written > limit {
		cleanup()
		return "", func() {}, sizeError()
	}
	if copyErr != nil || closeErr != nil || ctx.Err() != nil {
		cleanup()
		return "", func() {}, errors.New("远程音视频下载中断，请重试")
	}
	return file.Name(), cleanup, nil
}

func audioMixMediaExtension(header []byte, video bool) string {
	if len(header) < 12 {
		return ""
	}
	if string(header[4:8]) == "ftyp" || (video && (string(header[4:8]) == "moov" || string(header[4:8]) == "mdat")) {
		if string(header[8:12]) == "qt  " || string(header[4:8]) != "ftyp" {
			return ".mov"
		}
		return ".mp4"
	}
	if video {
		if string(header[:4]) == "\x1a\x45\xdf\xa3" {
			return ".webm"
		}
		return ""
	}
	switch string(header[:4]) {
	case "RIFF":
		if string(header[8:12]) == "WAVE" {
			return ".wav"
		}
	case "fLaC":
		return ".flac"
	case "OggS":
		return ".ogg"
	}
	if string(header[:3]) == "ID3" || (header[0] == 0xff && header[1]&0xe0 == 0xe0) {
		return ".mp3"
	}
	return ""
}
