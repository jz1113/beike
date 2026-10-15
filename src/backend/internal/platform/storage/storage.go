package storage

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type ObjectConfig struct {
	Enabled         bool   `json:"enabled"`
	PersistResults  bool   `json:"persistResults"`
	Provider        string `json:"provider"`
	AccountID       string `json:"accountId"`
	Endpoint        string `json:"endpoint"`
	AccessKeyID     string `json:"accessKeyId"`
	SecretAccessKey string `json:"secretAccessKey"`
	BucketName      string `json:"bucketName"`
	PublicDomain    string `json:"publicDomain"`
	Region          string `json:"region"`
	ApiPrefix       string `json:"apiPrefix"`
	MaterialsPrefix string `json:"materialsPrefix"`
	CloudName       string `json:"cloudName"`
	Zone            string `json:"zone"`
}

type ObjectStore interface {
	Put(ctx context.Context, config ObjectConfig, key, contentType string, body []byte) error
	Delete(ctx context.Context, config ObjectConfig, key string) error
}

var Objects ObjectStore = defaultObjectStore{}

type defaultObjectStore struct{}

func QiniuZoneEndpoint(zone string) string {
	switch strings.ToLower(strings.TrimSpace(zone)) {
	case "z0":
		return "https://s3-cn-east-1.qiniucs.com"
	case "cn-east-2":
		return "https://s3-cn-east-2.qiniucs.com"
	case "z1":
		return "https://s3-cn-north-1.qiniucs.com"
	case "z2":
		return "https://s3-cn-south-1.qiniucs.com"
	case "na0":
		return "https://s3-us-north-1.qiniucs.com"
	case "as0":
		return "https://s3-ap-southeast-1.qiniucs.com"
	case "ap-northeast-1":
		return "https://s3-ap-northeast-1.qiniucs.com"
	default:
		return "https://s3-cn-south-1.qiniucs.com"
	}
}

func QiniuZoneRegion(zone string) string {
	switch strings.ToLower(strings.TrimSpace(zone)) {
	case "z0":
		return "cn-east-1"
	case "cn-east-2":
		return "cn-east-2"
	case "z1":
		return "cn-north-1"
	case "z2":
		return "cn-south-1"
	case "na0":
		return "us-north-1"
	case "as0":
		return "ap-southeast-1"
	case "ap-northeast-1":
		return "ap-northeast-1"
	default:
		return "cn-south-1"
	}
}

func newS3Client(config ObjectConfig) *s3.Client {
	region := config.Region
	if config.Provider == "qiniu" && (region == "" || region == "auto") {
		region = QiniuZoneRegion(config.Zone)
	} else if region == "" {
		region = "auto"
	}
	opts := s3.Options{
		Region:       region,
		Credentials:  credentials.NewStaticCredentialsProvider(config.AccessKeyID, config.SecretAccessKey, ""),
		UsePathStyle: config.Provider == "minio" || config.Provider == "supabase",
	}
	endpoint := config.Endpoint
	if config.Provider == "qiniu" && endpoint == "" {
		endpoint = QiniuZoneEndpoint(config.Zone)
	}
	if endpoint != "" {
		if !strings.HasPrefix(endpoint, "http://") && !strings.HasPrefix(endpoint, "https://") {
			endpoint = "https://" + endpoint
		}
		opts.BaseEndpoint = aws.String(endpoint)
	}
	return s3.New(opts)
}

func (defaultObjectStore) Put(ctx context.Context, config ObjectConfig, key, contentType string, body []byte) error {
	if config.Provider == "cloudinary" {
		return putCloudinary(ctx, config, key, contentType, body)
	}
	client := newS3Client(config)
	cleanKey := strings.TrimPrefix(key, "/")
	input := &s3.PutObjectInput{
		Bucket:       aws.String(config.BucketName),
		Key:          aws.String(cleanKey),
		Body:         bytes.NewReader(body),
		ContentType:  aws.String(contentType),
		CacheControl: aws.String("public, max-age=31536000, immutable"),
	}
	_, err := client.PutObject(ctx, input)
	return err
}

func (defaultObjectStore) Delete(ctx context.Context, config ObjectConfig, key string) error {
	if config.Provider == "cloudinary" {
		return deleteCloudinary(ctx, config, key)
	}
	client := newS3Client(config)
	cleanKey := strings.TrimPrefix(key, "/")
	input := &s3.DeleteObjectInput{
		Bucket: aws.String(config.BucketName),
		Key:    aws.String(cleanKey),
	}
	_, err := client.DeleteObject(ctx, input)
	return err
}

func ProbeObjectStore(ctx context.Context, config ObjectConfig) (string, error) {
	prefix := strings.Trim(config.ApiPrefix, "/")
	if prefix == "" {
		prefix = strings.Trim(config.MaterialsPrefix, "/")
	}
	if prefix == "" {
		prefix = "seedance"
	}
	testKey := fmt.Sprintf("%s/health_check_%d.txt", prefix, time.Now().UnixMilli())
	body := []byte(fmt.Sprintf("Cloud Storage Health Check - %s", time.Now().UTC().Format(time.RFC3339)))
	if err := Objects.Put(ctx, config, testKey, "text/plain", body); err != nil {
		return "", err
	}
	_ = Objects.Delete(ctx, config, testKey)
	return PermanentObjectURL(config, testKey), nil
}

