package generate

import (
	"bytes"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"regexp"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

const depthImageFileBytes = 20 * 1024 * 1024

var depthImageName = regexp.MustCompile(`(?i)\.(jpe?g|png|webp|gif)$`)

func depthImageForm(cfg config.Config, w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, depthImageFileBytes+2*1024*1024+1))
	if err != nil || len(body) > depthImageFileBytes+2*1024*1024 {
		writeDepthImageTooLarge(w)
		return
	}
	file, fields, ok := readDepthImageFile(r.Header.Get("Content-Type"), body)
	if !ok {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{
			"success": false, "submissionRejected": true, "error": "深度图片生成失败",
		})
		return
	}
	if file == nil || !file.isFile {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "缺少图片文件 image"})
		return
	}
	if !strings.HasPrefix(file.mediaType, "image/") && !depthImageName.MatchString(file.name) {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请上传 JPG / PNG / WebP 图片文件"})
		return
	}
	if file.size > depthImageFileBytes {
		writeDepthImageTooLarge(w)
		return
	}
	runDepthImage(cfg, w, r, file, fields)
}

type depthImageFile struct {
	name      string
	mediaType string
	size      int
	isFile    bool
	data      []byte
}

func readDepthImageFile(contentType string, body []byte) (*depthImageFile, map[string]string, bool) {
	_, params, err := mime.ParseMediaType(contentType)
	if err != nil || params["boundary"] == "" {
		return nil, nil, false
	}
	reader := multipart.NewReader(bytes.NewReader(body), params["boundary"])
	fields := map[string]string{}
	var found *depthImageFile
	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			return found, fields, true
		}
		if err != nil {
			return nil, nil, false
		}
		data, err := io.ReadAll(part)
		_ = part.Close()
		if err != nil {
			return nil, nil, false
		}
		if part.FileName() == "" {
			if _, seen := fields[part.FormName()]; !seen {
				fields[part.FormName()] = string(data)
			}
			continue
		}
		if found != nil || part.FormName() != "image" {
			continue
		}
		mediaType, _, _ := mime.ParseMediaType(part.Header.Get("Content-Type"))
		found = &depthImageFile{
			name: part.FileName(), mediaType: mediaType, size: len(data), isFile: true, data: data,
		}
	}
}

func writeDepthImageTooLarge(w http.ResponseWriter) {
	httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{
		"success": false, "error": "图片过大，请控制在 20MB 以内",
	})
}
