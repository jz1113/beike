package sales

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"hash/crc32"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/storage"
)

var gridColors = []color.RGBA{
	{220, 20, 20, 255}, {20, 220, 20, 255}, {20, 20, 220, 255},
	{220, 220, 20, 255}, {220, 20, 220, 255}, {20, 220, 220, 255},
	{90, 30, 10, 255}, {120, 120, 120, 255}, {230, 180, 100, 255},
}

func assetGridFixture(t *testing.T, width, height int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for i, value := range gridColors {
		draw.Draw(img, assetGridCell(img.Bounds(), i), image.NewUniform(value), image.Point{}, draw.Src)
	}
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, img); err != nil {
		t.Fatal(err)
	}
	return encoded.Bytes()
}

func requestAssetGrid(t *testing.T, kind, source, workspace string) *httptest.ResponseRecorder {
	t.Helper()
	body, _ := json.Marshal(map[string]string{"kind": kind, "imageUrl": source})
	r := httptest.NewRequest(http.MethodPost, "/api/sales/asset-view-grid", bytes.NewReader(body))
	r = r.WithContext(httpx.WithWorkspace(r.Context(), workspace))
	w := httptest.NewRecorder()
	AssetViewGrid(config.Config{})(w, r)
	return w
}

func TestAssetGridCutsNineJpegsInOrderAndRetriesWithoutRewriting(t *testing.T) {
	root := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", root)
	data := assetGridFixture(t, 901, 1202)
	for _, kind := range []string{"persona", "scene"} {
		first, err := splitAssetGrid(context.Background(), data, kind, "local")
		if err != nil || len(first) != 9 {
			t.Fatal(first, err)
		}
		modTimes := make([]int64, 9)
		for index, item := range first {
			if item.View != assetGridViews[kind][index] || !strings.HasSuffix(item.URL, ".jpg") {
				t.Fatal("wrong order or extension", item)
			}
			file := filepath.Join(root, strings.TrimPrefix(item.URL, "/storage/"))
			raw, err := os.ReadFile(file)
			if err != nil || len(raw) < 3 || !bytes.Equal(raw[:3], []byte{255, 216, 255}) {
				t.Fatal("not a JPEG", item, err)
			}
			decoded, format, err := image.Decode(bytes.NewReader(raw))
			cell := assetGridCell(image.Rect(0, 0, 901, 1202), index)
			if err != nil || format != "jpeg" || decoded.Bounds().Dx() != cell.Dx() || decoded.Bounds().Dy() != cell.Dy() {
				t.Fatal("incorrect integer split dimensions", cell, err)
			}
			pixel := color.RGBAModel.Convert(decoded.At(cell.Dx()/2, cell.Dy()/2)).(color.RGBA)
			want := gridColors[index]
			for _, delta := range []int{int(pixel.R) - int(want.R), int(pixel.G) - int(want.G), int(pixel.B) - int(want.B)} {
				if delta < -3 || delta > 3 {
					t.Fatal("wrong grid cell selected", index, pixel, want)
				}
			}
			stat, _ := os.Stat(file)
			modTimes[index] = stat.ModTime().UnixNano()
		}
		second, err := splitAssetGrid(context.Background(), data, kind, "local")
		if err != nil || !reflect.DeepEqual(first, second) {
			t.Fatal("retry did not reuse output", second, err)
		}
		for index, item := range second {
			stat, _ := os.Stat(filepath.Join(root, strings.TrimPrefix(item.URL, "/storage/")))
			if stat.ModTime().UnixNano() != modTimes[index] {
				t.Fatal("retry rewrote saved image", item)
			}
		}
	}
}

