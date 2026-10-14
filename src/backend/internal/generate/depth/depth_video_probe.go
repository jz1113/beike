package depth

import (
	"encoding/base64"
	"encoding/json"
	"os"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/system"
)

func depthVideoJSONProbe(cfg config.Config, body []byte) (int, string) {
	var payload struct {
		VideoDataURL string `json:"videoDataUrl"`
	}
	if json.Unmarshal(body, &payload) != nil {
		return 0, ""
	}
	raw := strings.TrimSpace(payload.VideoDataURL)
	comma := strings.Index(raw, ",")
	if !strings.HasPrefix(raw, "data:") || comma < 0 {
		return 0, ""
	}
	data, err := base64.StdEncoding.DecodeString(raw[comma+1:])
	if err != nil {
		return 0, ""
	}
	return depthVideoPreAccept(cfg, data)
}

func depthVideoPreAccept(cfg config.Config, data []byte) (int, string) {
	if len(data) == 0 {
		return 0, ""
	}
	file, err := os.CreateTemp("", "depth-probe-*")
	if err != nil {
		return 0, ""
	}
	name := file.Name()
	defer os.Remove(name)
	if _, err := file.Write(data); err != nil {
		_ = file.Close()
		return 0, ""
	}
	if err := file.Close(); err != nil {
		return 0, ""
	}
	probe, err := system.ProbeVideo(cfg.Root, name)
	if err != nil {
		return 0, ""
	}
	return depthVideoProbeHTTP(probe)
}

func depthVideoProbeHTTP(probe system.VideoProbe) (int, string) {
	if probe.Duration > 30 || probe.Width > 1280 || probe.Height > 1280 {
		return 0, ""
	}
	return 0, ""
}
