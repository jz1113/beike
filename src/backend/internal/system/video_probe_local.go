package system

import (
	"context"
	"errors"
	"os/exec"
	"time"
)

// ProbeLocalVideo never resolves nested playlists, remote streams or protocols.
// Callers must still validate that path belongs to the authorized workspace.
func ProbeLocalVideo(ctx context.Context, root, path string) (VideoProbe, error) {
	binary, ok := binaryReady(root, "ffprobe")
	if !ok {
		return VideoProbe{}, errors.New("ffprobe 不可用")
	}
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, binary, "-v", "quiet", "-protocol_whitelist", "file,pipe",
		"-format_whitelist", "mov,matroska,webm", "-print_format", "json", "-show_streams", "-show_format", path)
	raw, err := cmd.Output()
	if err != nil {
		return VideoProbe{}, errors.New("无法读取本地视频流")
	}
	return parseProbe(raw)
}