func PermanentObjectURL(config ObjectConfig, key string) string {
	cleanKey := strings.TrimPrefix(key, "/")

	if domain := strings.TrimRight(config.PublicDomain, "/"); domain != "" {
		if !strings.HasPrefix(domain, "http://") && !strings.HasPrefix(domain, "https://") {
			domain = "https://" + domain
		}
		return domain + "/" + cleanKey
	}

	if config.Provider == "cloudinary" {
		cloudName := strings.TrimSpace(config.CloudName)
		return fmt.Sprintf("https://res.cloudinary.com/%s/image/upload/%s", cloudName, cleanKey)
	}

	if config.Provider == "oss" && config.Endpoint != "" {
		ep := strings.TrimPrefix(strings.TrimPrefix(config.Endpoint, "https://"), "http://")
		ep = strings.TrimRight(ep, "/")
		return fmt.Sprintf("https://%s.%s/%s", config.BucketName, ep, cleanKey)
	}

	endpoint := config.Endpoint
	if config.Provider == "qiniu" && endpoint == "" {
		endpoint = QiniuZoneEndpoint(config.Zone)
	}
	if endpoint != "" {
		ep := strings.TrimRight(endpoint, "/")
		if !strings.HasPrefix(ep, "http://") && !strings.HasPrefix(ep, "https://") {
			ep = "https://" + ep
		}
		return fmt.Sprintf("%s/%s/%s", ep, config.BucketName, cleanKey)
	}
	return fmt.Sprintf("https://%s.s3.amazonaws.com/%s", config.BucketName, cleanKey)
}

func ResolveObjectConfig(custom map[string]any) *ObjectConfig {
	cfg := &ObjectConfig{
		Enabled:         envBool("STORAGE_ENABLED", true),
		PersistResults:  envBool("STORAGE_PERSIST_RESULTS", false),
		Provider:        envString("STORAGE_PROVIDER", "oss"),
		AccountID:       envString("R2_ACCOUNT_ID", envString("CLOUDFLARE_ACCOUNT_ID", "")),
		Endpoint:        envString("S3_ENDPOINT", ""),
		AccessKeyID:     envString("S3_ACCESS_KEY_ID", envString("R2_ACCESS_KEY_ID", "")),
		SecretAccessKey: envString("S3_SECRET_ACCESS_KEY", envString("R2_SECRET_ACCESS_KEY", "")),
		BucketName:      envString("S3_BUCKET_NAME", envString("S3_BUCKET", envString("R2_BUCKET_NAME", ""))),
		PublicDomain:    envString("S3_PUBLIC_DOMAIN", envString("R2_PUBLIC_DOMAIN", "")),
		Region:          envString("S3_REGION", "auto"),
		ApiPrefix:       envString("STORAGE_API_PREFIX", "seedance/"),
		MaterialsPrefix: envString("STORAGE_MATERIALS_PREFIX", "canvas-materials/"),
		CloudName:       envString("CLOUDINARY_CLOUD_NAME", ""),
		Zone:            envString("QINIU_ZONE", "z2"),
	}

	if custom != nil {
		if v, ok := custom["enabled"].(bool); ok {
			cfg.Enabled = v
		}
		if v, ok := custom["persistResults"].(bool); ok {
			cfg.PersistResults = v
		}
		if v, ok := custom["provider"].(string); ok && v != "" {
			cfg.Provider = v
		}
		if v, ok := custom["accountId"].(string); ok && v != "" {
			cfg.AccountID = strings.TrimSpace(v)
		}
		if v, ok := custom["endpoint"].(string); ok && v != "" {
			cfg.Endpoint = strings.TrimSpace(v)
		}
		if v, ok := custom["accessKeyId"].(string); ok && v != "" {
			cfg.AccessKeyID = strings.TrimSpace(v)
		}
		if v, ok := custom["secretAccessKey"].(string); ok && v != "" {
			cfg.SecretAccessKey = strings.TrimSpace(v)
		}
		if v, ok := custom["bucketName"].(string); ok && v != "" {
			cfg.BucketName = strings.TrimSpace(v)
		}
		if v, ok := custom["publicDomain"].(string); ok && v != "" {
			cfg.PublicDomain = strings.TrimSpace(v)
		}
		if v, ok := custom["region"].(string); ok && v != "" {
			cfg.Region = strings.TrimSpace(v)
		}
		if v, ok := custom["apiPrefix"].(string); ok && v != "" {
			cfg.ApiPrefix = strings.TrimSpace(v)
		}
		if v, ok := custom["materialsPrefix"].(string); ok && v != "" {
			cfg.MaterialsPrefix = strings.TrimSpace(v)
		}
		if v, ok := custom["cloudName"].(string); ok && v != "" {
			cfg.CloudName = strings.TrimSpace(v)
		}
		if v, ok := custom["zone"].(string); ok && v != "" {
			cfg.Zone = strings.TrimSpace(v)
		}
	}

	if cfg.Provider == "r2" && cfg.AccountID != "" && cfg.Endpoint == "" {
		cfg.Endpoint = fmt.Sprintf("https://%s.r2.cloudflarestorage.com", cfg.AccountID)
	}
	if cfg.Provider == "qiniu" && cfg.Endpoint == "" {
		cfg.Endpoint = QiniuZoneEndpoint(cfg.Zone)
	}

	if cfg.Provider == "cloudinary" {
		if cfg.CloudName == "" || cfg.AccessKeyID == "" || cfg.SecretAccessKey == "" {
			return nil
		}
		return cfg
	}

	if cfg.AccessKeyID == "" || cfg.SecretAccessKey == "" || cfg.BucketName == "" {
		return nil
	}
	return cfg
}

func envString(key, fallback string) string {
	if val := strings.TrimSpace(os.Getenv(key)); val != "" {
		return val
	}
	return fallback
}

func envBool(key string, fallback bool) bool {
	val := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	if val == "true" || val == "1" {
		return true
	}
	if val == "false" || val == "0" {
		return false
	}
	return fallback
}
