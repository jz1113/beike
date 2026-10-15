package storage

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strings"
	"time"
)

func putCloudinary(ctx context.Context, config ObjectConfig, key, contentType string, body []byte) error {
	cloudName := strings.TrimSpace(config.CloudName)
	if cloudName == "" {
		return errors.New("Cloudinary 缺少 Cloud Name")
	}
	apiURL := fmt.Sprintf("https://api.cloudinary.com/v1_1/%s/auto/upload", cloudName)

	var reqBody bytes.Buffer
	writer := multipart.NewWriter(&reqBody)

	cleanKey := strings.TrimPrefix(key, "/")
	ext := filepath.Ext(cleanKey)
	filename := filepath.Base(cleanKey)
	if filename == "" || filename == "." {
		filename = "upload.png"
	}

	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return err
	}
	if _, err := part.Write(body); err != nil {
		return err
	}

	publicID := strings.TrimSuffix(cleanKey, ext)
	if publicID != "" {
		_ = writer.WriteField("public_id", publicID)
	}

	if err := writer.Close(); err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, &reqBody)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	auth := base64.StdEncoding.EncodeToString([]byte(config.AccessKeyID + ":" + config.SecretAccessKey))
	req.Header.Set("Authorization", "Basic "+auth)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		respBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return fmt.Errorf("Cloudinary 上传失败 (HTTP %d): %s", resp.StatusCode, string(respBytes))
	}
	return nil
}

func deleteCloudinary(ctx context.Context, config ObjectConfig, key string) error {
	cloudName := strings.TrimSpace(config.CloudName)
	if cloudName == "" {
		return nil
	}
	apiURL := fmt.Sprintf("https://api.cloudinary.com/v1_1/%s/image/destroy", cloudName)
	cleanKey := strings.TrimPrefix(key, "/")
	publicID := strings.TrimSuffix(cleanKey, filepath.Ext(cleanKey))

	var reqBody bytes.Buffer
	writer := multipart.NewWriter(&reqBody)
	_ = writer.WriteField("public_id", publicID)
	_ = writer.Close()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, &reqBody)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	auth := base64.StdEncoding.EncodeToString([]byte(config.AccessKeyID + ":" + config.SecretAccessKey))
	req.Header.Set("Authorization", "Basic "+auth)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}
