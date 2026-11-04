package sales

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"beike.local/cloud/src/backend/internal/gateway"
)

func TestAssetCreationImageStoragePreservesResolutionAndJPEGAndScopesWorkspace(t *testing.T) {
	t.Setenv("AZHUO_CACHE_DIR", t.TempDir())
	canvas := image.NewNRGBA(image.Rect(0, 0, 301, 401))
	canvas.SetNRGBA(150, 200, color.NRGBA{R: 255, A: 128})
	var pngBuffer bytes.Buffer
	if err := png.Encode(&pngBuffer, canvas); err != nil {
		t.Fatal(err)
	}
	source := "data:image/png;base64," + base64.StdEncoding.EncodeToString(pngBuffer.Bytes())
	stored, err := storeAssetCreationImage(t.Context(), source, "persona", "mine")
	if err != nil {
		t.Fatal(err)
	}
	data, err := readAssetGrid(t.Context(), stored, "mine")
	if err != nil {
		t.Fatal(err)
	}
	decoded, kind, err := image.Decode(bytes.NewReader(data))
	if err != nil || kind != "jpeg" || decoded.Bounds().Dx() != 301 || decoded.Bounds().Dy() != 401 {
		t.Fatal("resolution/format changed", kind, err)
	}
	r, g, b, _ := decoded.At(0, 0).RGBA()
	if r < 65000 || g < 65000 || b < 65000 {
		t.Fatal("transparent pixels not composited white", r, g, b)
	}
	if replay, err := storeAssetCreationImage(t.Context(), source, "persona", "mine"); err != nil || replay != stored {
		t.Fatal("non-deterministic storage", replay, err)
	}
	other, err := storeAssetCreationImage(t.Context(), source, "persona", "other")
	if err != nil || other == stored || !strings.HasPrefix(other, "/storage/other/") {
		t.Fatal("workspace storage not isolated", other, err)
	}
	if _, err := storeAssetCreationImage(t.Context(), stored, "persona", "other"); err == nil {
		t.Fatal("cross-workspace source read allowed")
	}
	var jpegBuffer bytes.Buffer
	if err := jpeg.Encode(&jpegBuffer, decoded, &jpeg.Options{Quality: 87}); err != nil {
		t.Fatal(err)
	}
	jpegSource := "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(jpegBuffer.Bytes())
	jpegStored, err := storeAssetCreationImage(t.Context(), jpegSource, "scene", "mine")
	if err != nil {
		t.Fatal(err)
	}
	jpegBytes, err := readAssetGrid(t.Context(), jpegStored, "mine")
	if err != nil || !bytes.Equal(jpegBytes, jpegBuffer.Bytes()) {
		t.Fatal("original JPEG was recompressed", err)
	}
	if _, err := assetCreationJPEG(t.Context(), []byte("not an image")); err == nil {
		t.Fatal("invalid image accepted")
	}
	cancelled, cancel := context.WithCancel(t.Context())
	cancel()
	if _, err := assetCreationJPEG(cancelled, pngBuffer.Bytes()); err == nil {
		t.Fatal("cancelled storage continued")
	}
}

func TestAssetCreationStorageRetryKeepsProviderResultAndDoesNotGenerateAgain(t *testing.T) {
	cfg, db := setupAssetViewJobs(t)
	reference := "data:image/png;base64," + base64.StdEncoding.EncodeToString(assetGridFixture(t, 900, 1200))
	providerResult := "/storage/mine/azhuo/refs/main-provider.png"
	grid := "data:image/png;base64," + base64.StdEncoding.EncodeToString(assetGridFixture(t, 1200, 900))
	var calls atomic.Int32
	previous := gateway.ModelHTTP
	gateway.ModelHTTP = func() *http.Client {
		return &http.Client{Transport: gridFetchTransport(func(request *http.Request) (*http.Response, error) {
			call := calls.Add(1)
			var response any
			if call == 1 {
				result, _ := json.Marshal(map[string]any{"prompt": "一间独立设计的简洁客厅，真实自然光，明亮整洁，合理透视。"})
				response = map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": string(result)}, "finish_reason": "stop"}}}
			} else if call == 2 {
				response = map[string]any{"image": providerResult}
			} else {
				response = map[string]any{"image": grid}
			}
			raw, _ := json.Marshal(response)
			return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(bytes.NewReader(raw))}, nil
		})}
	}
	t.Cleanup(func() { gateway.ModelHTTP = previous })
	dimensions, _ := json.Marshal(map[string]any{"assetCreation": map[string]any{"referenceImageUrl": reference}})
	body := map[string]any{"key": "main-storage-retry", "kind": "scene", "data": map[string]any{"title": "空间", "coverUrl": "", "dimensions": string(dimensions)}, "generation": assetCreationTestGeneration(reference)}
	first := postAssetViewJob(t, cfg, body)
	failed := awaitAssetViewJob(t, cfg, db, first.ID)
	if failed.Status != "failed" || failed.Creation == nil || failed.Creation.ImageURL != "" || assetCreationText(assetCreationSettings(failed.generation)["resultUrl"]) != providerResult || calls.Load() != 2 {
		t.Fatal("provider checkpoint lost after storage failure", failed, calls.Load())
	}
	var public map[string]any
	rawPublic, _ := json.Marshal(failed)
	_ = json.Unmarshal(rawPublic, &public)
	if bytes.Contains(rawPublic, []byte(providerResult)) {
		t.Fatal("raw provider result leaked into public job metadata")
	}
	file := filepath.Join(os.Getenv("AZHUO_CACHE_DIR"), "mine", "azhuo", "refs", "main-provider.png")
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, assetGridFixture(t, 768, 1024), 0o644); err != nil {
		t.Fatal(err)
	}
	postAssetViewJob(t, cfg, map[string]any{"key": first.Key, "kind": "scene", "assetId": first.AssetID, "data": map[string]any{}, "generation": assetCreationTestGeneration(reference)})
	complete := awaitAssetViewJob(t, cfg, db, first.ID)
	if complete.Status != "completed" || complete.Creation == nil || !strings.HasPrefix(complete.Creation.ImageURL, "/storage/mine/azhuo/refs/sales-main/scene/") || calls.Load() != 3 {
		t.Fatal("storage retry repeated paid main generation", complete, calls.Load())
	}
	var cover string
	if err := db.QueryRow(`SELECT "coverUrl" FROM "SceneAsset" WHERE "id"=?`, complete.AssetID).Scan(&cover); err != nil || cover == providerResult || cover != complete.Creation.ImageURL {
		t.Fatal("provider URL persisted as main", cover, err)
	}
}
