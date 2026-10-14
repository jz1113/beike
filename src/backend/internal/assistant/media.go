package assistant

import (
	"crypto/rand"
	"encoding/binary"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/storage"
)

const (
	videoAttachmentLimit = 100_000_000
	imageAttachmentLimit = 6_000_000
	attachmentLifetime   = 7 * 24 * time.Hour
)

func Media(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = cfg
		mimeType := strings.ToLower(strings.TrimSpace(strings.Split(r.Header.Get("Content-Type"), ";")[0]))
		video := mimeType == "video/mp4" || mimeType == "video/quicktime" || mimeType == "video/webm"
		if strings.HasPrefix(mimeType, "video/") && !video {
			httpx.WriteJSON(w, http.StatusUnsupportedMediaType, map[string]any{"error": "目前支持 MP4、MOV 和 WebM 视频"})
			return
		}
		limit := imageAttachmentLimit
		if video {
			limit = videoAttachmentLimit
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, int64(limit)+1))
		if err != nil || len(body) == 0 || len(body) > limit {
			httpx.WriteJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"error": "附件大小超过上限"})
			return
		}
		if video {
			extension := "mp4"
			valid := len(body) >= 12 && videoBox(body[4:8])
			if mimeType == "video/webm" {
				extension = "webm"
				valid = len(body) >= 4 && binary.BigEndian.Uint32(body[:4]) == 0x1A45DFA3
			} else if mimeType == "video/quicktime" {
				extension = "mov"
			}
			if !valid {
				httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "视频内容与文件格式不匹配"})
				return
			}
			saveAttachment(w, r, body, extension)
			return
		}
		prepared, err := prepareAttachmentImage(body)
		if err != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "附件保存失败，请重新载入后重试"})
			return
		}
		saveAttachment(w, r, prepared, "jpg")
	})
}

func saveAttachment(w http.ResponseWriter, r *http.Request, body []byte, extension string) {
	expires := time.Now().Add(attachmentLifetime).UnixMilli()
	relative := storage.WorkspaceKey("assistant-attachments/"+itoa64(expires)+"-"+randomID()+"."+extension, httpx.WorkspaceFrom(r))
	root := storage.ResolveRoot()
	if resolved, err := filepath.EvalSymlinks(root); err == nil {
		root = resolved
	}
	target := storage.SafeWithin(root, relative)
	if target == "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "附件保存失败，请重新载入后重试"})
		return
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "附件保存失败，请重新载入后重试"})
		return
	}
	file, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "附件保存失败，请重新载入后重试"})
		return
	}
	_, writeErr := file.Write(body)
	closeErr := file.Close()
	if writeErr != nil || closeErr != nil {
		_ = os.Remove(target)
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "附件保存失败，请重新载入后重试"})
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "url": "/storage/" + relative, "expiresAt": expires})
}

func videoBox(box []byte) bool {
	name := string(box)
	return name == "ftyp" || name == "moov" || name == "mdat" || name == "wide"
}

func randomID() string {
	var value [16]byte
	if _, err := rand.Read(value[:]); err != nil {
		return "attachment"
	}
	value[6] = (value[6] & 0x0f) | 0x40
	value[8] = (value[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", value[0:4], value[4:6], value[6:8], value[8:10], value[10:])
}

func itoa64(value int64) string {
	return fmt.Sprintf("%d", value)
}
