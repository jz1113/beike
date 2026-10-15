package storage

import (
	"context"
	"strings"
	"testing"
)

func TestResolveObjectConfig(t *testing.T) {
	// Qiniu resolve
	qiniuCfg := ResolveObjectConfig(map[string]any{
		"provider":        "qiniu",
		"bucketName":      "test-bucket",
		"accessKeyId":     "ak123",
		"secretAccessKey": "sk123",
		"zone":            "z2",
		"publicDomain":    "th1b3suy7.hn-bkt.clouddn.com",
		"apiPrefix":       "seedance/",
		"materialsPrefix": "canvas-materials/",
	})
	if qiniuCfg == nil {
		t.Fatal("expected qiniuCfg not to be nil")
	}
	if qiniuCfg.Endpoint != "https://s3-cn-south-1.qiniucs.com" {
		t.Fatalf("expected z2 endpoint, got %s", qiniuCfg.Endpoint)
	}

	url := PermanentObjectURL(*qiniuCfg, "canvas-materials/images/202610/test.png")
	if !strings.HasPrefix(url, "https://th1b3suy7.hn-bkt.clouddn.com/canvas-materials/images/202610/test.png") {
		t.Fatalf("unexpected permanent URL: %s", url)
	}

	// Cloudinary resolve
	cloudCfg := ResolveObjectConfig(map[string]any{
		"provider":        "cloudinary",
		"cloudName":       "my-cloud",
		"accessKeyId":     "key1",
		"secretAccessKey": "secret1",
	})
	if cloudCfg == nil {
		t.Fatal("expected cloudCfg not to be nil")
	}
	cloudURL := PermanentObjectURL(*cloudCfg, "seedance/img_123.png")
	if cloudURL != "https://res.cloudinary.com/my-cloud/image/upload/seedance/img_123.png" {
		t.Fatalf("unexpected cloudinary permanent URL: %s", cloudURL)
	}
}

func TestObjectKeyWithConfig(t *testing.T) {
	cfg := ObjectConfig{
		ApiPrefix:       "seedance/",
		MaterialsPrefix: "canvas-materials/",
	}

	keyMat := ObjectKeyWithConfig(cfg, "assets", ".png", "photo.png")
	if !strings.HasPrefix(keyMat, "canvas-materials/images/") {
		t.Fatalf("expected materials path, got %s", keyMat)
	}

	keyGen := ObjectKeyWithConfig(cfg, "generated/videos", ".mp4", "output.mp4")
	if !strings.HasPrefix(keyGen, "seedance/generated/videos/") {
		t.Fatalf("expected api path, got %s", keyGen)
	}
}

type mockObjectStore struct {
	putCalls int
}

func (m *mockObjectStore) Put(ctx context.Context, config ObjectConfig, key, contentType string, body []byte) error {
	m.putCalls++
	return nil
}

func (m *mockObjectStore) Delete(ctx context.Context, config ObjectConfig, key string) error {
	return nil
}

func TestProbeObjectStore(t *testing.T) {
	mock := &mockObjectStore{}
	Objects = mock
	defer func() { Objects = defaultObjectStore{} }()

	cfg := ObjectConfig{
		Provider:        "oss",
		BucketName:      "test-bucket",
		Endpoint:        "https://oss-cn-beijing.aliyuncs.com",
		AccessKeyID:     "ak",
		SecretAccessKey: "sk",
		ApiPrefix:       "seedance/",
	}

	url, err := ProbeObjectStore(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected probe error: %v", err)
	}
	if mock.putCalls != 1 {
		t.Fatalf("expected 1 put call, got %d", mock.putCalls)
	}
	if !strings.Contains(url, "seedance/health_check_") {
		t.Fatalf("expected health check url to include api prefix, got %s", url)
	}
}
