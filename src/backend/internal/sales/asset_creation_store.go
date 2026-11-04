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
	"time"

	"beike.local/cloud/src/backend/internal/platform/storage"
)

func storeAssetCreationImage(ctx context.Context, source, kind, workspace string) (string, error) {
	if len(assetGridViews[kind]) != 9 {
		return "", errors.New("资产类型无效")
	}
	data, err := readAssetGrid(ctx, source, workspace)
	if err != nil {
		return "", err
	}
	return storeAssetCreationBytes(ctx, data, kind, workspace)
}

func storeAssetCreationBytes(ctx context.Context, data []byte, kind, workspace string) (string, error) {
	encoded, err := assetCreationJPEG(ctx, data)
	if err != nil {
		return "", err
	}
	root, err := openAssetGridRoot(workspace)
	if err != nil {
		return "", err
	}
	defer root.Close()
	dir := path.Join("azhuo", "refs", "sales-main", kind)
	if err := root.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	files, err := root.OpenRoot(dir)
	if err != nil {
		return "", err
	}
	defer files.Close()
	digest := sha256.Sum256(encoded)
	filename := hex.EncodeToString(digest[:]) + ".jpg"
	if info, err := files.Stat(filename); err != nil || !info.Mode().IsRegular() || info.Size() != int64(len(encoded)) {
		if err := writeAssetCreationImage(ctx, files, filename, encoded); err != nil {
			return "", err
		}
	}
	return "/storage/" + storage.WorkspaceKey(path.Join(dir, filename), workspace), nil
}

func assetCreationJPEG(ctx context.Context, data []byte) ([]byte, error) {
	if len(data) == 0 || len(data) > assetGridMaxBytes {
		return nil, errors.New("生成主图大小无效")
	}
	dimensions, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || dimensions.Width < 1 || dimensions.Height < 1 {
		return nil, errors.New("生成主图不是有效图片")
	}
	if int64(dimensions.Width)*int64(dimensions.Height) > 40_000_000 {
		return nil, errors.New("生成主图超过 4000 万像素")
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	decoded, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, errors.New("生成主图内容不完整，请重试保存")
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	// Preserve the original JPEG quality and all original pixels. Other formats
	// use the same high-quality white-matte JPEG convention as supplementary views.
	if format == "jpeg" {
		return data, nil
	}
	bounds := decoded.Bounds()
	matte := image.NewRGBA(image.Rect(0, 0, bounds.Dx(), bounds.Dy()))
	draw.Draw(matte, matte.Bounds(), image.NewUniform(color.White), image.Point{}, draw.Src)
	draw.Draw(matte, matte.Bounds(), decoded, bounds.Min, draw.Over)
	var output bytes.Buffer
	if err := jpeg.Encode(&output, matte, &jpeg.Options{Quality: 96}); err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}

func writeAssetCreationImage(ctx context.Context, root *os.Root, name string, data []byte) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	temporary := fmt.Sprintf(".%s-%d", name, time.Now().UnixNano())
	file, err := root.OpenFile(temporary, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return err
	}
	defer root.Remove(temporary)
	_, writeErr := file.Write(data)
	if writeErr == nil {
		writeErr = file.Sync()
	}
	closeErr := file.Close()
	if writeErr != nil {
		return writeErr
	}
	if closeErr != nil {
		return closeErr
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	return root.Rename(temporary, name)
}
