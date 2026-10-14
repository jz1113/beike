package depth

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type depthMeta struct {
	ModelID         string
	InferenceSizePx int
	Device          string
	Quality         string
}

func runDepthPython(root string, mode, style, quality string, paths map[string]string, onProgress func(frame, total int), onMeta func(depthMeta)) (depthMeta, error) {
	script := filepath.Join(root, "tools/scripts/depth/infer_video_depth.py")
	if _, err := os.Stat(script); err != nil {
		return depthMeta{}, errors.New("深度推理脚本缺失")
	}
	for label, path := range paths {
		if err := assertDepthPath(root, path); err != nil {
			return depthMeta{}, errors.New(label + " 路径不在白名单根目录下")
		}
	}
	profile := depthQualityProfile(quality)
	python := strings.TrimSpace(os.Getenv("DEPTH_VIDEO_PYTHON"))
	if python == "" {
		python = "python3"
	}
	args := []string{script, "--style", style, "--quality", resolveDepthQuality(quality), "--model", profile.modelID, "--device", "auto", "--inference-size", "0"}
	if mode == "image" {
		args = append(args, "--input-image", paths["input"], "--output-image", paths["output"])
	} else {
		args = append(args, "--input-dir", paths["frames"], "--output-dir", paths["depth"])
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Minute)
	defer cancel()
	cmd := exec.CommandContext(ctx, python, args...)
	cmd.Dir = root
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return depthMeta{}, err
	}
	var stderr strings.Builder
	cmd.Stderr = &stderr
	if err := cmd.Start(); err != nil {
		return depthMeta{}, err
	}
	var meta depthMeta
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		parsed, progress, ok := parseDepthLine(scanner.Text())
		if !ok {
			continue
		}
		if progress {
			if onProgress != nil {
				onProgress(parsed.InferenceSizePx, parsed.DeviceN)
			}
			continue
		}
		meta = depthMeta{ModelID: parsed.ModelID, InferenceSizePx: parsed.InferenceSizePx, Device: parsed.Device, Quality: parsed.Quality}
		if onMeta != nil {
			onMeta(meta)
		}
	}
	if err := cmd.Wait(); err != nil {
		detail := strings.TrimSpace(stderr.String())
		if detail == "" {
			detail = "Python 推理失败"
		}
		if strings.Contains(detail, "setup:depth-model") {
			detail = "深度模型未就绪，请执行 " + depthSetupCommand
		}
		return depthMeta{}, errors.New(detail)
	}
	return meta, nil
}

type depthLine struct {
	ModelID         string
	InferenceSizePx int
	Device          string
	Quality         string
	DeviceN         int
}

func parseDepthLine(line string) (depthLine, bool, bool) {
	line = strings.TrimSpace(line)
	if !strings.HasPrefix(line, "{") {
		return depthLine{}, false, false
	}
	var payload struct {
		Type            string `json:"type"`
		Frame           int    `json:"frame"`
		Total           int    `json:"total"`
		ModelID         string `json:"modelId"`
		InferenceSizePx int    `json:"inferenceSizePx"`
		Device          string `json:"device"`
		Quality         string `json:"quality"`
	}
	if json.Unmarshal([]byte(line), &payload) != nil {
		return depthLine{}, false, false
	}
	if payload.Type == "progress" && payload.Frame > 0 && payload.Total > 0 {
		return depthLine{InferenceSizePx: payload.Frame, DeviceN: payload.Total}, true, true
	}
	if payload.Type == "meta" && payload.ModelID != "" && payload.InferenceSizePx > 0 && payload.Device != "" {
		return depthLine{ModelID: payload.ModelID, InferenceSizePx: payload.InferenceSizePx, Device: payload.Device, Quality: payload.Quality}, false, true
	}
	return depthLine{}, false, false
}

func assertDepthPath(root, path string) error {
	if strings.TrimSpace(path) == "" {
		return errors.New("empty")
	}
	resolved, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	real := resolved
	if info, statErr := os.Stat(resolved); statErr == nil {
		_ = info
		if linked, linkErr := filepath.EvalSymlinks(resolved); linkErr == nil {
			real = linked
		}
	}
	roots := []string{root, os.TempDir(), "/tmp", "/private/tmp", "/var", "/private/var"}
	for _, key := range []string{"AZHUO_STORAGE_DIR", "AZHUO_TMP_DIR", "AZHUO_CACHE_DIR", "AZHUO_DATA_DIR", "TMPDIR"} {
		if value := strings.TrimSpace(os.Getenv(key)); value != "" {
			roots = append(roots, value)
		}
	}
	for _, allowed := range roots {
		base, absErr := filepath.Abs(allowed)
		if absErr != nil {
			continue
		}
		if withinPath(resolved, base) || withinPath(real, base) {
			return nil
		}
	}
	return errors.New("outside")
}

func withinPath(path, root string) bool {
	path = filepath.Clean(path)
	root = filepath.Clean(root)
	return path == root || strings.HasPrefix(path, root+string(os.PathSeparator))
}
