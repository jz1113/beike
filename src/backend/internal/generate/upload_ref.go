package generate

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"strings"

	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/storage"
)

func UploadRef() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		contentType := r.Header.Get("Content-Type")
		if !strings.Contains(contentType, "multipart/form-data") {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请使用 multipart/form-data 格式上传文件"})
			return
		}
		raw, err := io.ReadAll(io.LimitReader(r.Body, 32<<20+1))
		if err != nil || len(raw) > 32<<20 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "无法解析上传的数据"})
			return
		}
		_, params, err := mime.ParseMediaType(contentType)
		if err != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "无法解析上传的数据"})
			return
		}
		form, err := multipart.NewReader(bytes.NewReader(raw), params["boundary"]).ReadForm(32 << 20)
		if err != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "无法解析上传的数据"})
			return
		}
		defer form.RemoveAll()
		files := form.File["file"]
		if len(files) == 0 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "缺少待上传文件 (file 字段)"})
			return
		}
		header := files[0]
		opened, err := header.Open()
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "素材上传异常"})
			return
		}
		defer opened.Close()
		body, err := io.ReadAll(io.LimitReader(opened, 32<<20+1))
		if err != nil || len(body) > 32<<20 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "无法解析上传的数据"})
			return
		}
		isVideo := strings.HasPrefix(header.Header.Get("Content-Type"), "video/") || hasVideoExt(header.Filename)
		mimeType := header.Header.Get("Content-Type")
		if isVideo {
			if mimeType == "" {
				mimeType = "video/mp4"
			}
		} else if mimeType == "" {
			mimeType = "image/jpeg"
		}
		if config := storage.ResolveObjectConfig(storageConfigHeader(r)); config != nil {
			key := storage.ObjectKey("refs", extension(mimeType, header.Filename), header.Filename)
			if err := storage.Objects.Put(r.Context(), *config, key, mimeType, body); err != nil {
				httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "对象存储上传失败: 请检查存储配置"})
				return
			}
			if config.Provider == "oss" {
				httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "参考文件已上传，但无法生成临时访问签名"})
				return
			}
			httpx.WriteJSON(w, http.StatusOK, map[string]any{
				"success": true, "url": storage.PermanentObjectURL(*config, key),
				"mediaType": mediaKind(isVideo), "filename": header.Filename,
			})
			return
		}
		if isVideo {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "当前未配置对象存储（OSS/R2/COS/S3）。Seedance 官方要求参考视频必须为公网可访问链接，请在系统【设置 -> 对象存储】中完成配置，或直接输入公网视频链接。"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"success": true, "url": "data:" + mimeType + ";base64," + base64.StdEncoding.EncodeToString(body),
			"mediaType": "image", "filename": header.Filename,
		})
	})
}

func storageConfigHeader(r *http.Request) map[string]any {
	raw := strings.TrimSpace(r.Header.Get("x-storage-config"))
	if raw == "" {
		return nil
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		return nil
	}
	return payload
}

func hasVideoExt(name string) bool {
	lower := strings.ToLower(name)
	return strings.HasSuffix(lower, ".mp4") || strings.HasSuffix(lower, ".mov") || strings.HasSuffix(lower, ".webm") || strings.HasSuffix(lower, ".m4v")
}

func extension(contentType, name string) string {
	if dot := strings.LastIndex(name, "."); dot >= 0 && dot < len(name)-1 {
		return name[dot+1:]
	}
	if strings.Contains(contentType, "png") {
		return "png"
	}
	if strings.Contains(contentType, "webp") {
		return "webp"
	}
	if strings.Contains(contentType, "video") {
		return "mp4"
	}
	return "jpg"
}

func mediaKind(video bool) string {
	if video {
		return "video"
	}
	return "image"
}
