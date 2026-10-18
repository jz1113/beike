package generate

import (
	"strings"
	"testing"
)

func TestImageFamilyRouting(t *testing.T) {
	if imageFamily("doubao-seedream-4-0-250828") != "seedream" {
		t.Fatal("seedream")
	}
	if imageFamily("gpt-image-2") != "openai-dalle" || imageFamily("nano-banana-pro") != "gemini-nano" {
		t.Fatal("image families")
	}
	urls := imageSubmitURLs("https://gw.example/v1", false, imageFamily("doubao-seedream-4-0-250828"), "doubao-seedream-4-0-250828")
	if len(urls) == 0 || !strings.Contains(urls[0], "/v1/images/generations") {
		t.Fatalf("urls %v", urls)
	}
}
