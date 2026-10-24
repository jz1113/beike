package generate

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"os"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/platform/storage"
)

const (
	editImageMaxBytes    = 8 << 20
	editImageSourceLimit = 25 << 20 // Same ceiling as the vision input copy.
)

type imageEditPrepareError struct{ message string }

func (e imageEditPrepareError) Error() string { return e.message }

type editImageFile struct {
	filename string
	mime     string
	data     []byte
}

func isImageEditEndpoint(endpoint string) bool {
	path := strings.SplitN(endpoint, "?", 2)[0]
	return strings.HasSuffix(path, "/v1/images/edits")
}

func postImageEdit(ctx context.Context, endpoint, apiKey string, payload map[string]any, workspace string, production bool, timeout time.Duration) (int, []byte, error) {
	requestCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	body, contentType, err := buildImageEditBody(requestCtx, payload, workspace, production)
	if err != nil {
		return 0, nil, err
	}
	request, err := http.NewRequestWithContext(requestCtx, http.MethodPost, endpoint, body)
	if err != nil {
		return 0, nil, err
	}
	request.Header.Set("Content-Type", contentType)
	if apiKey != "" {
		request.Header.Set("Authorization", "Bearer "+apiKey)
	}
	response, err := ModelHTTP().Do(request)
	if err != nil {
		return 0, nil, err
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, 32<<20))
	return response.StatusCode, raw, err
}

func buildImageEditBody(ctx context.Context, payload map[string]any, workspace string, production bool) (*bytes.Reader, string, error) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for _, key := range []string{"model", "prompt", "size", "quality"} {
		if text := payloadText(payload[key]); text != "" {
			if err := writer.WriteField(key, text); err != nil {
				return nil, "", imageEditPrepareError{"图像编辑请求组装失败"}
			}
		}
	}
	refs := payloadImageRefs(payload["image"])
	if len(refs) == 0 {
		return nil, "", imageEditPrepareError{"图像编辑缺少参考图"}
	}
	for index, ref := range refs {
		file, err := loadEditImage(ctx, ref, index, workspace, production)
		if err != nil {
			var prepare imageEditPrepareError
			if errors.As(err, &prepare) {
				return nil, "", err
			}
			return nil, "", imageEditPrepareError{fmt.Sprintf("第 %d 张参考图无法读取：%s", index+1, err.Error())}
		}
		header := make(textproto.MIMEHeader)
		header.Set("Content-Disposition", fmt.Sprintf(`form-data; name="%s"; filename="%s"`, editImageField(payload, len(refs)), file.filename))
		header.Set("Content-Type", file.mime)
		part, err := writer.CreatePart(header)
		if err != nil {
			return nil, "", imageEditPrepareError{"图像编辑请求组装失败"}
		}
		if _, err := part.Write(file.data); err != nil {
			return nil, "", imageEditPrepareError{"图像编辑请求组装失败"}
		}
	}
	if err := writer.Close(); err != nil {
		return nil, "", imageEditPrepareError{"图像编辑请求组装失败"}
	}
	return bytes.NewReader(body.Bytes()), writer.FormDataContentType(), nil
}

func normalizeImageRef(ref string) string {
	ref = strings.TrimSpace(ref)
	if strings.HasPrefix(ref, "//") {
		return "https:" + ref
	}
	return ref
}

func loadEditImage(ctx context.Context, ref string, index int, workspace string, production bool) (editImageFile, error) {
	ref = normalizeImageRef(ref)
	var file editImageFile
	var err error
	switch {
	case strings.HasPrefix(strings.ToLower(ref), "data:image/"):
		file, err = decodeDataImage(ctx, ref)
	case strings.HasPrefix(ref, "https://") || strings.HasPrefix(ref, "http://"):
		file, err = downloadEditImage(ctx, ref)
	case strings.HasPrefix(ref, "/storage/"):
		file, err = readStorageImage(ctx, ref, workspace, production)
	default:
		err = errors.New("不支持的参考图地址")
	}
	if err != nil {
		return editImageFile{}, imageEditPrepareError{fmt.Sprintf("第 %d 张参考图无法读取：%s", index+1, err.Error())}
	}
	if index > 0 {
		file.filename = fmt.Sprintf("image-%d%s", index+1, fileExt(file.filename))
	}
	return file, nil
}

func decodeDataImage(ctx context.Context, ref string) (editImageFile, error) {
	comma := strings.Index(ref, ",")
	if comma < 0 || !strings.Contains(strings.ToLower(ref[:comma]), ";base64") {
		return editImageFile{}, errors.New("不是有效的图片数据")
	}
	raw, err := base64.StdEncoding.DecodeString(ref[comma+1:])
	if err != nil {
		raw, err = base64.RawStdEncoding.DecodeString(strings.TrimRight(ref[comma+1:], "="))
	}
	if err != nil || len(raw) == 0 {
		return editImageFile{}, errors.New("不是有效的图片数据")
	}
	meta := ref[len("data:"):comma]
	if semi := strings.Index(meta, ";"); semi >= 0 {
		meta = meta[:semi]
	}
	return bytesToEditImage(ctx, meta, raw)
}

