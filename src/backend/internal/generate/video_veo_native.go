package generate

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/system"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

var veoResourcePath = regexp.MustCompile(`^(.*?/v1/projects/[\w.-]+/locations/[\w-]+/publishers/google)(?:/models(?:/[^/:]+(?::predictLongRunning|:fetchPredictOperation)?)?)?/?$`)
var veoOperationPath = regexp.MustCompile(`^projects/[\w.-]+/locations/[\w-]+/publishers/google/models/veo-3\.1-(?:fast-)?generate-001/operations/[\w-]+$`)

func veoModel(model string) bool { return regexp.MustCompile(`(?i)^veo-?3\.1`).MatchString(model) }

func veoNativeBase(base string) bool {
	u, err := url.Parse(base)
	if err != nil {
		return false
	}
	return strings.HasSuffix(u.Hostname(), ".aiplatform.googleapis.com") || u.Hostname() == "aiplatform.googleapis.com" || veoResourcePath.MatchString(u.Path)
}

func veoNativeURL(base, model string) (string, error) {
	u, err := url.Parse(base)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return "", errors.New("Veo 官方渠道地址不正确")
	}
	match := veoResourcePath.FindStringSubmatch(u.Path)
	if len(match) < 2 {
		return "", errors.New("Veo 官方渠道需要包含项目和区域的 Base URL：…/v1/projects/项目ID/locations/区域/publishers/google")
	}
	id := "veo-3.1-generate-001"
	if strings.Contains(strings.ToLower(model), "fast") {
		id = "veo-3.1-fast-generate-001"
	}
	return u.Scheme + "://" + u.Host + match[1] + "/models/" + id, nil
}

func encodeVeoOperation(name string) string {
	return "veo-op." + base64.RawURLEncoding.EncodeToString([]byte(name))
}

func decodeVeoOperation(id, base, model string) (string, error) {
	raw, err := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(id, "veo-op."))
	if err != nil || !strings.HasPrefix(id, "veo-op.") || !veoOperationPath.Match(raw) {
		return "", errors.New("Veo 操作编号无效")
	}
	endpoint, err := veoNativeURL(base, model)
	if err != nil {
		return "", err
	}
	u, _ := url.Parse(endpoint)
	start := strings.Index(u.Path, "/v1/projects/")
	prefix := strings.TrimPrefix(u.Path[start:], "/v1/") + "/operations/"
	if !strings.HasPrefix(string(raw), prefix) {
		return "", errors.New("Veo 操作不属于当前渠道的项目、区域或模型")
	}
	return string(raw), nil
}

func applyVeoNativeRoute(base string, payload map[string]json.RawMessage, a *videoAdapted) error {
	if a.family != "veo" || !veoNativeBase(base) {
		return nil
	}
	endpoint, err := veoNativeURL(base, a.modelID)
	if err != nil {
		return err
	}
	images, videos := videoFrameList(payload), rawStringList(payload["videos"])
	mode := resolveVideoMode(a.modelID, videoRefMode(payload), len(images), len(videos))
	instance := map[string]any{"prompt": rawString(payload, "prompt")}
	media := func(ref, mime string) map[string]string {
		if strings.HasPrefix(ref, "gs://") {
			if mime == "image/png" && (strings.HasSuffix(strings.ToLower(ref), ".jpg") || strings.HasSuffix(strings.ToLower(ref), ".jpeg")) {
				mime = "image/jpeg"
			}
			return map[string]string{"gcsUri": ref, "mimeType": mime}
		}
		return map[string]string{"url": ref, "mimeType": mime}
	}
	switch mode {
	case "extend":
		if len(videos) > 0 {
			instance["video"] = media(videos[0], "video/mp4")
		}
	case "first_frame", "first_last_frame":
		if len(images) > 0 {
			instance["image"] = media(images[0], "image/png")
		}
		if mode == "first_last_frame" && len(images) > 1 {
			instance["lastFrame"] = media(images[1], "image/png")
		}
	case "omni":
		refs := []map[string]any{}
		for _, ref := range images {
			refs = append(refs, map[string]any{"image": media(ref, "image/png"), "referenceType": "asset"})
		}
		instance["referenceImages"] = refs
	}
	parameters := map[string]any{"sampleCount": 1, "aspectRatio": a.ratio, "resolution": strings.ToLower(a.resolution), "generateAudio": true, "enhancePrompt": !rawBool(payload, "preserve_prompt")}
	if mode != "extend" {
		parameters["durationSeconds"] = a.duration
	}
	if audio, set := rawBoolPresent(payload, "audio"); set {
		parameters["generateAudio"] = audio
	}
	if payload["seed"] != nil {
		parameters["seed"] = rawNumber(payload, "seed")
	}
	a.payload = map[string]any{"instances": []map[string]any{instance}, "parameters": parameters}
	a.endpoints = []string{endpoint + ":predictLongRunning"}
	a.queries = []string{endpoint + ":fetchPredictOperation"}
	return nil
}

