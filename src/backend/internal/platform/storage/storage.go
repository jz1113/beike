package storage

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
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
}

type ObjectStore interface {
	Put(ctx context.Context, config ObjectConfig, key, contentType string, body []byte) error
	Delete(ctx context.Context, config ObjectConfig, key string) error
}

var Objects ObjectStore = defaultObjectStore{}

type defaultObjectStore struct{}

func newS3Client(config ObjectConfig) *s3.Client {
	region := config.Region
	if region == "" {
		region = "auto"
	}
	opts := s3.Options{
		Region:       region,
		Credentials:  credentials.NewStaticCredentialsProvider(config.AccessKeyID, config.SecretAccessKey, ""),
		UsePathStyle: config.Provider == "minio" || config.Provider == "supabase",
	}
	if config.Endpoint != "" {
		endpoint := config.Endpoint
		if !strings.HasPrefix(endpoint, "http://") && !strings.HasPrefix(endpoint, "https://") {
			endpoint = "https://" + endpoint
		}
		opts.BaseEndpoint = aws.String(endpoint)
	}
	return s3.New(opts)
}

func (defaultObjectStore) Put(ctx context.Context, config ObjectConfig, key, contentType string, body []byte) error {
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
	testKey := fmt.Sprintf("azhuo/health_check_%d.txt", time.Now().UnixMilli())
	body := []byte(fmt.Sprintf("Azhuo Studio Cloud Storage Health Check - %s", time.Now().UTC().Format(time.RFC3339)))
	if err := Objects.Put(ctx, config, testKey, "text/plain", body); err != nil {
		return "", err
	}
	_ = Objects.Delete(ctx, config, testKey)
	return PermanentObjectURL(config, testKey), nil
}

func PermanentObjectURL(config ObjectConfig, key string) string {
	cleanKey := strings.TrimPrefix(key, "/")
	if domain := strings.TrimRight(config.PublicDomain, "/"); domain != "" {
		return domain + "/" + cleanKey
	}
	if config.Provider == "oss" && config.Endpoint != "" {
		ep := strings.TrimPrefix(strings.TrimPrefix(config.Endpoint, "https://"), "http://")
		ep = strings.TrimRight(ep, "/")
		return fmt.Sprintf("https://%s.%s/%s", config.BucketName, ep, cleanKey)
	}
	if config.Endpoint != "" {
		ep := strings.TrimRight(config.Endpoint, "/")
		return fmt.Sprintf("%s/%s/%s", ep, config.BucketName, cleanKey)
	}
	return fmt.Sprintf("https://%s.s3.amazonaws.com/%s", config.BucketName, cleanKey)
}

func ObjectKey(category, ext, filename string) string {
	if filename != "" {
		clean := filepath.Base(filename)
		if clean != "." && clean != "/" && clean != "\\" {
			now := time.Now()
			yearMonth := fmt.Sprintf("%d%02d", now.Year(), now.Month())
			return fmt.Sprintf("azhuo/%s/%s/%s", category, yearMonth, clean)
		}
	}
	prefix := "gen_img"
	switch category {
	case "products":
		prefix = "prod"
	case "external":
		prefix = "ext"
	case "generated/videos", "videos":
		prefix = "gen_vid"
	case "generated/images", "images":
		prefix = "gen_img"
	case "assets":
		prefix = "asset"
	case "refs":
		prefix = "ref"
	}
	now := time.Now()
	yearMonth := fmt.Sprintf("%d%02d", now.Year(), now.Month())
	randomSuffix := randomHex(3)
	cleanExt := strings.TrimPrefix(ext, ".")
	if cleanExt == "" {
		cleanExt = "png"
	}
	name := fmt.Sprintf("azhuo_%s_%d_%s.%s", prefix, now.UnixMilli(), randomSuffix, cleanExt)
	return fmt.Sprintf("azhuo/%s/%s/%s", category, yearMonth, name)
}

func randomHex(bytesLen int) string {
	b := make([]byte, bytesLen)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("%x", time.Now().UnixNano())[:bytesLen*2]
	}
	return hex.EncodeToString(b)
}

