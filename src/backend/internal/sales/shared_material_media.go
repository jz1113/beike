package sales

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"

	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/storage"
)

// Copies have their own workspace paths so every existing consumer (including
// local FFmpeg and generation) can keep its normal workspace access checks.
type sharedMediaCopy struct {
	owner, prefix string
	dir           string
	keep          bool
	copied        map[string]string
}

func newSharedMediaCopy(owner, target string) *sharedMediaCopy {
	return &sharedMediaCopy{owner: owner, prefix: path.Join(target, "shared-materials", httpx.RequestID()), copied: map[string]string{}}
}
func (m *sharedMediaCopy) cleanup() {
	if m.dir != "" && !m.keep {
		_ = os.RemoveAll(m.dir)
	}
}
func (m *sharedMediaCopy) url(raw string) (string, error) {
	if !strings.HasPrefix(raw, "/storage/") {
		return raw, nil
	}
	if value, ok := m.copied[raw]; ok {
		return value, nil
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", err
	}
	rel := strings.TrimPrefix(u.Path, "/storage/")
	if path.Clean(rel) != rel || strings.Contains(rel, "\\") || !storage.WorkspaceRel(rel, m.owner, true) {
		return "", errors.New("invalid media owner or path")
	}
	ext := strings.ToLower(path.Ext(rel))
	switch ext {
	case ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".mp4", ".mov", ".webm", ".mp3", ".m4a", ".ogg", ".opus", ".aac", ".flac", ".wav":
	default:
		return "", errors.New("unsupported shared file")
	}
	// Confine symlink resolution to the owner's subtree as well as checking the URL.
	within := strings.TrimPrefix(rel, m.owner+"/")
	subroot := m.owner
	if within == rel { // Unprefixed local assets from older installations.
		if m.owner != "local" || !strings.HasPrefix(rel, "azhuo/") {
			return "", errors.New("unowned legacy file")
		}
		subroot = "azhuo"
		within = strings.TrimPrefix(rel, "azhuo/")
	}
	var in *os.File
	for _, root := range []string{storage.ResolveRoot(), ".azhuo_storage"} {
		in, err = os.OpenInRoot(filepath.Join(root, subroot), within)
		if err == nil {
			break
		}
	}
	if err != nil {
		return "", err
	}
	defer in.Close()
	info, err := in.Stat()
	if err != nil || !info.Mode().IsRegular() {
		return "", errors.New("shared media missing")
	}
	m.dir = storage.SafeWithin(storage.ResolveRoot(), m.prefix)
	if m.dir == "" {
		return "", errors.New("invalid destination")
	}
	if err = os.MkdirAll(m.dir, 0700); err != nil {
		return "", err
	}
	name := fmt.Sprintf("%x%s", sha256.Sum256([]byte(rel)), ext)
	out, err := os.OpenFile(filepath.Join(m.dir, name), os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return "", err
	}
	_, copyErr := io.Copy(out, in)
	closeErr := out.Close()
	if copyErr != nil {
		return "", copyErr
	}
	if closeErr != nil {
		return "", closeErr
	}
	value := "/storage/" + path.Join(m.prefix, name)
	m.copied[raw] = value
	return value, nil
}
func (m *sharedMediaCopy) rewriteJSON(field, raw string) (string, error) {
	var value any
	if err := json.Unmarshal([]byte(raw), &value); err != nil {
		if field == "dimensions" {
			return "", nil
		}
		return "", err
	}
	if obj, ok := value.(map[string]any); ok {
		switch field {
		case "scriptJson":
			delete(obj, "taxonomy") // Category and style IDs belong to the source workspace.
		case "dimensions":
			delete(obj, "salesAssetViewJobId")
			delete(obj, "salesImageImportKey")
			delete(obj, "defaultVoiceId") // The target can assign its own voice.
		}
	}
	var rewrite func(any) (any, error)
	rewrite = func(v any) (any, error) {
		switch node := v.(type) {
		case string:
			return m.url(node)
		case map[string]any:
			for key, child := range node {
				next, err := rewrite(child)
				if err != nil {
					return nil, err
				}
				node[key] = next
			}
		case []any:
			for i, child := range node {
				next, err := rewrite(child)
				if err != nil {
					return nil, err
				}
				node[i] = next
			}
		}
		return v, nil
	}
	value, err := rewrite(value)
	if err != nil {
		return "", err
	}
	encoded, err := json.Marshal(value)
	return string(encoded), err
}