func normalizeVeoBindID(id string) (string, bool) {
	if veoOperationPath.MatchString(id) {
		return encodeVeoOperation(id), true
	}
	if !strings.HasPrefix(id, "veo-op.") || len(id) > 768 {
		return id, false
	}
	raw, err := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(id, "veo-op."))
	return id, err == nil && veoOperationPath.Match(raw)
}

// The components alias is the documented reference-image route on Comfly;
// ordinary image inputs on veo3.1 are interpreted as first/last frames.
func applyVeoComflyChannel(base string, input map[string]json.RawMessage, a *videoAdapted) {
	if a.family != "veo" || !minimaxComflyHost(base) {
		return
	}
	mode := rawString(input, "ref_mode")
	if mode == "omni" && len(a.images) > 0 {
		a.payload["model"] = "veo3.1-components"
		a.payload["images"] = a.images
		delete(a.payload, "reference_images")
	} else if strings.EqualFold(a.modelID, "veo3.1-fast") {
		a.payload["model"] = "veo3.1"
	}
	a.payload["enhance_prompt"] = !rawBool(input, "preserve_prompt")
	delete(a.payload, "enable_upsample")
}

type veoExtensionPlan struct {
	Version int               `json:"version"`
	Source  system.VideoProbe `json:"source"`
}

func veoExtensionDir(cfg config.Config, workspace, recordID string) string {
	root := cfg.DataDir()
	if root == "" {
		root = filepath.Join(cfg.Root, ".local")
	}
	return filepath.Join(root, "submission-receipts", "video-extension", videoDiagnosticDigest([]byte(workspace+"\x00"+recordID)))
}

// Persist the original clip before the paid submission so polling can resume after a restart.
func prepareVeoExtension(ctx context.Context, cfg config.Config, workspace, recordID string, input map[string]json.RawMessage, a *videoAdapted) error {
	binary, ok := system.FFmpegBinary(cfg.Root)
	if !ok {
		return errors.New("视频延长需要可用的 FFmpeg，请修复本机视频环境后重试")
	}
	refs := rawStringList(input["videos"])
	if len(refs) != 1 {
		return errors.New("视频延长需要一段视频")
	}
	body, err := readVeoMedia(ctx, cfg, refs[0], workspace, veoVideoLimit)
	if err != nil {
		return err
	}
	dir := veoExtensionDir(cfg, workspace, recordID)
	source := filepath.Join(dir, "source.mp4")
	if err = writeVeoFile(source, body); err != nil {
		return errors.New("延长原片保存失败，尚未提交生成")
	}
	probe, err := system.ProbeVideo(cfg.Root, source)
	if err != nil {
		return err
	}
	if probe.Duration < 1 || probe.Duration > 30.1 || probe.Width <= 0 || probe.Height <= 0 {
		return errors.New("Veo 延长原片需要 1–30 秒的有效视频")
	}
	ratio := float64(probe.Width) / float64(probe.Height)
	target := 16.0 / 9
	if a.ratio == "9:16" {
		target = 9.0 / 16
	}
	if math.Abs(ratio-target) > 0.04 {
		return errors.New("延长比例需要与原视频一致，请选择 16:9 或 9:16")
	}
	frame := filepath.Join(dir, "last.png")
	frameCtx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	cmd := exec.CommandContext(frameCtx, binary, "-nostdin", "-v", "error", "-y", "-sseof", "-1", "-i", source, "-an", "-vf", "reverse,scale='min(1920,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease", "-frames:v", "1", frame)
	if err = cmd.Run(); err != nil {
		return errors.New("无法提取原视频末帧，尚未提交生成")
	}
	image, err := os.ReadFile(frame)
	if err != nil {
		return err
	}
	plan, _ := json.Marshal(veoExtensionPlan{Version: 1, Source: probe})
	if err = writeVeoFile(filepath.Join(dir, "plan.json"), plan); err != nil {
		return err
	}
	a.duration = 8
	audio, set := rawBoolPresent(input, "audio")
	a.payload = veoOfficialPayload(a.modelID, rawString(input, "prompt"), "first_frame", a.ratio, a.resolution, 8, []string{"data:image/png;base64," + base64.StdEncoding.EncodeToString(image)}, nil, audio, set, rawBool(input, "watermark"))
	return nil
}

