package sales

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/config"
)

func largeAssetGridFixture(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 3072, 3072))
	for index, value := range gridColors {
		draw.Draw(img, assetGridCell(img.Bounds(), index), image.NewUniform(value), image.Point{}, draw.Src)
	}
	var encoded bytes.Buffer
	encoder := png.Encoder{CompressionLevel: png.NoCompression}
	if err := encoder.Encode(&encoded, img); err != nil {
		t.Fatal(err)
	}
	// This is an actual large PNG, without trailing padding or a fake header.
	if encoded.Len() <= 20<<20 || base64.StdEncoding.EncodedLen(encoded.Len()) <= 32<<20 {
		t.Fatal("fixture must exceed both former source and JSON body limits", encoded.Len())
	}
	return encoded.Bytes()
}

func TestAssetGridLargePNGLocalAndInlineReuseFullResolutionJpegs(t *testing.T) {
	root := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", root)
	if err := os.MkdirAll(filepath.Join(root, "local"), 0o755); err != nil {
		t.Fatal(err)
	}
	data := largeAssetGridFixture(t)
	originalHash := sha256.Sum256(data)
	originalPath := filepath.Join(root, "local", "large-grid.png")
	if err := os.WriteFile(originalPath, data, 0o644); err != nil {
		t.Fatal(err)
	}
	originalInfo, err := os.Stat(originalPath)
	if err != nil {
		t.Fatal(err)
	}

	var first []assetGridImage
	modTimes := make([]time.Time, 9)
	for _, inline := range []bool{false, true} {
		source := "/storage/local/large-grid.png"
		if inline {
			source = "data:image/png;base64," + base64.StdEncoding.EncodeToString(data)
		}
		response := requestAssetGrid(t, "scene", source, "local")
		var body struct {
			Success bool             `json:"success"`
			Images  []assetGridImage `json:"images"`
		}
		if response.Code != http.StatusOK || json.Unmarshal(response.Body.Bytes(), &body) != nil || !body.Success || len(body.Images) != 9 {
			t.Fatalf("inline=%v status=%d body=%s", inline, response.Code, response.Body.String())
		}
		if inline && !reflect.DeepEqual(first, body.Images) {
			t.Fatal("inline retry did not reuse the local source's saved views")
		}
		for index, item := range body.Images {
			if item.View != assetGridViews["scene"][index] || !strings.HasSuffix(item.URL, ".jpg") {
				t.Fatal("incorrect view or format", item)
			}
			filename := filepath.Join(root, strings.TrimPrefix(item.URL, "/storage/"))
			info, err := os.Stat(filename)
			if err != nil {
				t.Fatal(err)
			}
			if inline {
				if !info.ModTime().Equal(modTimes[index]) {
					t.Fatal("retry rewrote the saved JPEG", item.View)
				}
				continue
			}
			modTimes[index] = info.ModTime()
			raw, err := os.ReadFile(filename)
			if err != nil {
				t.Fatal(err)
			}
			decoded, format, err := image.Decode(bytes.NewReader(raw))
			if err != nil || format != "jpeg" || decoded.Bounds().Dx() != 1024 || decoded.Bounds().Dy() != 1024 {
				t.Fatal("large source lost resolution or was not saved as JPEG", item.View, format, err)
			}
			pixel := color.RGBAModel.Convert(decoded.At(512, 512)).(color.RGBA)
			want := gridColors[index]
			for _, delta := range []int{int(pixel.R) - int(want.R), int(pixel.G) - int(want.G), int(pixel.B) - int(want.B)} {
				if delta < -3 || delta > 3 {
					t.Fatal("large source views were assigned in the wrong order", index, pixel, want)
				}
			}
		}
		first = body.Images
	}
	original, err := os.Open(originalPath)
	if err != nil {
		t.Fatal(err)
	}
	defer original.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, original); err != nil {
		t.Fatal(err)
	}
	info, err := original.Stat()
	if err != nil || !bytes.Equal(hash.Sum(nil), originalHash[:]) || !info.ModTime().Equal(originalInfo.ModTime()) {
		t.Fatal("processing modified the original PNG", err)
	}
}

func TestAssetGridOversizedSourceReportsSizeInsteadOfRefreshableReadFailure(t *testing.T) {
	root := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", root)
	if err := os.MkdirAll(filepath.Join(root, "local"), 0o755); err != nil {
		t.Fatal(err)
	}
	file, err := os.Create(filepath.Join(root, "local", "oversized.png"))
	if err != nil {
		t.Fatal(err)
	}
	if err := file.Truncate(assetGridMaxBytes + 1); err != nil {
		file.Close()
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	response := requestAssetGrid(t, "scene", "/storage/local/oversized.png", "local")
	var body struct {
		Success bool   `json:"success"`
		Code    string `json:"code"`
		Error   string `json:"error"`
	}
	if response.Code != http.StatusRequestEntityTooLarge || json.Unmarshal(response.Body.Bytes(), &body) != nil || body.Success || body.Code != "image_too_large" || !strings.Contains(body.Error, "64 MB") {
		t.Fatal("oversized source should retain the existing result URL", response.Code, response.Body.String())
	}
}

type assetGridUnreadBody struct{ t *testing.T }

func (body assetGridUnreadBody) Read([]byte) (int, error) {
	body.t.Error("busy handler buffered an incoming request before admission")
	return 0, io.EOF
}

func (assetGridUnreadBody) Close() error { return nil }

func TestAssetGridBusyRejectsBeforeBufferingBody(t *testing.T) {
	assetGridSlots <- struct{}{}
	assetGridSlots <- struct{}{}
	defer func() { <-assetGridSlots; <-assetGridSlots }()
	request := httptest.NewRequest(http.MethodPost, "/api/sales/asset-view-grid", nil)
	request.Body = assetGridUnreadBody{t: t}
	response := httptest.NewRecorder()
	AssetViewGrid(config.Config{})(response, request)
	if response.Code != http.StatusTooManyRequests {
		t.Fatal("busy handler must reject before buffering large inline images", response.Code)
	}
}
