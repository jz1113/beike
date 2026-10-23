package catalog

import (
	"os"
	"path/filepath"

	"beike.local/cloud/src/backend/internal/config"
	learning "beike.local/cloud/src/backend/internal/platform/database/learning"
	"beike.local/cloud/src/backend/internal/platform/media"
	"beike.local/cloud/src/backend/internal/platform/storage"
)

func categoryImage(cfg config.Config, source string) (string, error) {
	root := storage.ResolveRoot()
	if os.Getenv("AZHUO_CACHE_DIR") == "" && cfg.DataDir() != "" {
		root = filepath.Join(cfg.DataDir(), "storage")
	}
	return media.VisionImageURL(root, source)
}

func categorySampleContent(cfg config.Config, folder learning.Folder, sample learning.Sample) ([]any, error) {
	content := []any{map[string]any{"type": "text", "text": observeSamplePrompt(folder, sample)}}
	for _, source := range sample.Images {
		image, err := categoryImage(cfg, source)
		if err != nil {
			return nil, err
		}
		content = append(content, map[string]any{"type": "image_url", "image_url": map[string]any{"url": image}})
	}
	return content, nil
}

func categoryFeedbackContent(cfg config.Config, content []any, recent []learning.Feedback) ([]any, error) {
	for i := len(recent) - 1; i >= 0 && i >= len(recent)-3; i-- {
		feedback := recent[i]
		for _, key := range []string{"productImage", "referenceImage", "resultImage"} {
			source, _ := feedback.Evidence[key].(string)
			if source == "" {
				continue
			}
			image, err := categoryImage(cfg, source)
			if err != nil {
				return nil, err
			}
			content = append(content, map[string]any{"type": "text", "text": "成图反馈 " + feedback.TaskID + " / " + key}, map[string]any{"type": "image_url", "image_url": map[string]any{"url": image}})
		}
	}
	return content, nil
}
