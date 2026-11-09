package depth

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"image"
	_ "image/png"
	"io"
	"math"
	"mime"
	"mime/multipart"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/system"
)

const depthSetupCommand = "npm run setup:depth-model"

func DepthImage(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			status, body := readDepthSubmission(cfg, r, "depth-image")
			httpx.WriteJSON(w, status, body)
			return
		}
		if !system.DepthModelReady(cfg.Root) {
			httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{
				"success": false, "submissionRejected": true,
				"error": "深度模型未就绪，请在终端执行：" + depthSetupCommand,
			})
			return
		}
		if !strings.Contains(r.Header.Get("Content-Type"), "multipart/form-data") {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请使用 multipart/form-data 上传图片"})
			return
		}
		depthImageForm(cfg, w, r)
	})
}

func extractDepthFrames(root, input, outDir string, maxWidth int, resolution string, probedFPS float64) (int, float64, error) {
	ffmpeg, ok := system.FFmpegBinary(root)
	if !ok {
		return 0, 0, errors.New("FFmpeg 不可用")
	}
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return 0, 0, err
	}
	fps := probedFPS
	if fps <= 0 {
		if probe, err := system.ProbeVideo(root, input); err == nil {
			fps = probe.FPS
		}
	}
	if maxWidth <= 0 {
		maxWidth = 1280
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	filter := "scale='min(" + strconv.Itoa(maxWidth) + ",iw)':-2"
	if resolution != "" {
		shortSide := strings.TrimSuffix(resolution, "p")
		filter = "scale='if(gte(iw,ih),-2," + shortSide + ")':'if(gte(iw,ih)," + shortSide + ",-2)':flags=lanczos"
	}
	args := []string{"-y", "-i", input, "-t", "30", "-vf", filter, "-vsync", "0", filepath.Join(outDir, "%06d.png")}
	cmd := exec.CommandContext(ctx, ffmpeg, args...)
	if err := cmd.Run(); err != nil {
		return 0, 0, errors.New("抽帧失败：未生成任何帧")
	}
	count := countPNG(outDir)
	if count == 0 {
		return 0, 0, errors.New("抽帧失败：未生成任何帧")
	}
	if fps <= 0 {
		fps = 24
	}
	if _, err := holdDepthTerminalBlackFrames(outDir, fps); err != nil {
		return 0, 0, errors.New("无法核对深度参考视频的片尾帧")
	}
	return count, fps, nil
}

func encodeDepthFrames(root, framesDir, output string, fps float64, crf int, preset string) error {
	ffmpeg, ok := system.FFmpegBinary(root)
	if !ok {
		return errors.New("FFmpeg 不可用")
	}
	if countPNG(framesDir) == 0 {
		return errors.New("编码失败：深度帧目录为空")
	}
	if err := os.MkdirAll(filepath.Dir(output), 0o755); err != nil {
		return err
	}
	if fps < 1 {
		fps = 1
	}
	if preset == "" {
		preset = "veryfast"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	cmd := exec.CommandContext(ctx, ffmpeg,
		"-y", "-framerate", strconv.FormatFloat(fps, 'f', -1, 64), "-i", filepath.Join(framesDir, "%06d.png"),
		"-c:v", "libx264", "-crf", strconv.Itoa(crf), "-preset", preset, "-pix_fmt", "yuv420p", "-movflags", "+faststart", output)
	if err := cmd.Run(); err != nil {
		return errors.New("深度视频编码失败")
	}
	return nil
}

func countPNG(dir string) int {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return 0
	}
	count := 0
	for _, entry := range entries {
		if strings.HasSuffix(strings.ToLower(entry.Name()), ".png") {
			count++
		}
	}
	return count
}

const depthImageFileBytes = 20 * 1024 * 1024

var depthImageName = regexp.MustCompile(`(?i)\.(jpe?g|png|webp|gif)$`)

