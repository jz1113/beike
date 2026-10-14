package assets

import (
	"os"
	"path/filepath"
	"strconv"
	"time"

	"beike.local/cloud/src/backend/internal/platform/storage"
)

// CleanupAssistantMedia removes expired assistant attachments under the storage root.
func CleanupAssistantMedia(now time.Time) {
	root := storage.ResolveRoot()
	directories := []string{filepath.Join(root, "assistant-attachments")}
	entries, _ := os.ReadDir(root)
	for _, entry := range entries {
		if entry.IsDir() {
			directories = append(directories, filepath.Join(root, entry.Name(), "assistant-attachments"))
		}
	}
	for _, directory := range directories {
		files, _ := os.ReadDir(directory)
		for _, file := range files {
			if file.IsDir() {
				continue
			}
			match := attachmentExpiryPattern.FindStringSubmatch("assistant-attachments/" + file.Name())
			if match == nil {
				continue
			}
			expires, err := strconv.ParseInt(match[1], 10, 64)
			if err != nil || expires > now.UnixMilli() {
				continue
			}
			_ = os.Remove(filepath.Join(directory, file.Name()))
		}
	}
}
