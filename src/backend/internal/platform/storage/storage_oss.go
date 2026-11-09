package storage

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
	"time"

	"github.com/aliyun/alibabacloud-oss-go-sdk-v2/oss"
	"github.com/aliyun/alibabacloud-oss-go-sdk-v2/oss/credentials"
	"github.com/aliyun/alibabacloud-oss-go-sdk-v2/oss/signer"

	"beike.local/cloud/src/backend/internal/platform/network"
)

var ossHTTPClient = network.SafeClient

func newOSSClient(config ObjectConfig, options ...func(*oss.Options)) (*oss.Client, error) {
	endpoint := strings.TrimRight(strings.TrimSpace(config.Endpoint), "/")
	if !strings.Contains(endpoint, "://") {
		endpoint = "https://" + endpoint
	}
	parsed, err := url.Parse(endpoint)
	if err != nil || parsed.Hostname() == "" || (parsed.Scheme != "https" && parsed.Scheme != "http") {
		return nil, fmt.Errorf("请填写有效的 OSS 外网 Endpoint")
	}
	region := strings.TrimSpace(config.Region)
	if region == "" || region == "auto" {
		host := strings.ToLower(parsed.Hostname())
		if strings.HasPrefix(host, "oss-") && strings.HasSuffix(host, ".aliyuncs.com") {
			region = strings.TrimSuffix(strings.TrimPrefix(host, "oss-"), ".aliyuncs.com")
			region = strings.TrimSuffix(region, "-internal")
		}
		if region == "" || region == "auto" || region == "accelerate" || region == "accelerate-overseas" {
			return nil, fmt.Errorf("无法识别 OSS 地域，请填写地域 Endpoint，例如 oss-cn-beijing.aliyuncs.com")
		}
	}
	cfg := oss.LoadDefaultConfig().
		WithRegion(region).
		WithEndpoint(endpoint).
		WithHttpClient(ossHTTPClient()).
		WithSignatureVersion(oss.SignatureVersionV4).
		WithCredentialsProvider(credentials.NewStaticCredentialsProvider(config.AccessKeyID, config.SecretAccessKey))
	return oss.NewClient(cfg, options...), nil
}

func putOSS(ctx context.Context, config ObjectConfig, key, contentType string, body []byte) error {
	signing := &ossSigningTrace{Signer: &signer.SignerV4{}}
	client, err := newOSSClient(config, func(options *oss.Options) { options.Signer = signing })
	if err != nil {
		return err
	}
	_, err = client.PutObject(ctx, &oss.PutObjectRequest{
		Bucket:        oss.Ptr(config.BucketName),
		Key:           oss.Ptr(strings.TrimPrefix(key, "/")),
		Body:          bytes.NewReader(body),
		ContentLength: oss.Ptr(int64(len(body))),
		ContentType:   oss.Ptr(contentType),
		CacheControl:  oss.Ptr("public, max-age=31536000, immutable"),
	})
	return signing.explain(err)
}

func deleteOSS(ctx context.Context, config ObjectConfig, key string) error {
	client, err := newOSSClient(config)
	if err != nil {
		return err
	}
	_, err = client.DeleteObject(ctx, &oss.DeleteObjectRequest{
		Bucket: oss.Ptr(config.BucketName),
		Key:    oss.Ptr(strings.TrimPrefix(key, "/")),
	})
	return err
}

// ReferenceObjectURL grants the model temporary read access to private OSS objects.
func ReferenceObjectURL(ctx context.Context, config ObjectConfig, key string) (string, error) {
	if config.Provider != "oss" {
		return PermanentObjectURL(config, key), nil
	}
	client, err := newOSSClient(config)
	if err != nil {
		return "", err
	}
	result, err := client.Presign(ctx, &oss.GetObjectRequest{
		Bucket: oss.Ptr(config.BucketName),
		Key:    oss.Ptr(strings.TrimPrefix(key, "/")),
	}, oss.PresignExpires(24*time.Hour))
	if err != nil {
		return "", err
	}
	return result.URL, nil
}

// A trace belongs to one upload, including its sequential retries. Keep only the
// string to sign, never credentials, authorization headers, or uploaded content.
type ossSigningTrace struct {
	signer.Signer
	stringToSign string
}

func (trace *ossSigningTrace) Sign(ctx context.Context, signing *signer.SigningContext) error {
	err := trace.Signer.Sign(ctx, signing)
	trace.stringToSign = signing.StringToSign
	return err
}

func (trace *ossSigningTrace) explain(err error) error {
	var service *oss.ServiceError
	if !errors.As(err, &service) || service.Code != "SignatureDoesNotMatch" {
		return err
	}
	var detail struct {
		StringToSign string `xml:"StringToSign"`
	}
	if xml.Unmarshal(service.Snapshot, &detail) != nil || detail.StringToSign == "" || trace.stringToSign == "" {
		return err
	}
	server := strings.ReplaceAll(detail.StringToSign, "\r\n", "\n")
	if server == trace.stringToSign {
		return fmt.Errorf("签名核对：客户端与 OSS 的签名原文一致，请核对当前 AccessKey ID 对应的 Secret；%w", err)
	}
	return fmt.Errorf("签名核对：客户端与 OSS 的签名原文不一致，需检查签名配置及网络代理是否改写请求；%w", err)
}

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
