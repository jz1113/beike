package generate

import (
	"beike.local/cloud/src/backend/internal/gateway"
	"bytes"
	"context"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"os"
	"strings"
	"time"
)

func omniFlash(model string) bool {
	switch strings.ToLower(strings.TrimSpace(model)) {
	case "omni_flash-10s", "omni-flash-10s", "gemini-omni-1.1-flash":
		return true
	}
	return false
}

// Public image URLs can travel in the JSON API. A clip or workspace image
// requires the file API, where every reference is a repeated binary part.
func prepareOmniForm(ctx context.Context, adapted videoAdapted, videos []string, workspace string, production bool) (*gateway.VideoForm, error) {
	binary := len(videos) > 0
	for _, ref := range adapted.images {
		if !strings.HasPrefix(ref, "https://") && !strings.HasPrefix(ref, "http://") {
			binary = true
		}
	}
	if !binary {
		return nil, nil
	}
	ctx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	for _, key := range []string{"model", "prompt", "size"} {
		if err := writer.WriteField(key, adapted.payload[key].(string)); err != nil {
			return nil, err
		}
	}
	for index, ref := range adapted.images {
		file, err := loadEditImage(ctx, ref, index, workspace, production)
		if err != nil {
			return nil, err
		}
		if err := writeOmniPart(writer, file.filename, file.mime, file.data); err != nil {
			return nil, err
		}
	}
	for index, ref := range videos {
		data, err := omniVideoBytes(ctx, ref, workspace, production)
		if err != nil {
			return nil, err
		}
		contentType := http.DetectContentType(data)
		ext := "mp4"
		if len(data) >= 12 && string(data[4:8]) == "ftyp" {
			contentType = "video/mp4"
			if string(data[8:12]) == "qt  " {
				contentType, ext = "video/quicktime", "mov"
			}
		} else if contentType == "video/webm" {
			ext = "webm"
		} else {
			return nil, imageEditPrepareError{"参考视频格式无法识别，请使用 MP4、MOV 或 WebM 视频"}
		}
		if err := writeOmniPart(writer, fmt.Sprintf("video-%d.%s", index+1, ext), contentType, data); err != nil {
			return nil, err
		}
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}
	return &gateway.VideoForm{Body: buf.Bytes(), ContentType: writer.FormDataContentType()}, nil
}

func writeOmniPart(writer *multipart.Writer, name, kind string, data []byte) error {
	header := textproto.MIMEHeader{}
	header.Set("Content-Disposition", mime.FormatMediaType("form-data", map[string]string{"name": "input_reference", "filename": name}))
	header.Set("Content-Type", kind)
	part, err := writer.CreatePart(header)
	if err != nil {
		return err
	}
	_, err = part.Write(data)
	return err
}

func omniVideoBytes(ctx context.Context, ref, workspace string, production bool) ([]byte, error) {
	var reader io.ReadCloser
	if strings.HasPrefix(ref, "/storage/") {
		path, err := resolveSeedanceLocalVideoPath(ref, workspace, production)
		if err != nil {
			return nil, err
		}
		reader, err = os.Open(path)
		if err != nil {
			return nil, imageEditPrepareError{"本地参考视频无法读取"}
		}
	} else {
		u, err := url.Parse(normalizeImageRef(ref))
		if err != nil || u.Host == "" || u.User != nil || (u.Scheme != "https" && u.Scheme != "http") {
			return nil, imageEditPrepareError{"参考视频需要公网链接或当前工作区文件"}
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
		if err != nil {
			return nil, err
		}
		res, err := gateway.ModelHTTP().Do(req)
		if err != nil {
			return nil, imageEditPrepareError{"参考视频下载失败"}
		}
		reader = res.Body
		if res.StatusCode != http.StatusOK {
			reader.Close()
			return nil, imageEditPrepareError{"参考视频下载失败"}
		}
	}
	defer reader.Close()
	data, err := io.ReadAll(io.LimitReader(reader, (32<<20)+1))
	if err != nil || len(data) == 0 || len(data) > 32<<20 {
		return nil, imageEditPrepareError{"参考视频为空、无法读取或超过当前 32MB 上传上限"}
	}
	return data, nil
}

// Gemini Omni binds image/video roles through documented source/reference tags.
func omniFlashRolePrompt(prompt, mode string, imageCount, videoCount int) string {
	var sources, references, parts []string
	for index := 0; index < imageCount; index++ {
		if mode == "first_frame" || mode == "first_last_frame" {
			role := "FIRST_FRAME"
			if index > 0 {
				role = "LAST_FRAME"
			}
			sources = append(sources, fmt.Sprintf("<%s>@Image%d", role, index+1))
		} else {
			references = append(references, fmt.Sprintf("<IMAGE_REF_%d>@Image%d", index, index+1))
		}
	}
	for index := 0; index < videoCount; index++ {
		if index == 0 && (mode == "edit" || mode == "extend") {
			role := "VIDEO_0"
			if mode == "extend" {
				role = "PREVIOUS_VIDEO"
			}
			sources = append(sources, "<"+role+">@Video1")
		} else {
			references = append(references, fmt.Sprintf("<VIDEO_REF_%d>@Video%d", index, index+1))
		}
	}
	if len(sources) > 0 {
		parts = append(parts, "[# Sources "+strings.Join(sources, " ")+"]")
	}
	if len(references) > 0 {
		parts = append(parts, "[# References "+strings.Join(references, " ")+"]")
	}
	return strings.Join(append(parts, prompt), "\n")
}
