package library

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/storage"
)

// Store the downloaded originals, independently of the model's resized input.
// Content hashes make retries reuse files; workspace hashes keep storage isolated.
func archiveDeconstructOriginals(cfg config.Config, workspace string, images []string) ([]string, error) {
	root := jobStorageRoot(cfg)
	if root == "" {
		root = storage.ResolveRoot()
	}
	directory := storage.WorkspaceKey("references", workspace)
	if workspace == "" || strings.ContainsAny(workspace, "/\\") {
		return nil, errors.New("工作区无效")
	}
	if err := os.MkdirAll(filepath.Join(root, filepath.FromSlash(directory)), 0755); err != nil {
		return nil, err
	}
	out := make([]string, 0, len(images))
	for _, image := range images {
		_, encoded, ok := strings.Cut(image, ",")
		body, err := base64.StdEncoding.DecodeString(encoded)
		if !ok || err != nil || len(body) == 0 {
			return nil, errors.New("原图数据无效")
		}
		ext := map[string]string{"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}[http.DetectContentType(body)]
		if ext == "" {
			return nil, errors.New("原图格式无效")
		}
		sum := sha256.Sum256(body)
		relative := directory + "/" + hex.EncodeToString(sum[:]) + ext
		file, err := os.OpenFile(filepath.Join(root, filepath.FromSlash(relative)), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
		if err == nil {
			_, err = file.Write(body)
			closeErr := file.Close()
			if err != nil {
				return nil, err
			}
			if closeErr != nil {
				return nil, closeErr
			}
		} else if !os.IsExist(err) {
			return nil, err
		}
		out = append(out, "/storage/"+relative)
	}
	return out, nil
}