func finalizeVeoExtension(cfg config.Config, r *http.Request, taskID string, parsed pollParsed) pollParsed {
	if parsed.status != "SUCCESS" {
		return parsed
	}
	db, err := openTaskDB(cfg)
	if err != nil {
		return pollParsed{status: "IN_PROGRESS", progress: "95%", reason: "正在恢复视频拼接记录"}
	}
	defer db.Close()
	var recordID string
	err = db.QueryRowContext(r.Context(), `SELECT "id" FROM "ImageTask" WHERE "workspaceId" = ? AND "taskId" = ? AND "mediaType" = 'video' LIMIT 1`, workspaceOf(r), taskID).Scan(&recordID)
	if err != nil {
		return parsed
	}
	dir := veoExtensionDir(cfg, workspaceOf(r), recordID)
	raw, err := os.ReadFile(filepath.Join(dir, "plan.json"))
	if os.IsNotExist(err) {
		diagnostic := readVideoSubmissionDiagnostics(cfg, workspaceOf(r), recordID)
		if diagnostic != nil && diagnostic.ExtensionStrategy == "frame-continuation" {
			return pollParsed{status: "IN_PROGRESS", progress: "95%", reason: "延长原片记录缺失，请恢复原片记录后继续拼接，无需重新生成"}
		}
		return parsed
	}
	if err != nil {
		return pollParsed{status: "IN_PROGRESS", progress: "95%", reason: "延长续段已生成，等待读取原片记录"}
	}
	var plan veoExtensionPlan
	if json.Unmarshal(raw, &plan) != nil || plan.Version != 1 {
		return pollParsed{status: "IN_PROGRESS", progress: "95%", reason: "延长记录读取失败，请恢复原片记录"}
	}
	return queueVeoJoin(cfg, workspaceOf(r), recordID, parsed.result, plan)
}

func pollVeoNative(cfg config.Config, w http.ResponseWriter, r *http.Request, base, key, model, taskID string) {
	operation, err := decodeVeoOperation(taskID, base, model)
	if err != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": err.Error()})
		return
	}
	endpoint, _ := veoNativeURL(base, model)
	raw, _ := json.Marshal(map[string]string{"operationName": operation})
	ctx, cancel := context.WithTimeout(r.Context(), 90*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, endpoint+":fetchPredictOperation", strings.NewReader(string(raw)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+key)
	res, err := gateway.ModelHTTP().Do(req)
	if err != nil {
		writeProbeMiss(cfg, w, r, "video", taskID, "视频任务失败", "暂时无法查询 Veo 官方操作")
		return
	}
	defer res.Body.Close()
	dataBytes, err := io.ReadAll(io.LimitReader(res.Body, 180<<20))
	var data map[string]any
	if err != nil || res.StatusCode < 200 || res.StatusCode >= 300 || json.Unmarshal(dataBytes, &data) != nil {
		writeProbeMiss(cfg, w, r, "video", taskID, "视频任务失败", "Veo 官方查询未返回有效状态，请检查令牌是否过期")
		return
	}
	parsed := pollParsed{status: "IN_PROGRESS", progress: "30%"}
	if done, _ := data["done"].(bool); done {
		parsed, err = readVeoNativeResult(ctx, cfg, workspaceOf(r), taskID, key, data)
		if err != nil {
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "taskId": taskID, "status": "IN_PROGRESS", "progress": "95%", "failReason": err.Error()})
			return
		}
	}
	settleUnknownVideoTerminal(cfg, r, taskID, parsed, gateway.EncodeUsage(gateway.NormalizeUsage(data)))
	httpx.WriteJSON(w, http.StatusOK, polledTaskBody(r.Context(), cfg, scopeOf(r, "video"), taskID, parsed, data))
}

