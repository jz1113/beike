package sales

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	"os"
	"path"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/platform/storage"
)

func assetGridDigest(data []byte, kind string) string {
	hash := sha256.New()
	hash.Write([]byte("sales-grid-jpeg96-v1:" + kind + ":"))
	hash.Write(data)
	return hex.EncodeToString(hash.Sum(nil))
}

func assetGridDimensions(kind string) (columns, rows int) {
	if kind == personaStrip {
		return 4, 1
	}
	return 3, 3
}

func assetGridCell(bounds image.Rectangle, index int, kind string) image.Rectangle {
	columns, rows := assetGridDimensions(kind)
	row, column := index/columns, index%columns
	return image.Rect(bounds.Min.X+column*bounds.Dx()/columns, bounds.Min.Y+row*bounds.Dy()/rows,
		bounds.Min.X+(column+1)*bounds.Dx()/columns, bounds.Min.Y+(row+1)*bounds.Dy()/rows)
}

func splitAssetGrid(ctx context.Context, data []byte, kind, workspace string) ([]assetGridImage, error) {
	if len(assetGridViews[kind]) == 0 {
		return nil, errors.New("invalid grid kind")
	}
	if err := validateAssetGrid(data, kind); err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	root, err := openAssetGridRoot(workspace)
	if err != nil {
		return nil, err
	}
	defer root.Close()
	dir := path.Join("azhuo", "refs", "sales-grid", kind, assetGridDigest(data, kind))
	if err := root.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	files, err := root.OpenRoot(dir)
	if err != nil {
		return nil, err
	}
	defer files.Close()
	images := make([]assetGridImage, 0, len(assetGridViews[kind]))
	dimensions, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	bounds := image.Rect(0, 0, dimensions.Width, dimensions.Height)
	var decoded image.Image
	var cell *image.RGBA
	for index, view := range assetGridViews[kind] {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		filename := fmt.Sprintf("%02d-%s.jpg", index+1, view)
		if !validStoredGridCell(files, filename, assetGridCell(bounds, index, kind)) {
			// Completed retries need no full decode; partial retries decode only once.
			if decoded == nil {
				decoded, _, err = image.Decode(bytes.NewReader(data))
				if err != nil {
					return nil, err
				}
			}
			bounds := assetGridCell(decoded.Bounds(), index, kind)
			// Reuse the crop buffer instead of allocating nine full-size bitmaps.
			if cell == nil || cell.Bounds().Dx() != bounds.Dx() || cell.Bounds().Dy() != bounds.Dy() {
				cell = image.NewRGBA(image.Rect(0, 0, bounds.Dx(), bounds.Dy()))
			}
			draw.Draw(cell, cell.Bounds(), image.NewUniform(color.White), image.Point{}, draw.Src)
			draw.Draw(cell, cell.Bounds(), decoded, bounds.Min, draw.Over)
			if err := saveAssetGridCell(ctx, files, filename, cell); err != nil {
				return nil, err
			}
		}
		rel := storage.WorkspaceKey(path.Join(dir, filename), workspace)
		images = append(images, assetGridImage{View: view, URL: "/storage/" + rel})
	}
	return images, nil
}

func validStoredGridCell(files *os.Root, name string, expected image.Rectangle) bool {
	info, err := files.Lstat(name)
	if err != nil || !info.Mode().IsRegular() || info.Size() <= 0 {
		return false
	}
	file, err := files.Open(name)
	if err != nil {
		return false
	}
	defer file.Close()
	size, err := jpeg.DecodeConfig(file)
	if err != nil || size.Width != expected.Dx() || size.Height != expected.Dy() {
		return false
	}
	// A truncated JPEG can have a perfectly valid header and dimensions.
	var end [2]byte
	_, err = file.ReadAt(end[:], info.Size()-2)
	return err == nil && end == [2]byte{0xff, 0xd9}
}

// A workspace-rooted directory handle keeps symlinks in generated paths confined.
func openAssetGridRoot(workspace string) (*os.Root, error) {
	rootPath := storage.ResolveRoot()
	if strings.ContainsAny(workspace, "/\\") || storage.SafeWithin(rootPath, workspace) == "" {
		return nil, errors.New("invalid workspace")
	}
	if err := os.MkdirAll(rootPath, 0o755); err != nil {
		return nil, err
	}
	root, err := os.OpenRoot(rootPath)
	if err != nil {
		return nil, err
	}
	defer root.Close()
	if err := root.MkdirAll(workspace, 0o755); err != nil {
		return nil, err
	}
	info, err := root.Lstat(workspace)
	if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return nil, errors.New("invalid workspace storage directory")
	}
	return root.OpenRoot(workspace)
}

func saveAssetGridCell(ctx context.Context, root *os.Root, name string, cell image.Image) error {
	fileName := fmt.Sprintf(".%s-%d", name, time.Now().UnixNano())
	file, err := root.OpenFile(fileName, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return err
	}
	defer root.Remove(fileName)
	encodeErr := jpeg.Encode(file, cell, &jpeg.Options{Quality: 96})
	closeErr := file.Close()
	if encodeErr != nil {
		return encodeErr
	}
	if closeErr != nil {
		return closeErr
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	return root.Rename(fileName, name)
}
