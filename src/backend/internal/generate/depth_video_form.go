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

const depthVideoFileBytes = 35 * 1024 * 1024

var depthVideoName = regexp.MustCompile(`(?i)\.(mp4|webm|mov|m4v)$`)

func depthVideoForm(cfg config.Config, w http.ResponseWriter, r *http.Request) {
	if headerInt(r.Header.Get("Content-Length")) > depthVideoMaxBytes {
		writeDepthVideoTooLarge(w)
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, depthVideoMaxBytes+1))
	if err != nil || int64(len(body)) > depthVideoMaxBytes {
		writeDepthVideoTooLarge(w)
		return
	}
	file, ok := readDepthVideoFile(r.Header.Get("Content-Type"), body)
	if !ok {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{
			"success": false,
			"error":   "视频上传解析失败，请检查视频文件完整性或控制视频大小",
		})
		return
	}
	if file == nil || !file.isFile {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "缺少视频文件 video"})
		return
	}
	if !strings.HasPrefix(file.mediaType, "video/") && !depthVideoName.MatchString(file.name) {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请上传 MP4 / WebM / MOV 视频文件"})
		return
	}
	if file.size > depthVideoFileBytes {
		writeDepthVideoTooLarge(w)
		return
	}
	if status, message := depthVideoPreAccept(cfg, file.data); status != 0 {
		httpx.WriteJSON(w, status, map[string]any{"success": false, "error": message})
		return
	}
	operation := strings.TrimSpace(r.Header.Get("x-idempotency-key"))
	if operation == "" {
		operation = strings.TrimSpace(file.fields["clientTaskId"])
	}
	acceptDepthVideo(cfg, w, r, file.data, "", "", file.fields["style"], file.fields["quality"], operation)
}

type depthVideoFile struct {
	name      string
	mediaType string
	size      int
	isFile    bool
	data      []byte
	fields    map[string]string
}

func readDepthVideoFile(contentType string, body []byte) (*depthVideoFile, bool) {
	_, params, err := mime.ParseMediaType(contentType)
	if err != nil || params["boundary"] == "" {
		return nil, false
	}
	reader := multipart.NewReader(bytes.NewReader(body), params["boundary"])
	fields := map[string]string{}
	var found *depthVideoFile
	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			if found != nil {
				found.fields = fields
			}
			return found, true
		}
		if err != nil {
			return nil, false
		}
		data, err := io.ReadAll(part)
		_ = part.Close()
		if err != nil {
			return nil, false
		}
		if part.FileName() == "" {
			if _, seen := fields[part.FormName()]; !seen {
				fields[part.FormName()] = string(data)
			}
			continue
		}
		if found != nil || part.FormName() != "video" {
			continue
		}
		mediaType, _, _ := mime.ParseMediaType(part.Header.Get("Content-Type"))
		found = &depthVideoFile{
			name: part.FileName(), mediaType: mediaType, size: len(data), isFile: true, data: data, fields: fields,
		}
	}
}

func writeDepthVideoTooLarge(w http.ResponseWriter) {
	httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{
		"success": false,
		"error":   "视频过大，请控制在 35MB 以内",
	})
}
