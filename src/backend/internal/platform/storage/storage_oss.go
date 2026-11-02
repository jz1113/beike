package storage

import (
	"bytes"
	"context"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/aliyun/alibabacloud-oss-go-sdk-v2/oss"
	"github.com/aliyun/alibabacloud-oss-go-sdk-v2/oss/credentials"
	"github.com/aliyun/alibabacloud-oss-go-sdk-v2/oss/signer"
)

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
