package library

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/storage"
)

func TestReferenceArchiveRetainsBytesAndIsReadableByWorkspace(t *testing.T) {
	root := t.TempDir()
	cfg := config.Config{DatabaseURL: "file:" + filepath.Join(root, "test.db")}
	image := "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
	first, err := archiveDeconstructOriginals(cfg, "workspace-a", []string{image})
	if err != nil {
		t.Fatal(err)
	}
	second, err := archiveDeconstructOriginals(cfg, "workspace-a", []string{image})
	if err != nil || first[0] != second[0] {
		t.Fatal("retries did not reuse original", err)
	}
	rel := strings.TrimPrefix(first[0], "/storage/")
	if !storage.WorkspaceRel(rel, "workspace-a", false) || storage.WorkspaceRel(rel, "workspace-b", false) {
		t.Fatal("archive workspace isolation failed")
	}
	body, err := os.ReadFile(filepath.Join(root, "storage", filepath.FromSlash(rel)))
	if err != nil {
		t.Fatal(err)
	}
	if base64.StdEncoding.EncodeToString(body) != strings.SplitN(image, ",", 2)[1] {
		t.Fatal("archived reference lost original bytes")
	}
}

func TestIncompleteReferenceCountsFailBeforeDownload(t *testing.T) {
	for _, count := range []int{2, 3, 5, 6, 7, 9, 10} {
		_, _, err := prepareDeconstructImages(config.Config{}, make([]string, count))
		if err == nil || !strings.Contains(err.Error(), "4 张或 8 张") {
			t.Fatalf("count=%d: %v", count, err)
		}
	}
}
