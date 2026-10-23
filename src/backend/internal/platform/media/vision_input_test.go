package media

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestVisionReadsLocalOriginalsAndKeepsRemoteSignatures(t *testing.T) {
	root := t.TempDir()
	png, _ := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
	if err := os.WriteFile(filepath.Join(root, "original.png"), png, 0600); err != nil {
		t.Fatal(err)
	}
	result, err := VisionImageURL(root, "/storage/original.png")
	if err != nil || !strings.HasPrefix(result, "data:image/png;base64,") {
		t.Fatalf("local original not embedded: %s %v", result, err)
	}
	signed := "https://example.com/original.png?signature=x%2Fy&size=original"
	if got, err := VisionImageURL(root, signed); err != nil || got != signed {
		t.Fatal("signed remote URL rewritten")
	}
	for _, value := range []string{"/storage/../secret.env", "/storage/C:/secret", "/storage/missing.png", "/arbitrary/file"} {
		if _, err := VisionImageURL(root, value); err == nil {
			t.Fatalf("invalid local image accepted: %s", value)
		}
	}
}