func TestAssetGridIntegerCellsCoverAllPixels(t *testing.T) {
	bounds := image.Rect(2, 7, 903, 1209)
	area := 0
	for index := range 9 {
		cell := assetGridCell(bounds, index)
		area += cell.Dx() * cell.Dy()
		if !cell.In(bounds) {
			t.Fatal("out of bounds", cell)
		}
		for other := range index {
			if !cell.Intersect(assetGridCell(bounds, other)).Empty() {
				t.Fatal("overlapping grid cells")
			}
		}
	}
	if area != bounds.Dx()*bounds.Dy() {
		t.Fatal("lost border pixels", area)
	}
}

func TestAssetGridTransparentImagesUseWhiteBackground(t *testing.T) {
	t.Setenv("AZHUO_CACHE_DIR", t.TempDir())
	var data bytes.Buffer
	if err := png.Encode(&data, image.NewNRGBA(image.Rect(0, 0, 900, 1200))); err != nil {
		t.Fatal(err)
	}
	images, err := splitAssetGrid(context.Background(), data.Bytes(), "persona", "local")
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(filepath.Join(storage.ResolveRoot(), strings.TrimPrefix(images[0].URL, "/storage/")))
	decoded, _, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	r, g, b, a := decoded.At(0, 0).RGBA()
	if r != 65535 || g != 65535 || b != 65535 || a != 65535 {
		t.Fatal("transparent pixels not flattened to white", r, g, b, a)
	}
}

func TestAssetGridHandlerSupportsLocalAndInlineAndSeparatesWorkspaces(t *testing.T) {
	root := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", root)
	data := assetGridFixture(t, 900, 1200)
	workspace := strings.Repeat("a", 64)
	if err := os.MkdirAll(filepath.Join(root, workspace), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, workspace, "grid.png"), data, 0o644); err != nil {
		t.Fatal(err)
	}
	inline := "data:image/png;base64," + base64.StdEncoding.EncodeToString(data)
	for _, source := range []string{"/storage/" + workspace + "/grid.png", inline} {
		response := requestAssetGrid(t, "persona", source, workspace)
		var body struct {
			Success bool             `json:"success"`
			Images  []assetGridImage `json:"images"`
		}
		if response.Code != 200 || json.Unmarshal(response.Body.Bytes(), &body) != nil || !body.Success || len(body.Images) != 9 {
			t.Fatal(response.Code, response.Body.String())
		}
		if !strings.HasPrefix(body.Images[0].URL, "/storage/"+workspace+"/") {
			t.Fatal("output not workspace isolated", body.Images)
		}
	}
	denied := requestAssetGrid(t, "persona", "/storage/"+workspace+"/grid.png", strings.Repeat("b", 64))
	if denied.Code != 400 {
		t.Fatal("read foreign workspace", denied.Code)
	}
	local := requestAssetGrid(t, "persona", "/storage/"+workspace+"/grid.png", "local")
	if local.Code != 400 {
		t.Fatal("local workspace read another workspace", local.Code)
	}
}

func TestAssetGridRejectsBadSourcesAndTooSmallOrLargeImages(t *testing.T) {
	t.Setenv("AZHUO_CACHE_DIR", t.TempDir())
	for _, source := range []string{"file:///etc/passwd", "http://127.0.0.1:1/grid.png", "data:image/svg+xml;base64,PHN2Zz4=", "data:image/png;base64,????", "/storage/local/../grid.png"} {
		response := requestAssetGrid(t, "persona", source, "local")
		if response.Code != 400 {
			t.Fatal("accepted bad source", source, response.Code)
		}
	}
	for _, dimensions := range [][2]int{{767, 1200}, {900, 767}} {
		data := assetGridFixture(t, dimensions[0], dimensions[1])
		response := requestAssetGrid(t, "scene", "data:image/png;base64,"+base64.StdEncoding.EncodeToString(data), "local")
		if response.Code != 422 {
			t.Fatal("accepted undersized grid", dimensions, response.Code)
		}
	}
	data := assetGridFixture(t, 1, 1)
	binary.BigEndian.PutUint32(data[16:20], 9000)
	binary.BigEndian.PutUint32(data[20:24], 5000)
	binary.BigEndian.PutUint32(data[29:33], crc32.ChecksumIEEE(data[12:29]))
	if err := validateAssetGrid(data); err == nil || !strings.Contains(err.Error(), "4000") {
		t.Fatal("pixel limit did not run before decode", err)
	}
	if _, err := readAssetGrid(context.Background(), "data:image/png;base64,"+strings.Repeat("A", base64.StdEncoding.EncodedLen(assetGridMaxBytes)+4), "local"); err == nil {
		t.Fatal("accepted oversized inline image")
	}
}