func depthImageForm(cfg config.Config, w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, depthImageFileBytes+2*1024*1024+1))
	if err != nil || len(body) > depthImageFileBytes+2*1024*1024 {
		writeDepthImageTooLarge(w)
		return
	}
	file, fields, ok := readDepthImageFile(r.Header.Get("Content-Type"), body)
	if !ok {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{
			"success": false, "submissionRejected": true, "error": "深度图片生成失败",
		})
		return
	}
	if file == nil || !file.isFile {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "缺少图片文件 image"})
		return
	}
	if !strings.HasPrefix(file.mediaType, "image/") && !depthImageName.MatchString(file.name) {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请上传 JPG / PNG / WebP 图片文件"})
		return
	}
	if file.size > depthImageFileBytes {
		writeDepthImageTooLarge(w)
		return
	}
	runDepthImage(cfg, w, r, file, fields)
}

type depthImageFile struct {
	name      string
	mediaType string
	size      int
	isFile    bool
	data      []byte
}

func readDepthImageFile(contentType string, body []byte) (*depthImageFile, map[string]string, bool) {
	_, params, err := mime.ParseMediaType(contentType)
	if err != nil || params["boundary"] == "" {
		return nil, nil, false
	}
	reader := multipart.NewReader(bytes.NewReader(body), params["boundary"])
	fields := map[string]string{}
	var found *depthImageFile
	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			return found, fields, true
		}
		if err != nil {
			return nil, nil, false
		}
		data, err := io.ReadAll(part)
		_ = part.Close()
		if err != nil {
			return nil, nil, false
		}
		if part.FileName() == "" {
			if _, seen := fields[part.FormName()]; !seen {
				fields[part.FormName()] = string(data)
			}
			continue
		}
		if found != nil || part.FormName() != "image" {
			continue
		}
		mediaType, _, _ := mime.ParseMediaType(part.Header.Get("Content-Type"))
		found = &depthImageFile{
			name: part.FileName(), mediaType: mediaType, size: len(data), isFile: true, data: data,
		}
	}
}

func writeDepthImageTooLarge(w http.ResponseWriter) {
	httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{
		"success": false, "error": "图片过大，请控制在 20MB 以内",
	})
}

func runDepthImage(cfg config.Config, w http.ResponseWriter, r *http.Request, file *depthImageFile, fields map[string]string) {
	style := resolveDepthStyle(fields["style"], fields["colormap"])
	quality := resolveDepthQuality(fields["quality"])
	operation := strings.TrimSpace(r.Header.Get("x-idempotency-key"))
	if operation == "" {
		operation = strings.TrimSpace(fields["clientTaskId"])
	}
	fingerprint := depthFingerprint("depth-image", depthInputDigest(file.data), style, quality)
	status, body := guardDepth(cfg, r, "depth-image", operation, fingerprint, func() (int, map[string]any) {
		return executeDepthImage(cfg, httpx.WorkspaceFrom(r), file.data, style, quality)
	})
	httpx.WriteJSON(w, status, body)
}

func executeDepthImage(cfg config.Config, workspace string, data []byte, style, quality string) (int, map[string]any) {
	work, err := os.MkdirTemp("", "depth-image-")
	if err != nil {
		return depthFail("深度图片生成失败")
	}
	defer os.RemoveAll(work)
	input := filepath.Join(work, "input.jpg")
	output := filepath.Join(work, "output.png")
	if err := os.WriteFile(input, data, 0o600); err != nil {
		return depthFail("深度图片生成失败")
	}
	meta, err := runDepthPython(cfg.Root, "image", style, quality, map[string]string{"input": input, "output": output}, nil, nil)
	if err != nil {
		return depthFail(err.Error())
	}
	encoded, err := os.ReadFile(output)
	if err != nil {
		return depthFail("深度图片生成失败：无输出文件")
	}
	resultURL, err := persistDepthBytes(cfg, workspace, "image/png", encoded, "")
	if err != nil {
		return depthFail("深度图片生成失败")
	}
	body := map[string]any{"success": true, "resultUrl": resultURL, "style": style, "quality": quality}
	if meta.ModelID != "" {
		body["modelId"] = meta.ModelID
		body["inferenceSizePx"] = meta.InferenceSizePx
		body["device"] = meta.Device
	}
	return http.StatusOK, body
}

func depthFail(message string) (int, map[string]any) {
	return http.StatusInternalServerError, map[string]any{"success": false, "submissionRejected": true, "error": message}
}

type depthProfile struct {
	modelID    string
	maxWidthPx int
	videoCrf   int
	preset     string
}

