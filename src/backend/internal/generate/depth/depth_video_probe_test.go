package depth

import (
	"testing"

	"beike.local/cloud/src/backend/internal/system"
)

func TestDepthVideoProbeDoesNotRejectAfterAccept(t *testing.T) {
	status, message := depthVideoProbeHTTP(system.VideoProbe{Duration: 31, Width: 1920, Height: 1080})
	if status != 0 || message != "" {
		t.Fatalf("submit status %d %s", status, message)
	}
}