func ResolveObjectConfig(custom map[string]any) *ObjectConfig {
	cfg := &ObjectConfig{
		Enabled:         envBool("STORAGE_ENABLED", true),
		PersistResults:  envBool("STORAGE_PERSIST_RESULTS", false),
		Provider:        envString("STORAGE_PROVIDER", "r2"),
		AccountID:       envString("R2_ACCOUNT_ID", envString("CLOUDFLARE_ACCOUNT_ID", "")),
		Endpoint:        envString("S3_ENDPOINT", ""),
		AccessKeyID:     envString("S3_ACCESS_KEY_ID", envString("R2_ACCESS_KEY_ID", "")),
		SecretAccessKey: envString("S3_SECRET_ACCESS_KEY", envString("R2_SECRET_ACCESS_KEY", "")),
		BucketName:      envString("S3_BUCKET_NAME", envString("S3_BUCKET", envString("R2_BUCKET_NAME", ""))),
		PublicDomain:    envString("S3_PUBLIC_DOMAIN", envString("R2_PUBLIC_DOMAIN", "")),
		Region:          envString("S3_REGION", "auto"),
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
	}

	if cfg.Provider == "r2" && cfg.AccountID != "" && cfg.Endpoint == "" {
		cfg.Endpoint = fmt.Sprintf("https://%s.r2.cloudflarestorage.com", cfg.AccountID)
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
	val := strings.TrimSpace(os.Getenv(key))
	if val == "true" || val == "1" {
		return true
	}
	if val == "false" || val == "0" {
		return false
	}
	return fallback
}

func ResolveRoot() string {
	if cache := strings.TrimSpace(os.Getenv("AZHUO_CACHE_DIR")); cache != "" {
		return cache
	}
	if data := strings.TrimSpace(os.Getenv("AZHUO_DATA_DIR")); data != "" {
		return filepath.Join(data, "storage")
	}
	if raw := strings.TrimSpace(os.Getenv("DATABASE_URL")); strings.HasPrefix(raw, "file:") {
		dbPath := strings.TrimPrefix(raw, "file:")
		dbPath = strings.TrimPrefix(dbPath, "//")
		abs, err := filepath.Abs(dbPath)
		if err == nil {
			return filepath.Join(filepath.Dir(abs), "storage")
		}
	}
	appData := defaultAppStorageDir()
	if _, err := os.Stat(filepath.Dir(appData)); err == nil {
		return appData
	}
	return filepath.Join(os.TempDir(), "beike-workbench", "storage")
}

func defaultAppStorageDir() string {
	home, _ := os.UserHomeDir()
	appData := os.Getenv("APPDATA")
	if appData == "" {
		appData = filepath.Join(home, "AppData", "Roaming")
	}
	return filepath.Join(appData, "com.azhuo.workbench", "storage")
}

func SafeWithin(root, rel string) string {
	if rel == "" || strings.Contains(rel, "..") {
		return ""
	}
	for _, c := range rel {
		if c < 32 {
			return ""
		}
	}
	cleanRel := filepath.Clean(rel)
	if filepath.IsAbs(cleanRel) || (len(cleanRel) > 1 && cleanRel[1] == ':') {
		return ""
	}
	abs := filepath.Join(root, cleanRel)
	realRoot, err := filepath.Abs(root)
	if err != nil {
		realRoot = root
	}
	realAbs, err := filepath.Abs(abs)
	if err != nil {
		return ""
	}
	if !strings.HasPrefix(realAbs, realRoot+string(filepath.Separator)) && realAbs != realRoot {
		return ""
	}
	return realAbs
}

func StoredFile(rel string) string {
	roots := []string{ResolveRoot()}
	cwd, err := os.Getwd()
	if err == nil {
		roots = append(roots, filepath.Join(cwd, ".azhuo_storage"))
	}
	for _, root := range roots {
		candidate := SafeWithin(root, rel)
		if candidate != "" {
			if stat, err := os.Stat(candidate); err == nil && !stat.IsDir() {
				return candidate
			}
		}
	}
	return ""
}

func WorkspaceKey(rel, workspace string) string {
	prefix := workspace
	clean := strings.TrimPrefix(rel, "/")
	if clean == prefix || strings.HasPrefix(clean, prefix+"/") {
		return clean
	}
	return prefix + "/" + clean
}

var hex64Regex = regexp.MustCompile(`^[a-f0-9]{64}$`)

func WorkspaceRel(rel, workspace string, legacy bool) bool {
	clean := strings.TrimPrefix(rel, "/")
	if clean == workspace || strings.HasPrefix(clean, workspace+"/") {
		return true
	}
	if legacy && workspace == "local" {
		parts := strings.Split(clean, "/")
		if len(parts) > 0 {
			first := parts[0]
			if hex64Regex.MatchString(first) || first == "official" || first == "legacy" {
				return false
			}
			return true
		}
	}
	return false
}

func ManagedKey(raw string, config *ObjectConfig) string {
	if raw == "" {
		return ""
	}
	if strings.HasPrefix(raw, "/storage/") {
		key := strings.TrimPrefix(raw, "/storage/")
		if idx := strings.IndexAny(key, "?#"); idx != -1 {
			key = key[:idx]
		}
		if strings.HasPrefix(key, "azhuo/") {
			return key
		}
	}
	if strings.HasPrefix(raw, "azhuo/") || strings.HasPrefix(raw, "/azhuo/") {
		key := strings.TrimPrefix(raw, "/")
		if idx := strings.IndexAny(key, "?#"); idx != -1 {
			key = key[:idx]
		}
		return key
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	path := strings.TrimPrefix(parsed.Path, "/")
	if strings.HasPrefix(path, "azhuo/") {
		return path
	}
	if config != nil && config.BucketName != "" && strings.HasPrefix(path, config.BucketName+"/azhuo/") {
		return strings.TrimPrefix(path, config.BucketName+"/")
	}
	return ""
}

var permanentSuffixes = []string{"r2.dev", "aliyuncs.com", "myqcloud.com", "amazonaws.com", "amazonaws.com.cn"}
var tempQueryKeys = map[string]bool{
	"signature": true, "sig": true, "sign": true, "expires": true, "token": true,
	"x-amz-signature": true, "x-oss-signature": true, "q-signature": true,
}

func AlreadyPermanent(rawURL, publicDomain string) bool {
	if rawURL == "" {
		return false
	}
	if strings.HasPrefix(rawURL, "/storage/") {
		return true
	}
	parsed, err := url.Parse(rawURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return false
	}
	query := parsed.Query()
	for k := range query {
		if tempQueryKeys[strings.ToLower(k)] {
			return false
		}
	}
	if publicDomain != "" {
		if base, err := url.Parse(publicDomain); err == nil {
			if parsed.Host == base.Host {
				return true
			}
		}
	}
	for _, suffix := range permanentSuffixes {
		if parsed.Host == suffix || strings.HasSuffix(parsed.Host, "."+suffix) {
			return true
		}
	}
	return false
}
