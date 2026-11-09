package storage

import (
	"context"
	"encoding/xml"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/aliyun/alibabacloud-oss-go-sdk-v2/oss"
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

	urlStr := PermanentObjectURL(*qiniuCfg, "canvas-materials/images/202610/test.png")
	if !strings.HasPrefix(urlStr, "https://th1b3suy7.hn-bkt.clouddn.com/canvas-materials/images/202610/test.png") {
		t.Fatalf("unexpected permanent URL: %s", urlStr)
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

	urlStr, err := ProbeObjectStore(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected probe error: %v", err)
	}
	if mock.putCalls != 1 {
		t.Fatalf("expected 1 put call, got %d", mock.putCalls)
	}
	if !strings.Contains(urlStr, "seedance/health_check_") {
		t.Fatalf("expected health check url to include api prefix, got %s", urlStr)
	}
}

func TestS3ClientBlocksLoopbackAndPrivateEndpoints(t *testing.T) {
	hits := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	cfg := ObjectConfig{
		Provider:        "minio",
		BucketName:      "ssrf-probe",
		Endpoint:        server.URL,
		AccessKeyID:     "minioadmin",
		SecretAccessKey: "minioadmin",
		PublicDomain:    "https://cdn.example.com",
	}
	err := defaultObjectStore{}.Put(context.Background(), cfg, "probe.txt", "text/plain", []byte("ok"))
	if err == nil {
		t.Fatal("expected loopback S3/MinIO endpoint to be blocked by SafeClient")
	}
	if hits != 0 {
		t.Fatalf("expected 0 requests to reach loopback server, got %d", hits)
	}

	ossCfg := ObjectConfig{
		Provider:        "oss",
		BucketName:      "ssrf-probe",
		Endpoint:        server.URL,
		Region:          "cn-beijing",
		AccessKeyID:     "ak",
		SecretAccessKey: "sk",
	}
	if err := (defaultObjectStore{}).Put(context.Background(), ossCfg, "probe.txt", "text/plain", []byte("ok")); err == nil {
		t.Fatal("expected loopback OSS endpoint to be blocked by SafeClient")
	}
	if hits != 0 {
		t.Fatalf("expected 0 OSS requests to reach loopback server, got %d", hits)
	}
}

func TestOSSObjectStoreUsesNativeV4ForPutAndDelete(t *testing.T) {
	methods := make(chan string, 4)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		methods <- r.Method
		auth := r.Header.Get("Authorization")
		if !strings.HasPrefix(auth, "OSS4-HMAC-SHA256 Credential=test-key/") || !strings.Contains(auth, "/cn-beijing/oss/aliyun_v4_request") {
			t.Errorf("request used an incompatible signature: %s", auth)
		}
		if r.URL.Path != "/reference-bucket/上传/reference.mp4" {
			t.Errorf("unexpected object path: %q", r.URL.Path)
		}
		w.Header().Set("x-oss-request-id", "test-request")
		if r.Method == http.MethodPut {
			body, err := io.ReadAll(r.Body)
			if err != nil || string(body) != "video-bytes" || r.Header.Get("Content-Type") != "video/mp4" {
				t.Errorf("video upload changed: body=%q type=%q err=%v", body, r.Header.Get("Content-Type"), err)
			}
		} else {
			w.WriteHeader(http.StatusNoContent)
		}
	}))
	defer server.Close()
	previous := ossHTTPClient
	ossHTTPClient = server.Client
	t.Cleanup(func() { ossHTTPClient = previous })
	config := ObjectConfig{
		Provider: "oss", Endpoint: server.URL, Region: "cn-beijing",
		BucketName: "reference-bucket", AccessKeyID: "test-key", SecretAccessKey: "test-secret",
	}
	store := defaultObjectStore{}
	if err := store.Put(context.Background(), config, "/上传/reference.mp4", "video/mp4", []byte("video-bytes")); err != nil {
		t.Fatal(err)
	}
	if err := store.Delete(context.Background(), config, "/上传/reference.mp4"); err != nil {
		t.Fatal(err)
	}
	if first, second := <-methods, <-methods; first != "PUT" || second != "DELETE" || len(methods) != 0 {
		t.Fatalf("unexpected object operations: %s %s", first, second)
	}
}