func readVeoNativeResult(ctx context.Context, cfg config.Config, workspace, taskID, key string, data map[string]any) (pollParsed, error) {
	if failure, ok := data["error"].(map[string]any); ok {
		return pollParsed{status: "FAILURE", reason: gateway.PresentUpstreamError(firstString(failure, "message")), progress: "0%"}, nil
	}
	response, _ := data["response"].(map[string]any)
	videos, _ := response["videos"].([]any)
	if len(videos) == 0 {
		return pollParsed{status: "FAILURE", reason: "Veo 未返回视频，可能被内容过滤", progress: "0%"}, nil
	}
	video, ok := videos[0].(map[string]any)
	if !ok {
		return pollParsed{}, errors.New("Veo 成片格式无效，尚未保存")
	}
	var body []byte
	if inline := firstString(video, "bytesBase64Encoded"); inline != "" {
		if len(inline) > base64.StdEncoding.EncodedLen(veoVideoLimit) {
			return pollParsed{}, errors.New("Veo 成片超过 128 MB 保存上限")
		}
		var err error
		body, err = base64.StdEncoding.DecodeString(inline)
		if err != nil {
			return pollParsed{}, errors.New("Veo 成片编码无效，尚未保存")
		}
	} else if uri := firstString(video, "gcsUri"); uri != "" {
		var err error
		body, err = readVeoGCS(ctx, uri, key)
		if err != nil {
			return pollParsed{}, err
		}
	}
	if len(body) < 12 || string(body[4:8]) != "ftyp" {
		return pollParsed{}, errors.New("Veo 尚未返回完整 MP4 成片，请稍后重试保存")
	}
	path, stored, err := veoResultLocation(cfg, workspace, taskID)
	if err != nil {
		return pollParsed{}, err
	}
	if err := writeVeoFile(path, body); err != nil {
		return pollParsed{}, errors.New("Veo 成片保存失败，原操作仍可继续查询，无需重新生成")
	}
	return pollParsed{status: "SUCCESS", progress: "100%", result: stored}, nil
}

func readVeoGCS(ctx context.Context, uri, key string) ([]byte, error) {
	u, err := url.Parse(uri)
	if err != nil || u.Scheme != "gs" || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path == "" {
		return nil, errors.New("Veo Cloud Storage 结果地址无效")
	}
	endpoint := "https://storage.googleapis.com/storage/v1/b/" + url.PathEscape(u.Host) + "/o/" + url.PathEscape(strings.TrimPrefix(u.Path, "/")) + "?alt=media"
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	req.Header.Set("Authorization", "Bearer "+key)
	client := *gateway.ModelHTTP()
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return errors.New("Veo 存储下载不能重定向") }
	res, err := client.Do(req)
	if err != nil {
		return nil, errors.New("Veo Cloud Storage 下载失败")
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, errors.New("无法读取 Veo Cloud Storage 结果，请检查该令牌的存储读取权限")
	}
	body, err := io.ReadAll(io.LimitReader(res.Body, veoVideoLimit+1))
	if err != nil || len(body) > veoVideoLimit {
		return nil, errors.New("Veo Cloud Storage 视频读取失败或超过 128 MB")
	}
	return body, nil
}
