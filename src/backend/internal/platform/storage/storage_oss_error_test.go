package storage

import (
	"context"
	"encoding/xml"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/aliyun/alibabacloud-oss-go-sdk-v2/oss"
)

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