func downloadEditImage(ctx context.Context, ref string) (editImageFile, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, ref, nil)
	if err != nil {
		return editImageFile{}, errors.New("参考图下载失败")
	}
	response, err := ModelHTTP().Do(request)
	if err != nil {
		return editImageFile{}, errors.New("参考图下载失败")
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return editImageFile{}, errors.New("参考图下载失败")
	}
	raw, err := io.ReadAll(io.LimitReader(response.Body, editImageSourceLimit+1))
	if err != nil {
		return editImageFile{}, errors.New("参考图下载失败")
	}
	return bytesToEditImage(ctx, response.Header.Get("Content-Type"), raw)
}

func readStorageImage(ctx context.Context, ref, workspace string, production bool) (editImageFile, error) {
	rel := strings.TrimPrefix(ref, "/storage/")
	rel = strings.SplitN(rel, "?", 2)[0]
	rel = strings.SplitN(rel, "#", 2)[0]
	decoded := rel
	for range 2 {
		next, err := url.PathUnescape(decoded)
		if err != nil {
			return editImageFile{}, errors.New("无权读取该参考图")
		}
		decoded = next
	}
	if workspace == "" || !storage.WorkspaceRel(decoded, workspace, !production) {
		return editImageFile{}, errors.New("无权读取该参考图")
	}
	path := storage.StoredFile(decoded)
	if path == "" {
		return editImageFile{}, errors.New("本地参考图不存在")
	}
	file, err := os.Open(path)
	if err != nil {
		return editImageFile{}, errors.New("本地参考图不存在")
	}
	defer file.Close()
	raw, err := io.ReadAll(io.LimitReader(file, editImageSourceLimit+1))
	if err != nil {
		return editImageFile{}, errors.New("本地参考图不存在")
	}
	return bytesToEditImage(ctx, storageMIME(path), raw)
}

func bytesToEditImage(ctx context.Context, header string, raw []byte) (editImageFile, error) {
	if len(raw) == 0 {
		return editImageFile{}, errors.New("不是有效的图片数据")
	}
	if len(raw) > editImageSourceLimit {
		return editImageFile{}, errors.New("参考图超过 25MB")
	}
	mimeType, ext, ok := imageMIME(header, raw)
	if !ok {
		return editImageFile{}, errors.New("请使用 PNG、JPEG 或 WebP")
	}
	if len(raw) <= editImageMaxBytes {
		return editImageFile{filename: "image" + ext, mime: mimeType, data: raw}, nil
	}
	// The edit payload stays within 8MB. This copy is not written back over the saved image.
	fitted, fittedType, err := gateway.CompressUploadImage(ctx, raw, mimeType, editImageMaxBytes)
	if err != nil {
		var imageErr *gateway.TextImageError
		if errors.As(err, &imageErr) && imageErr.Kind == "size" {
			return editImageFile{}, errors.New("参考图超过 8MB")
		}
		return editImageFile{}, errors.New("不是有效的图片数据")
	}
	return editImageFile{filename: "image.jpg", mime: fittedType, data: fitted}, nil
}

func imageMIME(header string, data []byte) (string, string, bool) {
	media := strings.ToLower(strings.TrimSpace(strings.Split(header, ";")[0]))
	switch media {
	case "image/png":
		return "image/png", ".png", true
	case "image/jpeg", "image/jpg":
		return "image/jpeg", ".jpg", true
	case "image/webp":
		return "image/webp", ".webp", true
	}
	switch {
	case bytes.HasPrefix(data, []byte{0x89, 'P', 'N', 'G'}):
		return "image/png", ".png", true
	case len(data) >= 3 && data[0] == 0xff && data[1] == 0xd8 && data[2] == 0xff:
		return "image/jpeg", ".jpg", true
	case len(data) >= 12 && string(data[:4]) == "RIFF" && string(data[8:12]) == "WEBP":
		return "image/webp", ".webp", true
	default:
		return "", "", false
	}
}

func storageMIME(path string) string {
	lower := strings.ToLower(path)
	switch {
	case strings.HasSuffix(lower, ".png"):
		return "image/png"
	case strings.HasSuffix(lower, ".jpg"), strings.HasSuffix(lower, ".jpeg"):
		return "image/jpeg"
	case strings.HasSuffix(lower, ".webp"):
		return "image/webp"
	default:
		return ""
	}
}

// OpenAI documents multiple edit inputs as image[]. Repeating a single image field drops every file after the first.
func editImageField(payload map[string]any, count int) string {
	model := payloadText(payload["model"])
	if model == "openai/gpt-image-2" || (count > 1 && isGptImageModel(model)) {
		return "image[]"
	}
	return "image"
}

func payloadText(value any) string {
	text, _ := value.(string)
	return strings.TrimSpace(text)
}

func payloadImageRefs(value any) []string {
	switch typed := value.(type) {
	case []string:
		var out []string
		for _, item := range typed {
			if text := strings.TrimSpace(item); text != "" {
				out = append(out, text)
			}
		}
		return out
	case string:
		if text := strings.TrimSpace(typed); text != "" {
			return []string{text}
		}
	}
	return nil
}

func fileExt(name string) string {
	if dot := strings.LastIndex(name, "."); dot >= 0 {
		return name[dot:]
	}
	return ""
}
