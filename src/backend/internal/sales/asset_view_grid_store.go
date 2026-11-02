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

func assetGridCell(bounds image.Rectangle, index int) image.Rectangle {
	row, column := index/3, index%3
	return image.Rect(bounds.Min.X+column*bounds.Dx()/3, bounds.Min.Y+row*bounds.Dy()/3,
		bounds.Min.X+(column+1)*bounds.Dx()/3, bounds.Min.Y+(row+1)*bounds.Dy()/3)
}

func splitAssetGrid(ctx context.Context, data []byte, kind, workspace string) ([]assetGridImage, error) {
	if len(assetGridViews[kind]) != 9 {
		return nil, errors.New("invalid grid kind")
	}
	if err := validateAssetGrid(data); err != nil {
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
	images := make([]assetGridImage, 0, 9)
	var decoded image.Image
	var cell *image.RGBA
	for index, view := range assetGridViews[kind] {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		filename := fmt.Sprintf("%02d-%s.jpg", index+1, view)
		if info, err := files.Stat(filename); err != nil || !info.Mode().IsRegular() || info.Size() == 0 {
			// Completed retries need no full decode; partial retries decode only once.
			if decoded == nil {
				decoded, _, err = image.Decode(bytes.NewReader(data))
				if err != nil {
					return nil, err
				}
			}
			bounds := assetGridCell(decoded.Bounds(), index)
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
