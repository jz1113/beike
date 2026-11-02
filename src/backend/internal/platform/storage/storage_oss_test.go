package storage

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/aliyun/alibabacloud-oss-go-sdk-v2/oss"
)

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
