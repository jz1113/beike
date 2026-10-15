package assets

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"mime"
	"mime/multipart"
	"strings"

	"beike.local/cloud/src/backend/internal/platform/storage"
)

func uploadWithObjectStore(ctx context.Context, contentType string, raw []byte) ([]string, bool) {
	config := storage.ResolveObjectConfig(uploadCustomConfig(contentType, raw))
	if config == nil || !config.PersistResults {
		return nil, false
	}
	urls, err := putUploadedObjects(ctx, *config, contentType, raw)
	if err != nil || len(urls) == 0 {
		return nil, false
	}
	return urls, true
}

func putUploadedObjects(ctx context.Context, config storage.ObjectConfig, contentType string, raw []byte) ([]string, error) {
	if strings.Contains(contentType, "multipart/form-data") {
		return putMultipartObjects(ctx, config, contentType, raw)
	}
	var payload map[string]any
	if json.Unmarshal(raw, &payload) != nil {
		return nil, osErrInvalid()
	}
	category, _ := payload["category"].(string)
	values := []string{}
	if text, ok := payload["dataUrl"].(string); ok && text != "" {
		values = append(values, text)
	}
	if list, ok := payload["dataUrls"].([]any); ok {
		for _, item := range list {
			if text, ok := item.(string); ok && text != "" {
				values = append(values, text)
			}
		}
	}
	urls := []string{}
	for _, value := range values {
		match := dataURLPattern.FindStringSubmatch(value)
		if match == nil {
			return nil, osErrInvalid()
		}
		body, err := base64.StdEncoding.DecodeString(match[2])
		if err != nil {
			return nil, err
		}
		url, err := putObjectBytes(ctx, config, body, match[1], category, "")
		if err != nil {
			return nil, err
		}
		urls = append(urls, url)
	}
	return urls, nil
}

func putMultipartObjects(ctx context.Context, config storage.ObjectConfig, contentType string, raw []byte) ([]string, error) {
	_, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		return nil, err
	}
	form, err := multipart.NewReader(bytes.NewReader(raw), params["boundary"]).ReadForm(32 << 20)
	if err != nil {
		return nil, err
	}
	defer form.RemoveAll()
	category := "generated/images"
	if values := form.Value["category"]; len(values) > 0 && values[0] != "" {
		category = values[0]
	}
	urls := []string{}
	for _, files := range form.File {
		for _, file := range files {
			opened, err := file.Open()
			if err != nil {
				return nil, err
			}
			body, err := io.ReadAll(opened)
			opened.Close()
			if err != nil {
				return nil, err
			}
			url, err := putObjectBytes(ctx, config, body, file.Header.Get("Content-Type"), category, storedFilename(file.Header.Get("Content-Type"), file.Filename))
			if err != nil {
				return nil, err
			}
			urls = append(urls, url)
		}
	}
	return urls, nil
}

func putObjectBytes(ctx context.Context, config storage.ObjectConfig, body []byte, contentType, category, filename string) (string, error) {
	ext := localExtension(contentType, filename)
	if category == "" {
		category = "generated/images"
		if strings.Contains(contentType, "video") {
			category = "generated/videos"
		}
	}
	key := storage.ObjectKeyWithConfig(config, category, ext, filename)
	if err := storage.Objects.Put(ctx, config, key, contentType, body); err != nil {
		return "", err
	}
	return storage.PermanentObjectURL(config, key), nil
}

func uploadCustomConfig(contentType string, raw []byte) map[string]any {
	if strings.Contains(contentType, "multipart/form-data") {
		_, params, err := mime.ParseMediaType(contentType)
		if err != nil {
			return nil
		}
		form, err := multipart.NewReader(bytes.NewReader(raw), params["boundary"]).ReadForm(1 << 20)
		if err != nil {
			return nil
		}
		defer form.RemoveAll()
		if values := form.Value["customConfig"]; len(values) > 0 {
			return parseConfig(values[0])
		}
		return nil
	}
	var payload map[string]any
	if json.Unmarshal(raw, &payload) != nil {
		return nil
	}
	custom, _ := payload["customConfig"].(map[string]any)
	return custom
}

func osErrInvalid() error { return errInvalidDataURL }

type invalidDataURL struct{}

func (invalidDataURL) Error() string { return "无效的 data URL" }

var errInvalidDataURL invalidDataURL

func probeObjectConfig(config map[string]any) *storage.ObjectConfig {
	if config == nil {
		config = map[string]any{}
	}
	cloned := map[string]any{}
	for key, value := range config {
		cloned[key] = value
	}
	cloned["persistResults"] = false
	return storage.ResolveObjectConfig(cloned)
}
