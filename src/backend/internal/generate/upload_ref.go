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
		mimeType := resolveRefMimeType(header.Header.Get("Content-Type"), header.Filename, body, isVideo)
		if config := storage.ResolveObjectConfig(uploadRefStorageConfig(r, form)); config != nil && config.Enabled {
			key := storage.ObjectKeyWithConfig(*config, "refs", extension(mimeType, header.Filename), header.Filename)
			if err := storage.Objects.Put(r.Context(), *config, key, mimeType, body); err != nil {
				if isVideo {
					httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "对象存储上传失败: 请检查存储配置"})
					return
				}
			} else if url, err := storage.ReferenceObjectURL(r.Context(), *config, key); err != nil {
				if isVideo {
					httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "参考文件已上传，但无法生成临时访问签名，请检查存储 Endpoint 与地域配置"})
					return
				}
			} else {
				httpx.WriteJSON(w, http.StatusOK, map[string]any{
					"success": true, "url": url,
					"mediaType": mediaKind(isVideo), "filename": header.Filename,
				})
				return
			}
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

func uploadRefStorageConfig(r *http.Request, form *multipart.Form) map[string]any {
	if cfg := storageConfigHeader(r); cfg != nil {
		return cfg
	}
	if form == nil {
		return nil
	}
	for _, field := range []string{"storageConfig", "customConfig"} {
		if values := form.Value[field]; len(values) > 0 {
			raw := strings.TrimSpace(values[0])
			if raw == "" {
				continue
			}
			var payload map[string]any
			if err := json.Unmarshal([]byte(raw), &payload); err == nil && payload != nil {
				return payload
			}
		}
	}
	return nil
}

func resolveRefMimeType(declared, filename string, body []byte, isVideo bool) string {
	cleaned := strings.ToLower(strings.TrimSpace(strings.Split(declared, ";")[0]))
	if cleaned != "" && cleaned != "application/octet-stream" {
		return cleaned
	}
	if isVideo {
		lower := strings.ToLower(filename)
		switch {
		case strings.HasSuffix(lower, ".mov"):
			return "video/quicktime"
		case strings.HasSuffix(lower, ".webm"):
			return "video/webm"
		default:
			return "video/mp4"
		}
	}
	if len(body) > 0 {
		detected := strings.ToLower(strings.TrimSpace(strings.Split(http.DetectContentType(body), ";")[0]))
		if strings.HasPrefix(detected, "image/") {
			return detected
		}
	}
	lower := strings.ToLower(filename)
	switch {
	case strings.HasSuffix(lower, ".png"):
		return "image/png"
	case strings.HasSuffix(lower, ".webp"):
		return "image/webp"
	case strings.HasSuffix(lower, ".gif"):
		return "image/gif"
	case strings.HasSuffix(lower, ".avif"):
		return "image/avif"
	case strings.HasSuffix(lower, ".bmp"):
		return "image/bmp"
	case strings.HasSuffix(lower, ".svg"):
		return "image/svg+xml"
	default:
		return "image/jpeg"
	}
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
		ext := strings.ToLower(strings.TrimSpace(name[dot+1:]))
		if len(ext) >= 1 && len(ext) <= 8 {
			safe := true
			for i := 0; i < len(ext); i++ {
				c := ext[i]
				if !((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) {
					safe = false
					break
				}
			}
			if safe {
				return ext
			}
		}
	}
	lower := strings.ToLower(contentType)
	switch {
	case strings.Contains(lower, "png"):
		return "png"
	case strings.Contains(lower, "webp"):
		return "webp"
	case strings.Contains(lower, "gif"):
		return "gif"
	case strings.Contains(lower, "avif"):
		return "avif"
	case strings.Contains(lower, "bmp"):
		return "bmp"
	case strings.Contains(lower, "svg"):
		return "svg"
	case strings.Contains(lower, "quicktime"):
		return "mov"
	case strings.Contains(lower, "webm"):
		return "webm"
	case strings.Contains(lower, "video"):
		return "mp4"
	default:
		return "jpg"
	}
}

func mediaKind(video bool) string {
	if video {
		return "video"
	}
	return "image"
}
