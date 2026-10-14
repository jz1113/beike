package generate

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"testing"
)

func TestUploadRefFallsBackToDataURL(t *testing.T) {
	t.Setenv("S3_ACCESS_KEY_ID", "")
	t.Setenv("R2_ACCESS_KEY_ID", "")
	t.Setenv("S3_SECRET_ACCESS_KEY", "")
	t.Setenv("R2_SECRET_ACCESS_KEY", "")
	t.Setenv("S3_BUCKET_NAME", "")
	t.Setenv("R2_BUCKET_NAME", "")
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	header := textproto.MIMEHeader{}
	header.Set("Content-Disposition", `form-data; name="file"; filename="ref.png"`)
	header.Set("Content-Type", "image/png")
	part, err := writer.CreatePart(header)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write([]byte("png")); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/generate/upload-ref", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	response := httptest.NewRecorder()
	UploadRef().ServeHTTP(response, request)
	if response.Code != http.StatusOK || !bytes.Contains(response.Body.Bytes(), []byte("data:image/png;base64,")) {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
	video := httptest.NewRequest(http.MethodPost, "/api/generate/upload-ref", bytes.NewBufferString("nope"))
	videoResponse := httptest.NewRecorder()
	UploadRef().ServeHTTP(videoResponse, video)
	if videoResponse.Code != http.StatusBadRequest {
		t.Fatalf("plain status %d", videoResponse.Code)
	}
}
