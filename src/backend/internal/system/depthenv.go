package system

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

const depthSetupCommand = "npm run setup:depth-model"

type depthEnvDetails struct {
	OpenCV          bool `json:"opencv"`
	Numpy           bool `json:"numpy"`
	Scipy           bool `json:"scipy"`
	Torch           bool `json:"torch"`
	Transformers    bool `json:"transformers"`
	DepthModelReady bool `json:"depthModelReady"`
}

func depthEnvHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ffmpegPath, ffmpegOK := binaryReady(cfg.Root, "ffmpeg")
		ffprobePath, ffprobeOK := binaryReady(cfg.Root, "ffprobe")
		depth := checkDepthEnv(cfg.Root)
		ready := ffmpegOK && ffprobeOK && depth.DepthModelReady
		message := "深度动作捕捉环境已就绪"
		if !ffmpegOK || !ffprobeOK {
			message = ffmpegDetail(ffmpegOK, ffprobeOK)
		} else if !depth.DepthModelReady {
			message = "深度模型未安装，请在终端执行：" + depthSetupCommand
		}
		httpx.WriteJSON(w, 200, map[string]any{
			"success": true, "ffmpeg": ffmpegOK, "ffprobe": ffprobeOK,
			"ffmpegPath": ffmpegPath, "ffprobePath": ffprobePath,
			"opencv": depth.OpenCV, "numpy": depth.Numpy, "scipy": depth.Scipy,
			"torch": depth.Torch, "transformers": depth.Transformers,
			"depthModelReady": depth.DepthModelReady, "pythonDepth": depth.DepthModelReady,
			"pythonDetail": depth.detail, "setupCommand": depthSetupCommand,
			"forceStub": false, "ready": ready, "message": message,
		})
	}
}

type depthStatus struct {
	depthEnvDetails
	detail string
}

func FFmpegReady(root string) bool {
	_, ok := binaryReady(root, "ffmpeg")
	return ok
}

func FFmpegBinary(root string) (string, bool) {
	return binaryReady(root, "ffmpeg")
}

func DepthModelReady(root string) bool {
	return checkDepthEnv(root).DepthModelReady
}

func checkDepthEnv(root string) depthStatus {
	script := filepath.Join(root, "tools/scripts/depth/infer_video_depth.py")
	fallback := depthStatus{detail: "Python 深度环境未检测"}
	if _, err := os.Stat(script); err != nil {
		fallback.detail = "推理脚本缺失"
		return fallback
	}
	python := strings.TrimSpace(os.Getenv("DEPTH_VIDEO_PYTHON"))
	if python == "" {
		python = "python3"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, python, script, "--check-env")
	cmd.Dir = root
	cmd.Env = append(os.Environ(), "PYTHONWARNINGS=ignore")
	out, err := cmd.CombinedOutput()
	parsed, ok := parseDepthStdout(string(out))
	if ok {
		return parsed
	}
	if err != nil {
		text := strings.TrimSpace(string(out))
		if text == "" {
			text = err.Error()
		}
		if len(text) > 300 {
			text = text[:300]
		}
		fallback.detail = text
	}
	return fallback
}

func parseDepthStdout(stdout string) (depthStatus, bool) {
	jsonLine := ""
	lines := strings.Split(stdout, "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		line := strings.TrimSpace(lines[i])
		if strings.HasPrefix(line, "{") && strings.HasSuffix(line, "}") {
			jsonLine = line
			break
		}
	}
	if jsonLine == "" {
		return depthStatus{}, false
	}
	var parsed depthEnvDetails
	if err := json.Unmarshal([]byte(jsonLine), &parsed); err != nil {
		return depthStatus{}, false
	}
	detail := "深度模型已就绪"
	if !parsed.DepthModelReady {
		detail = "深度模型未就绪，请执行 " + depthSetupCommand
	}
	return depthStatus{depthEnvDetails: parsed, detail: detail}, true
}

func ffmpegDetail(ffmpeg, ffprobe bool) string {
	if !ffmpeg && !ffprobe {
		return "内置 FFmpeg 不可用，请重启 API 后重试，或执行 npm run setup:depth-env"
	}
	if !ffmpeg {
		return "FFmpeg 不可用，但 ffprobe 正常"
	}
	return "FFmpeg 可用，但 ffprobe 不可用"
}

func binaryReady(root, name string) (string, bool) {
	candidate := bundledBinary(root, name)
	if candidate == "" {
		candidate = name
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, candidate, "-version")
	cmd.Stdout = &bytes.Buffer{}
	cmd.Stderr = &bytes.Buffer{}
	if err := cmd.Run(); err != nil {
		return candidate, false
	}
	return candidate, true
}

func bundledBinary(root, name string) string {
	platform := runtime.GOOS + "-" + runtime.GOARCH
	var rel string
	if name == "ffprobe" {
		rel = filepath.Join("node_modules", "ffprobe-static", "bin", runtime.GOOS, runtime.GOARCH, "ffprobe")
	} else {
		rel = filepath.Join("node_modules", "@ffmpeg-installer", platform, "ffmpeg")
	}
	candidate := filepath.Join(root, rel)
	if _, err := os.Stat(candidate); err == nil {
		return candidate
	}
	return ""
}