func resolveDepthStyle(style, colormap string) string {
	switch style {
	case "mocap", "turbo", "raw":
		return style
	}
	if colormap == "turbo" {
		return "turbo"
	}
	return "mocap"
}

func resolveDepthQuality(value string) string {
	switch value {
	case "fast", "standard", "high":
		return value
	}
	return "standard"
}

func depthQualityProfile(quality string) depthProfile {
	switch resolveDepthQuality(quality) {
	case "fast":
		return depthProfile{modelID: "depth-anything/Depth-Anything-V2-Small-hf", maxWidthPx: 960, videoCrf: 23, preset: "veryfast"}
	case "high":
		return depthProfile{modelID: "depth-anything/Depth-Anything-V2-Large-hf", maxWidthPx: 2560, videoCrf: 15, preset: "slow"}
	default:
		return depthProfile{modelID: "depth-anything/Depth-Anything-V2-Small-hf", maxWidthPx: 960, videoCrf: 21, preset: "veryfast"}
	}
}

func formatDepthProgress(frame, total int) string {
	if total <= 0 {
		return "5%"
	}
	pct := int(float64(frame)/float64(total)*90) + 5
	if pct < 5 {
		pct = 5
	}
	if pct > 99 {
		pct = 99
	}
	return strconv.Itoa(pct) + "%"
}

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

// holdDepthTerminalBlackFrames keeps an abrupt, short, static end card from
// becoming invented scene geometry during depth inference. Only extracted
// temporary frames are changed; the original video and duration are preserved.
func holdDepthTerminalBlackFrames(dir string, fps float64) (int, error) {
	files, err := filepath.Glob(filepath.Join(dir, "*.png"))
	if err != nil {
		return 0, err
	}
	sort.Strings(files)
	maxTail := min(int(math.Ceil(fps)), len(files)/10)
	if maxTail < 2 {
		return 0, nil
	}
	last, err := depthFrameLuma(files[len(files)-1])
	if err != nil || !isDepthBlackCard(last) {
		return 0, err
	}
	start := len(files) - 1
	for start > 0 && len(files)-start <= maxTail {
		previous, readErr := depthFrameLuma(files[start-1])
		if readErr != nil {
			return 0, readErr
		}
		if !isDepthBlackCard(previous) || depthLumaDifference(previous, last) > 1.5 {
			break
		}
		start--
	}
	count := len(files) - start
	if count < 2 || count > maxTail || start == 0 {
		return 0, nil
	}
	before, err := depthFrameLuma(files[start-1])
	if err != nil {
		return 0, err
	}
	// An abrupt transition from a visible scene is required. Dark footage and
	// gradual fades are left intact instead of being mistaken for an end card.
	if depthLumaMean(before) < 40 || depthLumaDifference(before, last) < 40 {
		return 0, nil
	}
	frame, err := os.ReadFile(files[start-1])
	if err != nil {
		return 0, err
	}
	for _, path := range files[start:] {
		if err := os.WriteFile(path, frame, 0o600); err != nil {
			return 0, err
		}
	}
	return count, nil
}

func depthFrameLuma(path string) ([]float64, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	frame, _, err := image.Decode(file)
	if err != nil {
		return nil, err
	}
	bounds := frame.Bounds()
	const samples = 64
	values := make([]float64, 0, samples*samples)
	for y := range samples {
		for x := range samples {
			r, g, b, _ := frame.At(bounds.Min.X+x*bounds.Dx()/samples, bounds.Min.Y+y*bounds.Dy()/samples).RGBA()
			values = append(values, (0.299*float64(r)+0.587*float64(g)+0.114*float64(b))/257)
		}
	}
	return values, nil
}

func isDepthBlackCard(values []float64) bool {
	if len(values) == 0 || depthLumaMean(values) > 8 {
		return false
	}
	dark := 0
	for _, value := range values {
		if value < 24 {
			dark++
		}
	}
	return float64(dark)/float64(len(values)) >= 0.985
}

func depthLumaMean(values []float64) float64 {
	var total float64
	for _, value := range values {
		total += value
	}
	return total / float64(max(1, len(values)))
}

func depthLumaDifference(a, b []float64) float64 {
	var total float64
	for index, value := range a {
		total += math.Abs(value - b[index])
	}
	return total / float64(max(1, len(a)))
}
