package generate

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"net/url"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/platform/storage"
)

type referenceObjectStore struct {
	key, contentType string
	body             []byte
	err              error
}

func (s *referenceObjectStore) Put(_ context.Context, _ storage.ObjectConfig, key, contentType string, body []byte) error {
	s.key, s.contentType, s.body = key, contentType, body
	return s.err
}

func (*referenceObjectStore) Delete(context.Context, storage.ObjectConfig, string) error { return nil }

func uploadOSSReference(t *testing.T) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	header := textproto.MIMEHeader{}
	header.Set("Content-Disposition", `form-data; name="file"; filename="reference.mp4"`)
	header.Set("Content-Type", "video/mp4")
	part, err := writer.CreatePart(header)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write([]byte("reference-video")); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/generate/upload-ref", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	request.Header.Set("x-storage-config", `{"provider":"oss","bucketName":"reference-bucket","endpoint":"oss-cn-beijing.aliyuncs.com","accessKeyId":"test-key","secretAccessKey":"test-secret","apiPrefix":"\u4e0a\u4f20/"}`)
	response := httptest.NewRecorder()
	UploadRef().ServeHTTP(response, request)
	return response
}

func TestUploadRefOSSReturnsVideoURL(t *testing.T) {
	store := &referenceObjectStore{}
	original := storage.Objects
	storage.Objects = store
	t.Cleanup(func() { storage.Objects = original })
	response := uploadOSSReference(t)
	var result struct {
		Success   bool   `json:"success"`
		URL       string `json:"url"`
		MediaType string `json:"mediaType"`
		Filename  string `json:"filename"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if response.Code != http.StatusOK || !result.Success || result.MediaType != "video" || result.Filename != "reference.mp4" {
		t.Fatalf("OSS reference upload failed: status=%d body=%s", response.Code, response.Body.String())
	}
	parsed, err := url.Parse(result.URL)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(store.key, "上传/refs/") || parsed.Host != "reference-bucket.oss-cn-beijing.aliyuncs.com" || parsed.Path != "/"+store.key {
		t.Fatalf("reference URL or configured prefix lost: key=%q url=%q", store.key, result.URL)
	}
	if parsed.Query().Get("x-oss-signature") == "" || parsed.Query().Get("x-oss-expires") != "86400" {
		t.Fatal("OSS reference must include temporary read access for private buckets")
	}
	if store.contentType != "video/mp4" || string(store.body) != "reference-video" {
		t.Fatalf("reference video changed: contentType=%q body=%q", store.contentType, store.body)
	}
}

func TestUploadRefOSSWriteFailureDoesNotReturnURL(t *testing.T) {
	original := storage.Objects
	storage.Objects = &referenceObjectStore{err: errors.New("write failed")}
	t.Cleanup(func() { storage.Objects = original })
	response := uploadOSSReference(t)
	if response.Code != http.StatusInternalServerError || strings.Contains(response.Body.String(), `"url"`) {
		t.Fatalf("failed upload returned a reference: status=%d body=%s", response.Code, response.Body.String())
	}
}
