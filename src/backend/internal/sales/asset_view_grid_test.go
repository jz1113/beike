package sales

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"hash/crc32"
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
		draw.Draw(img, assetGridCell(img.Bounds(), i, "scene"), image.NewUniform(value), image.Point{}, draw.Src)
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
			cell := assetGridCell(image.Rect(0, 0, 901, 1202), index, "scene")
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
		cell := assetGridCell(bounds, index, "scene")
		area += cell.Dx() * cell.Dy()
		if !cell.In(bounds) {
			t.Fatal("out of bounds", cell)
		}
		for other := range index {
			if !cell.Intersect(assetGridCell(bounds, other, "scene")).Empty() {
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
	if err := validateAssetGrid(data, "scene"); err == nil || !strings.Contains(err.Error(), "4000") {
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

func TestGridRetryRepairsOnlyTruncatedCell(t *testing.T) {
	root := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", root)
	source := assetGridFixture(t, 1200, 900)
	views, err := splitAssetGrid(t.Context(), source, "persona", "local")
	if err != nil {
		t.Fatal(err)
	}
	file := func(i int) string { return filepath.Join(root, strings.TrimPrefix(views[i].URL, "/storage/")) }
	good, _ := os.Stat(file(0))
	broken, _ := os.Stat(file(6))
	if err := os.Truncate(file(6), broken.Size()-64); err != nil {
		t.Fatal(err)
	}
	if _, err := splitAssetGrid(t.Context(), source, "persona", "local"); err != nil {
		t.Fatal(err)
	}
	repaired, _ := os.Stat(file(6))
	retained, _ := os.Stat(file(0))
	if repaired.Size() != broken.Size() || retained.ModTime() != good.ModTime() {
		t.Fatal("incorrect partial repair")
	}
}

func TestPersonaStripCutsFourFullHeightColumns(t *testing.T) {
	t.Setenv("AZHUO_CACHE_DIR", t.TempDir())
	// An odd width makes the final column one pixel wider.
	const width, height = 1401, 768
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for index := range 4 {
		rect := image.Rect(index*width/4, 0, (index+1)*width/4, height)
		draw.Draw(img, rect, image.NewUniform(gridColors[index]), image.Point{}, draw.Src)
	}
	var source bytes.Buffer
	if err := png.Encode(&source, img); err != nil {
		t.Fatal(err)
	}
	images, err := splitAssetGrid(t.Context(), source.Bytes(), personaStrip, "local")
	if err != nil || len(images) != 4 {
		t.Fatal(images, err)
	}
	for i, want := range []string{"front", "side", "back", "face"} {
		raw, err := readAssetGrid(t.Context(), images[i].URL, "local")
		if err != nil {
			t.Fatal(err)
		}
		crop, _, err := image.Decode(bytes.NewReader(raw))
		if err != nil || images[i].View != want || crop.Bounds() != image.Rect(0, 0, (i+1)*width/4-i*width/4, height) {
			t.Fatalf("invalid crop %d: %v", i, err)
		}
		got := color.RGBAModel.Convert(crop.At(10, height-1)).(color.RGBA)
		for _, delta := range []int{int(got.R) - int(gridColors[i].R), int(got.G) - int(gridColors[i].G), int(got.B) - int(gridColors[i].B)} {
			if delta < -3 || delta > 3 {
				t.Fatalf("incorrect column %s: %v", want, got)
			}
		}
	}
}

type gridFetchTransport func(*http.Request) (*http.Response, error)

func (f gridFetchTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

type brokenGridBody struct{ closed bool }

func (b *brokenGridBody) Read([]byte) (int, error) { return 0, io.ErrUnexpectedEOF }
func (b *brokenGridBody) Close() error             { b.closed = true; return nil }

func TestAssetGridDownloadRetriesStalledBodyWithAlternateConnection(t *testing.T) {
	const source = "https://cdn.example/grid.png?signature=original"
	body := &brokenGridBody{}
	firstCalls, secondCalls := 0, 0
	primary := &http.Client{Transport: gridFetchTransport(func(r *http.Request) (*http.Response, error) {
		firstCalls++
		deadline, ok := r.Context().Deadline()
		if !ok || time.Until(deadline) > 20*time.Second || time.Until(deadline) < 19*time.Second {
			t.Fatal("first download must leave time for alternate route and cropping")
		}
		return &http.Response{StatusCode: 200, Body: body}, nil
	})}
	want := assetGridFixture(t, 900, 900)
	alternate := &http.Client{Transport: gridFetchTransport(func(r *http.Request) (*http.Response, error) {
		secondCalls++
		if !body.closed || r.URL.String() != source || r.Method != http.MethodGet {
			t.Fatal("retry must close failed response and reuse the exact original URL")
		}
		deadline, _ := r.Context().Deadline()
		if time.Until(deadline) < 59*time.Second || r.Header.Get("User-Agent") == "" {
			t.Fatal("alternate attempt needs the large-image budget and media headers")
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewReader(want))}, nil
	})}
	data, err := fetchAssetGridWithClients(context.Background(), source, primary, alternate)
	if err != nil || !bytes.Equal(data, want) || firstCalls != 1 || secondCalls != 1 {
		t.Fatal("failed to recover original image", err, firstCalls, secondCalls)
	}
	if err := validateAssetGrid(data, "scene"); err != nil {
		t.Fatal(err)
	}
}

func TestAssetGridDownloadDoesNotRetryPermanentFailureOrCancellation(t *testing.T) {
	for _, test := range []struct {
		name   string
		status int
		length int64
		cancel bool
	}{
		{"expired", 403, 0, false}, {"oversized", 200, assetGridMaxBytes + 1, false}, {"cancelled", 200, 0, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			calls := 0
			client := &http.Client{Transport: gridFetchTransport(func(r *http.Request) (*http.Response, error) {
				calls++
				if test.cancel {
					cancel()
					return nil, context.Canceled
				}
				return &http.Response{StatusCode: test.status, ContentLength: test.length, Body: io.NopCloser(strings.NewReader("unused"))}, nil
			})}
			_, err := fetchAssetGridWithClients(ctx, "https://cdn.example/grid.png", client, client)
			if err == nil || calls != 1 {
				t.Fatal("permanent failure retried", err, calls)
			}
			if test.cancel && !errors.Is(err, context.Canceled) {
				t.Fatal(err)
			}
			if test.length > assetGridMaxBytes {
				var oversized originalImageSizeError
				if !errors.As(err, &oversized) {
					t.Fatal("lost size error", err)
				}
			}
		})
	}
}

func TestAssetGridDownloadRejectsInvalidSourceBeforeNetwork(t *testing.T) {
	client := &http.Client{Transport: gridFetchTransport(func(*http.Request) (*http.Response, error) {
		t.Fatal("invalid source reached network")
		return nil, nil
	})}
	for _, source := range []string{"file:///etc/passwd", "https://user:pass@cdn.example/a.png", "https:///a.png"} {
		if _, err := fetchAssetGridWithClients(context.Background(), source, client, client); err == nil {
			t.Fatal(source)
		}
	}
}

func largeAssetGridFixture(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 3072, 3072))
	for index, value := range gridColors {
		draw.Draw(img, assetGridCell(img.Bounds(), index, "scene"), image.NewUniform(value), image.Point{}, draw.Src)
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
