package export

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func namedExportRequest(t *testing.T, entries []map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	body, _ := json.Marshal(map[string]any{"folderName": "素材", "images": entries})
	w := httptest.NewRecorder()
	ExportZip(config.Config{}).ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/generate/export-zip", bytes.NewReader(body)))
	return w
}

func namedExportFiles(t *testing.T, w *httptest.ResponseRecorder) map[string][]byte {
	t.Helper()
	z, err := zip.NewReader(bytes.NewReader(w.Body.Bytes()), int64(w.Body.Len()))
	if err != nil {
		t.Fatalf("not a zip: %d %s", w.Code, w.Body.String())
	}
	files := map[string][]byte{}
	for _, file := range z.File {
		r, err := file.Open()
		if err != nil {
			t.Fatal(err)
		}
		files[file.Name], _ = io.ReadAll(r)
		r.Close()
	}
	return files
}

func TestNamedExportPreservesMixedMediaBytesAndNames(t *testing.T) {
	png := []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}
	video := append([]byte{0, 0, 0, 24}, []byte("ftypmp42\x00\x00\x00\x00mp42isom")...)
	audio := []byte("RIFF\x24\x00\x00\x00WAVEfmt ")
	media := []struct {
		name, mime string
		body       []byte
	}{
		{"图片.jpg", "image/png", png}, {"视频.mp4", "video/mp4", video}, {"音频.wav", "audio/wav", audio},
	}
	entries := []map[string]string{}
	for _, item := range media {
		entries = append(entries, map[string]string{"filename": item.name, "url": "data:" + item.mime + ";base64," + base64.StdEncoding.EncodeToString(item.body)})
	}
	w := namedExportRequest(t, entries)
	if w.Code != http.StatusOK || w.Header().Get("X-Export-Succeeded") != "3" || w.Header().Get("X-Export-Partial") != "false" {
		t.Fatalf("mixed export: %d %s", w.Code, w.Body.String())
	}
	files := namedExportFiles(t, w)
	for name, body := range map[string][]byte{"图片.png": png, "视频.mp4": video, "音频.wav": audio} {
		if !bytes.Equal(files["素材/"+name], body) {
			t.Fatalf("lost mixed media %s", name)
		}
	}
	if !strings.Contains(w.Header().Get("Access-Control-Expose-Headers"), "X-Export-Failed") {
		t.Fatal("export statistics are not visible to the client")
	}
}

func TestNamedExportReportsPartialFailureAndCanRetry(t *testing.T) {
	valid := "data:image/png;base64,iVBORw0KGgo="
	entries := []map[string]string{{"filename": "same.png", "url": valid}, {"filename": "same.png", "url": "data:image/png;base64,YmFk"}}
	w := namedExportRequest(t, entries)
	if w.Code != http.StatusOK || w.Header().Get("X-Export-Failed") != "1" || w.Header().Get("X-Export-Partial") != "true" {
		t.Fatalf("partial export not reported: %d %s", w.Code, w.Body.String())
	}
	files := namedExportFiles(t, w)
	if files["素材/same.png"] == nil || files["素材/same.png.error.txt"] == nil || files["export-summary.json"] == nil {
		t.Fatalf("missing failure report: %v", files)
	}
	entries[1]["url"] = valid
	w = namedExportRequest(t, entries)
	files = namedExportFiles(t, w)
	if w.Header().Get("X-Export-Failed") != "0" || files["素材/same_2.png"] == nil {
		t.Fatal("retry lost a duplicate filename")
	}
	w = namedExportRequest(t, []map[string]string{{"filename": "bad.png", "url": "data:image/png;base64,YmFk"}})
	if w.Code != http.StatusBadGateway || w.Header().Get("Content-Type") == "application/zip" {
		t.Fatal("all-failed export was downloadable")
	}
}

func TestNamedExportDetectsQuickTimeDespiteMP4Filename(t *testing.T) {
	video := append([]byte{0, 0, 0, 20}, []byte("ftypqt  \x00\x00\x02\x00qt  ")...)
	w := namedExportRequest(t, []map[string]string{{
		"filename": "clip.mp4", "url": "data:video/mp4;base64," + base64.StdEncoding.EncodeToString(video),
	}})
	files := namedExportFiles(t, w)
	if !bytes.Equal(files["素材/clip.mov"], video) {
		t.Fatal("QuickTime movie was rejected or exported with the wrong extension")
	}
}

func TestLocalExportKeepsQueryAndWorkspaceBoundaries(t *testing.T) {
	root := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", root)
	if err := os.MkdirAll(filepath.Join(root, "owner"), 0o755); err != nil {
		t.Fatal(err)
	}
	png := []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}
	if err := os.WriteFile(filepath.Join(root, "owner", "image.png"), png, 0o644); err != nil {
		t.Fatal(err)
	}
	for _, workspace := range []string{"owner", "other"} {
		r := httptest.NewRequest(http.MethodPost, "/api/generate/export-zip", nil)
		r = r.WithContext(httpx.WithWorkspace(r.Context(), workspace))
		body, _, err := readExportMedia(config.Config{NodeEnv: "production"}, r, "/storage/owner/image.png?download=1", false)
		if workspace == "owner" && (err != nil || !bytes.Equal(body, png)) {
			t.Fatalf("query broke local export: %v", err)
		}
		if workspace == "other" && (err == nil || len(body) > 0) {
			t.Fatal("another workspace could export private media")
		}
	}
}