func TestAssetGridCancellationAndStorageSymlinks(t *testing.T) {
	root := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", root)
	data := assetGridFixture(t, 900, 1200)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := splitAssetGrid(ctx, data, "persona", "local"); err != context.Canceled {
		t.Fatal("cancelled operation wrote images", err)
	}
	outside := t.TempDir()
	if err := os.Symlink(outside, filepath.Join(root, "local")); err != nil {
		t.Skip("symlinks unavailable", err)
	}
	if _, err := splitAssetGrid(context.Background(), data, "persona", "local"); err == nil {
		t.Fatal("accepted symlinked workspace directory")
	}
	entries, _ := os.ReadDir(outside)
	if len(entries) != 0 {
		t.Fatal("wrote outside storage root")
	}
}

func TestAssetGridLargerInputsKeepOCRLimitAndReadFailureCode(t *testing.T) {
	root := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", root)
	if err := os.MkdirAll(filepath.Join(root, "local"), 0o755); err != nil {
		t.Fatal(err)
	}
	data := assetGridFixture(t, 900, 1200)
	padded := append(data, make([]byte, 13<<20)...)
	if err := os.WriteFile(filepath.Join(root, "local", "large.png"), padded, 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := readOriginal(context.Background(), "/storage/local/large.png", "local"); err == nil {
		t.Fatal("OCR's 12 MB limit was loosened")
	}
	if _, err := readAssetGrid(context.Background(), "/storage/local/large.png", "local"); err != nil {
		t.Fatal("grid could not read a valid image within 20 MB", err)
	}
	missing := requestAssetGrid(t, "persona", "/storage/local/missing.png", "local")
	if missing.Code != 400 || !strings.Contains(missing.Body.String(), `"code":"image_read_failed"`) {
		t.Fatal("missing refreshable read error", missing.Code, missing.Body.String())
	}
	if err := os.WriteFile(filepath.Join(root, "local", "invalid.png"), []byte("invalid png"), 0o644); err != nil {
		t.Fatal(err)
	}
	invalid := requestAssetGrid(t, "persona", "/storage/local/invalid.png", "local")
	if invalid.Code != 422 || strings.Contains(invalid.Body.String(), "image_read_failed") {
		t.Fatal("decode error should not request a refreshed result URL", invalid.Code, invalid.Body.String())
	}
}

func TestAssetGridRejectsInvalidRequestsAndReportsBusy(t *testing.T) {
	handler := AssetViewGrid(config.Config{})
	for _, body := range []string{`{"kind":"unknown","imageUrl":"/storage/local/x.png"}`, `{"kind":"persona"}`, `{"kind":"scene","imageUrl":"x"} {}`, `{"kind":"scene","imageUrl":"x","extra":true}`} {
		response := httptest.NewRecorder()
		handler(response, httptest.NewRequest(http.MethodPost, "/api/sales/asset-view-grid", strings.NewReader(body)))
		if response.Code != 400 {
			t.Fatal("accepted invalid body", body, response.Code)
		}
	}
	assetGridSlots <- struct{}{}
	assetGridSlots <- struct{}{}
	defer func() { <-assetGridSlots; <-assetGridSlots }()
	busy := requestAssetGrid(t, "scene", "/storage/local/grid.png", "local")
	if busy.Code != 429 {
		t.Fatal("did not bound concurrent decoding", busy.Code)
	}
}