func TestOSSClientDerivesSigningRegionFromEndpoint(t *testing.T) {
	for _, endpoint := range []string{"oss-cn-beijing.aliyuncs.com", "https://oss-cn-beijing.aliyuncs.com/", "https://oss-cn-beijing-internal.aliyuncs.com"} {
		t.Run(endpoint, func(t *testing.T) {
			client, err := newOSSClient(ObjectConfig{Endpoint: endpoint, Region: "auto", AccessKeyID: "test-key", SecretAccessKey: "test-secret"})
			if err != nil {
				t.Fatal(err)
			}
			result, err := client.Presign(context.Background(), &oss.GetObjectRequest{Bucket: oss.Ptr("reference-bucket"), Key: oss.Ptr("video.mp4")})
			if err != nil {
				t.Fatal(err)
			}
			parsed, err := url.Parse(result.URL)
			if err != nil {
				t.Fatal(err)
			}
			query := parsed.Query()
			if !strings.HasPrefix(parsed.Hostname(), "reference-bucket.oss-cn-beijing") || query.Get("x-oss-signature-version") != "OSS4-HMAC-SHA256" || !strings.HasSuffix(query.Get("x-oss-credential"), "/cn-beijing/oss/aliyun_v4_request") {
				t.Fatalf("incorrect OSS host or signing region: host=%q credential=%q", parsed.Host, query.Get("x-oss-credential"))
			}
		})
	}
}

func TestOSSClientRejectsUnknownSigningRegion(t *testing.T) {
	for _, endpoint := range []string{"", "https://oss-accelerate.aliyuncs.com", "https://cdn.example.com"} {
		if _, err := newOSSClient(ObjectConfig{Endpoint: endpoint, Region: "auto"}); err == nil {
			t.Fatalf("accepted an OSS endpoint without a signing region: %q", endpoint)
		}
	}
}

func TestOSSSignatureFailureExplainsMatchingAndChangedRequests(t *testing.T) {
	for _, changed := range []bool{false, true} {
		t.Run(map[bool]string{false: "matching", true: "changed"}[changed], func(t *testing.T) {
			trace := &ossSigningTrace{}
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				// The signer has completed before the HTTP request reaches this server.
				serverString := trace.stringToSign
				if changed {
					serverString += "changed-by-proxy"
				}
				w.WriteHeader(http.StatusForbidden)
				_ = xml.NewEncoder(w).Encode(struct {
					XMLName      xml.Name `xml:"Error"`
					Code         string   `xml:"Code"`
					StringToSign string   `xml:"StringToSign"`
				}{Code: "SignatureDoesNotMatch", StringToSign: serverString})
			}))
			defer server.Close()
			previous := ossHTTPClient
			ossHTTPClient = server.Client
			t.Cleanup(func() { ossHTTPClient = previous })
			client, err := newOSSClient(ObjectConfig{Endpoint: server.URL, Region: "cn-beijing", AccessKeyID: "private-key-id", SecretAccessKey: "private-secret"}, func(options *oss.Options) {
				trace.Signer = options.Signer
				options.Signer = trace
			})
			if err != nil {
				t.Fatal(err)
			}
			_, err = client.PutObject(context.Background(), &oss.PutObjectRequest{Bucket: oss.Ptr("test-bucket"), Key: oss.Ptr("test.txt"), Body: strings.NewReader("private-body")})
			err = trace.explain(err)
			want := "签名原文一致"
			if changed {
				want = "签名原文不一致"
			}
			if err == nil || !strings.Contains(err.Error(), want) {
				t.Fatalf("missing diagnosis: %v", err)
			}
			for _, secret := range []string{"private-key-id", "private-secret", "private-body", trace.stringToSign} {
				if strings.Contains(err.Error(), secret) {
					t.Fatal("diagnosis exposed private signing details")
				}
			}
			var service *oss.ServiceError
			if !errors.As(err, &service) || service.Code != "SignatureDoesNotMatch" {
				t.Fatalf("lost original error: %v", err)
			}
		})
	}
}

func TestOSSSignatureDiagnosisPreservesOtherErrors(t *testing.T) {
	trace := &ossSigningTrace{stringToSign: "local"}
	for _, err := range []error{nil, errors.New("connection failed"), &oss.ServiceError{Code: "AccessDenied"}, &oss.ServiceError{Code: "SignatureDoesNotMatch", Snapshot: []byte("invalid xml")}} {
		if trace.explain(err) != err {
			t.Fatalf("unexpected error replacement: %v", err)
		}
	}
}
