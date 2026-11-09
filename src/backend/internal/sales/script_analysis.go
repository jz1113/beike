package sales

import (
	"context"
	"crypto/sha256"
	_ "embed"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	"beike.local/cloud/src/backend/internal/system"
)

//go:embed reference-script-analysis.md
var scriptAnalysisPrompt string

// Sent only during in-app analysis. External conversations receive the editable brief.
const scriptOutputFields = `应用内分镜 JSON 字段（括号表示子字段，[] 表示数组）：
title、durationSec、format(presenter/hands/product/mixed)、voiceMode(speech/voiceover/mixed/none)、audioAvailable、overview。
visualSpec(aspectRatio、oneTake、styleSummary、lighting、cameraFeel、moodTags[]、pacing)，structure(hook、showcase、proof、closing)，taxonomy(categoryId、styleId 留空，productCategory、subCategory、styleCategory)，assetSlots(productViews[]、persona、scene、audio)。
shots[] 每镜 start、end 为秒数，estimated 表示估计，summary 填本镜简述，analysis(style、subject、action、camera、expression) 分别填本镜原片的画面风格、主体、动作描述、镜头变化、人物神态，各为不超过 300 字的字符串。每镜必须内嵌 beats 数组（1—24 段），只有一个动作也返回一段；动作段的起止秒数落在本镜时间内，顺序不重叠。固定机位内有多组可辨动作也要按变化分成多段，每段 referenceActionRaw 只写本段可见动作，段间边界仅凭采样推断时 estimated=true。连续动作中的眼神、手指、衣料细节放在同段描述。analysis 属于整个真实镜头；beats 是同一镜头内的动作段数组，每段作为独立分镜展示，必须分别填写 scene、subject、referenceActionRaw、shotSize、camera、expression，以呈现该时段的五项观察。每段含 start、end、estimated、purpose、shotSize、camera、subject、referenceActionRaw（原片动作）、actionTemplate（可复用的画面动作；仅在商品实际入画或被操作时以 {{商品}} 占位，空镜写可见物件、画面或机位变化）、productVisible（该段商品可见填 true，仅环境或无商品填 false，无人商品特写仍填 true，不确定时省略）、expression、scene、transition、requiredView、voice(mode、text、uncertain)、subtitle、shows（表格内容摘要）、cameraLabel（表格镜头方式）、sectionLabel（所属场景或造型段）。采样帧之间的切点为估计；未提供音轨时 audioAvailable=false，voice.mode=none。
sourceExclusions[] 每项含 type、term、replacementRule，原地点、室内外属性、天空天幕与背景为 scene，片尾文字卡为 copy_claim。片尾卡是独立剪辑内容，purpose 写 other；区分最后一个实质动作结束的时点和片尾时长，不虚构不存在的正常收势。reusable.requirements[] 为复用前提，review[] 为疑点。`

type scriptAnalysisRequest struct {
	VideoURL          string `json:"videoUrl"`
	Model             string `json:"model"`
	Force             bool   `json:"force"`
	ReasoningEffort   string `json:"reasoningEffort"`
	CustomBaseURL     string `json:"customBaseUrl"`
	CustomAPIKey      string `json:"customApiKey"`
	TextProtocol      string `json:"textProtocol"`
	APIFormat         string `json:"apiFormat"`
	AllowInsecureHTTP bool   `json:"allowInsecureHttp"`
}

type scriptVideoReader func(string, string) (string, error)

const scriptNativeVideoMessage = "所选模型渠道不能直接读取视频画面和声音。请选择 Gemini 协议的多模态模型（中转渠道需在设置中将文本协议设为 Gemini）。"

func scriptPromptVersion() string {
	digest := sha256.Sum256([]byte(scriptAnalysisPrompt + "|script-v5"))
	return "reference-script:" + hex.EncodeToString(digest[:6])
}

// ScriptAnalysisPrompt exposes the same instruction for manual analysis in an external chat.
func ScriptAnalysisPrompt(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		prompt, err := loadSalesPrompt(r.Context(), cfg, httpx.WorkspaceFrom(r), "script-analysis")
		if err != nil {
			promptStorageFailure(w, err)
			return
		}
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "prompt": prompt.Prompt, "promptVersion": prompt.Version})
	}
}

func ScriptAnalysis(cfg config.Config) http.HandlerFunc {
	return scriptAnalysisHandler(cfg, func(ctx context.Context, req gateway.TextRequest, responses bool) (int, map[string]any, error) {
		if responses {
			return gateway.CompleteResponses(ctx, req)
		}
		return gateway.CompleteText(ctx, req)
	}, readScriptVideo)
}

func lookupCachedScriptAnalysis(ctx context.Context, sqliteFile, workspace, videoHash, promptVersion, analysisKey string) *storedReferenceScript {
	if strings.TrimSpace(sqliteFile) == "" || videoHash == "" {
		return nil
	}
	db, err := database.OpenRequired(sqliteFile)
	if err != nil {
		return nil
	}
	defer db.Close()
	rows, err := db.QueryContext(ctx, `SELECT "id","model","scriptJson","version","status" FROM "SalesReferenceScript" WHERE "workspaceId"=? AND "videoHash"=? AND "promptVersion"=? AND "analysisKey"=? AND "status"!='archived' ORDER BY "updatedAt" DESC`, workspace, videoHash, promptVersion, analysisKey)
	if err != nil {
		return nil
	}
	defer rows.Close()
	for rows.Next() {
		var item storedReferenceScript
		var raw string
		if rows.Scan(&item.ID, &item.Model, &raw, &item.Version, &item.Status) != nil {
			return nil
		}
		var parsed map[string]any
		if json.Unmarshal([]byte(raw), &parsed) != nil || parsed == nil {
			continue
		}
		if _, err := validateScriptObject(parsed); err == nil {
			discardSourcePreviewLinks(parsed)
			item.Script = parsed
			return &item
		}
	}
	if rows.Err() != nil {
		return nil
	}
	return nil
}

func parseScriptReasoningEffort(raw string) (string, bool) {
	effort := strings.ToLower(strings.TrimSpace(raw))
	switch effort {
	case "", "auto":
		return "", true
	case "low", "medium", "high", "xhigh", "max":
		return effort, true
	default:
		return "", false
	}
}

func applyScriptReasoning(payload map[string]any, model, effort string) {
	if effort == "" {
		return
	}
	id := strings.ToLower(strings.TrimSpace(model))
	mapped := effort
	switch {
	case id == "kimi-k3" || id == "deepseek-v4-flash" || id == "deepseek-v4.1-flash" || id == "deepseek-flash":
		if effort == "low" {
			mapped = "low"
		} else if effort == "xhigh" || effort == "max" {
			mapped = "max"
		} else {
			mapped = "high"
		}
		payload["thinking"] = map[string]any{"type": "enabled"}
	case id == "qwen3.8-max":
		if effort != "low" && effort != "medium" {
			mapped = "xhigh"
		}
	case strings.HasPrefix(id, "gemini-"):
		if effort != "low" && effort != "medium" {
			mapped = "high"
		}
	case (id == "gpt-5.4-mini" || strings.HasPrefix(id, "grok-4")) && effort == "max":
		mapped = "xhigh"
	}
	payload["reasoning_effort"] = mapped
}

func scriptAnalysisHandler(cfg config.Config, complete summaryCompleter, read scriptVideoReader) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		fail := func(status int, message string) {
			httpx.WriteJSON(w, status, map[string]any{"success": false, "error": message})
		}
		var body scriptAnalysisRequest
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10))
		if decoder.Decode(&body) != nil || decoder.Decode(new(any)) != io.EOF {
			fail(400, "参考视频分析请求格式错误")
			return
		}
		body.VideoURL = strings.TrimSpace(body.VideoURL)
		defer holdScriptSource(httpx.WorkspaceFrom(r), body.VideoURL)()
		if body.VideoURL == "" || len(body.VideoURL) > 8192 {
			fail(400, "请先上传参考视频")
			return
		}
		effort, effortOK := parseScriptReasoningEffort(body.ReasoningEffort)
		if !effortOK {
			fail(400, "不支持的思考强度")
			return
		}
		var ok bool
		r, ok = generate.BindTextProtocol(w, r, map[string]any{"textProtocol": body.TextProtocol})
		if !ok {
			return
		}
		base, key, model, credentialErr := summaryCredentials(cfg, r, summaryRequest{Model: body.Model, CustomBaseURL: body.CustomBaseURL, CustomAPIKey: body.CustomAPIKey, APIFormat: body.APIFormat, AllowInsecureHTTP: body.AllowInsecureHTTP})
		if credentialErr != "" {
			fail(400, credentialErr)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 300*time.Second)
		defer cancel()
		responses := body.APIFormat == "openai-responses"
		protocol := gateway.TextProtocolForBase(ctx, model, base)
		if responses {
			protocol = "openai"
		}
		workspace := httpx.WorkspaceFrom(r)
		prompt, err := loadSalesPrompt(ctx, cfg, workspace, "script-analysis")
		if err != nil {
			promptStorageFailure(w, err)
			return
		}
		var content []any
		source, _ := localScriptVideoFile(body.VideoURL, workspace)
		videoHash := fileHash(source)
		// Injected readers may supply bytes without a local path. Hash those before checking the cache.
		if videoHash == "" {
			content, videoHash, err = buildScriptAnalysisContent(ctx, cfg.Root, workspace, body.VideoURL, protocol, responses, read)
			if err != nil {
				fail(400, err.Error())
				return
			}
		}
		promptVer := prompt.Version
		analysisKey := analysisRouteKey(model, base, protocol, effort, responses)
		if !body.Force {
			release, err := lockScriptAnalysis(ctx, strings.Join([]string{cfg.SQLiteFile(), workspace, videoHash, promptVer, analysisKey}, "\x00"))
			if err != nil {
				fail(408, "参考视频分析等待中断")
				return
			}
			defer release()

			if cached := lookupCachedScriptAnalysis(ctx, cfg.SQLiteFile(), workspace, videoHash, promptVer, analysisKey); cached != nil {
				existingID, cachedModel, cachedScript := cached.ID, cached.Model, cached.Script
				if cachedModel == "" {
					cachedModel = model
				}

				httpx.WriteJSON(w, 200, map[string]any{"success": true, "script": cachedScript, "model": cachedModel, "promptVersion": promptVer, "videoHash": videoHash, "existingId": existingID, "cached": true, "version": cached.Version, "status": cached.Status})
				return
			}
		}
		if content == nil {
			content, _, err = buildScriptAnalysisContent(ctx, cfg.Root, workspace, body.VideoURL, protocol, responses, read)
			if err != nil {
				fail(400, err.Error())
				return
			}
		}
		content = append(content, map[string]any{"type": "text", "text": scriptOutputFields})
		payload := map[string]any{"model": model, "max_tokens": 16000, "response_format": map[string]any{"type": "json_object"},
			"messages": []any{map[string]any{"role": "system", "content": []any{map[string]any{"type": "text", "text": prompt.Prompt}}}, map[string]any{"role": "user", "content": content}}}
		applyScriptReasoning(payload, model, effort)
		requestID := httpx.RequestID()
		log.Printf("[sales-script] request=%s stage=model model=%q protocol=%s parts=%d prompt=%s", requestID, model, protocol, len(content), promptVer)
		started := time.Now()
		status, data, err := complete(ctx, gateway.TextRequest{BaseURL: base, APIKey: key, Protocol: protocol, Payload: payload, Client: gateway.ModelHTTP(), Timeout: 300 * time.Second}, responses)
		log.Printf("[sales-script] request=%s stage=response elapsed_ms=%d status=%d", requestID, time.Since(started).Milliseconds(), status)
		if err != nil || status < 200 || status >= 300 {
			failure := classifySummaryFailure(ctx, status, err, key)
			log.Printf("[sales-script] request=%s stage=%s code=%s upstream_status=%d detail=%q", requestID, failure.Stage, failure.Code, status, failure.Detail)
			httpx.WriteJSON(w, 502, map[string]any{"success": false, "error": failure.Message, "code": failure.Code, "stage": failure.Stage, "upstreamStatus": status, "requestId": requestID})
			return
		}
		script, err := parseScriptCompletion(data)
		if err != nil {
			log.Printf("[sales-script] request=%s stage=validation detail=%q", requestID, err.Error())
			httpx.WriteJSON(w, 502, map[string]any{"success": false, "error": "参考脚本未通过检查：" + err.Error() + "；可重新分析", "code": "script_validation", "stage": "validation", "requestId": requestID})
			return
		}
		recordScriptObservations(content, script)
		if err := enrichScriptMedia(ctx, cfg.Root, workspace, body.VideoURL, script); err != nil {
			httpx.WriteJSON(w, 502, map[string]any{"success": false, "error": "参考脚本未通过检查：" + err.Error(), "code": "script_validation", "stage": "validation", "requestId": requestID})
			return
		}
		saved, err := persistAnalyzedScript(cfg, workspace, body.VideoURL, videoHash, model, promptVer, analysisKey, script, body.Force)
		if err != nil {
			httpx.WriteJSON(w, 200, map[string]any{"success": true, "script": script, "model": model, "promptVersion": promptVer, "videoHash": videoHash, "cached": false, "saveWarning": "脚本分析已完成，但尚未保存；请保留当前页面并重试保存，无需重新分析"})
			return
		}
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "existingId": saved.ID, "script": saved.Script, "version": saved.Version, "status": saved.Status, "model": model, "promptVersion": promptVer, "videoHash": videoHash, "cached": false})
	}
}

func buildScriptAnalysisContent(ctx context.Context, root, workspace, videoURL, protocol string, responses bool, read scriptVideoReader) ([]any, string, error) {
	if !responses && protocol == "gemini" {
		video, err := read(videoURL, workspace)
		if err == nil {
			sum := sha256.Sum256([]byte(video))
			return []any{
				map[string]any{"type": "text", "text": `{"mediaType":"video"}`},
				map[string]any{"type": "video_url", "video_url": map[string]any{"url": video}},
			}, hex.EncodeToString(sum[:16]), nil
		}
		if !strings.Contains(err.Error(), "16 MB") {
			return nil, "", err
		}
	}
	frames, duration, videoHash, err := extractScriptAnalysisFrames(ctx, root, workspace, videoURL)
	if err != nil {
		if !responses && protocol == "gemini" {
			return nil, "", errors.New("参考视频超过 16 MB，模型无法直接读取；请压缩后分析")
		}
		return nil, "", err
	}
	return frames, videoHash, func() error {
		if duration <= 0 {
			return errors.New("无法读取视频时长")
		}
		return nil
	}()
}

func extractScriptAnalysisFrames(ctx context.Context, root, workspace, videoURL string) ([]any, float64, string, error) {
	path, err := localScriptVideoFile(videoURL, workspace)
	if err != nil {
		return nil, 0, "", err
	}
	ffmpeg, ok := system.FFmpegBinary(root)
	if !ok {
		return nil, 0, "", errors.New(scriptNativeVideoMessage)
	}
	probe, err := system.ProbeLocalVideo(ctx, root, path)
	if err != nil || probe.Duration <= 0 {
		return nil, 0, "", errors.New("无法读取视频画面，请确认文件未损坏")
	}
	const sampleCount = 24
	dir, err := os.MkdirTemp("", "beike-script-frames-")
	if err != nil {
		return nil, 0, "", errors.New("参考视频画面准备失败")
	}
	defer os.RemoveAll(dir)
	interval := probe.Duration / float64(sampleCount)
	if interval <= 0 {
		interval = 0.2
	}
	filter := fmt.Sprintf("fps=%.9f:start_time=0,scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease", 1/interval)
	extractCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	pattern := filepath.Join(dir, "frame-%02d.jpg")
	cmd := exec.CommandContext(extractCtx, ffmpeg, "-y", "-i", path, "-t", fmt.Sprint(probe.Duration), "-an", "-vf", filter, "-frames:v", strconv.Itoa(sampleCount), "-q:v", "4", pattern)
	cmd.Stdout, cmd.Stderr = io.Discard, io.Discard
	if cmd.Run() != nil {
		return nil, 0, "", errors.New("参考视频关键帧抽取失败，请确认视频可播放后重试")
	}
	var frames []any
	var times []float64
	totalBase64 := 0
	for i := 1; i <= sampleCount; i++ {
		raw, readErr := os.ReadFile(filepath.Join(dir, fmt.Sprintf("frame-%02d.jpg", i)))
		if readErr != nil || len(raw) == 0 {
			continue
		}
		encoded := base64.StdEncoding.EncodeToString(raw)
		if len(frames) >= sampleCount || totalBase64+len(encoded) >= 8_000_000 {
			break
		}
		totalBase64 += len(encoded)
		at := roundTenth(float64(i-1) * interval)
		times = append(times, at)
		frames = append(frames, map[string]any{"type": "image_url", "image_url": map[string]any{"url": "data:image/jpeg;base64," + encoded}})
	}
	if len(frames) == 0 {
		return nil, 0, "", errors.New("未能读取参考视频画面，请确认视频可播放后重试")
	}
	timesJSON, _ := json.Marshal(times)
	header := fmt.Sprintf(`{"mediaType":"sampled_frames","durationSec":%.1f,"frameCount":%d,"sampleTimesSec":%s,"audioProvided":false}`, probe.Duration, len(frames), timesJSON)
	content := make([]any, 0, len(frames)+1)
	content = append(content, map[string]any{"type": "text", "text": header})
	content = append(content, frames...)
	return content, probe.Duration, fileHash(path), nil
}

// Only uploaded workspace videos are read; browser blobs and arbitrary paths are rejected.
func readScriptVideo(source, workspace string) (string, error) {
	file, err := localScriptVideoFile(source, workspace)
	if err != nil {
		return "", err
	}
	mime := scriptVideoMIME[strings.ToLower(filepath.Ext(file))]
	handle, err := os.Open(file)
	if err != nil {
		return "", errors.New("参考视频不可读取，请重新上传")
	}
	defer handle.Close()
	data, err := io.ReadAll(io.LimitReader(handle, gateway.TextVideoInlineByteLimit+1))
	if err != nil || len(data) == 0 {
		return "", errors.New("参考视频不可读取，请重新上传")
	}
	if len(data) > gateway.TextVideoInlineByteLimit {
		return "", errors.New("参考视频超过 16 MB，模型无法直接读取；请压缩后分析")
	}
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(data), nil
}

var scriptAnalysisPending sync.Map

// Waiters recheck persisted results after the owner exits, including after a canceled first attempt.
func lockScriptAnalysis(ctx context.Context, key string) (func(), error) {
	for {
		done := make(chan struct{})
		current, loaded := scriptAnalysisPending.LoadOrStore(key, done)
		if !loaded {
			return func() { scriptAnalysisPending.Delete(key); close(done) }, nil
		}
		select {
		case <-current.(chan struct{}):
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
}
func analysisRouteKey(model, base, protocol, effort string, responses bool) string {
	route, _ := json.Marshal([]any{"analysis-v3", scriptOutputFields, model, base, protocol, responses, effort})
	digest := sha256.Sum256(route)
	return hex.EncodeToString(digest[:])
}

// Capture what was actually attached to the model. The file may have an audio
// track even though the selected protocol received only still images.
func recordScriptObservations(content []any, script map[string]any) {
	if len(content) == 0 {
		return
	}
	first, _ := content[0].(map[string]any)
	var meta struct {
		Kind  string    `json:"mediaType"`
		Times []float64 `json:"sampleTimesSec"`
	}
	if json.Unmarshal([]byte(assetCreationText(first["text"])), &meta) != nil || meta.Kind != "sampled_frames" {
		return
	}
	script["sampleTimesSec"] = meta.Times
	notes, _ := script["review"].([]any)
	note := fmt.Sprintf("本次模型只读取 %d 帧采样画面。镜头边界为估计值，未提供音轨；口播、音乐、音效需对照原视频核对。", len(meta.Times))
	if len(notes) < 20 {
		script["review"] = append(notes, note)
	}
	shots, _ := script["shots"].([]any)
	for _, item := range shots {
		shot, _ := item.(map[string]any)
		beats, _ := shot["beats"].([]any)
		for _, item := range beats {
			beat, _ := item.(map[string]any)
			voice, _ := beat["voice"].(map[string]any)
			if voice != nil {
				voice["text"] = ""
				voice["linePattern"] = ""
				voice["uncertain"] = true
			}
		}
	}
}

// Optional historical fields remain optional, but provided visual data must not
// pass as objects/null and then disappear during browser normalization.
func validateScriptVisualFields(object map[string]any) error {
	checkText := func(record map[string]any, key, label string, limit int) error {
		value, exists := record[key]
		if !exists {
			return nil
		}
		text, ok := value.(string)
		if !ok {
			return fmt.Errorf("%s（%s）必须为字符串", label, key)
		}
		if len([]rune(text)) > limit {
			return fmt.Errorf("%s（%s）超过 %d 字，请精简后重试", label, key, limit)
		}
		return nil
	}
	if raw, exists := object["visualSpec"]; exists {
		visual, ok := raw.(map[string]any)
		if !ok {
			return fmt.Errorf("全局摄影描述（visualSpec）必须为对象")
		}
		for key, limit := range map[string]int{"styleSummary": 600, "lighting": 300, "cameraFeel": 300} {
			if err := checkText(visual, key, "全局摄影描述", limit); err != nil {
				return err
			}
		}
	}
	shots, _ := object["shots"].([]any)
	for shotIndex, rawShot := range shots {
		shot, _ := rawShot.(map[string]any)
		if raw, exists := shot["analysis"]; exists {
			analysis, ok := raw.(map[string]any)
			if !ok {
				return fmt.Errorf("镜头 %d 的分镜分析必须为对象", shotIndex+1)
			}
			for _, key := range []string{"style", "subject", "action", "camera", "expression"} {
				if err := checkText(analysis, key, fmt.Sprintf("镜头 %d 的分镜分析", shotIndex+1), 300); err != nil {
					return err
				}
			}
		}
		beats, _ := shot["beats"].([]any)
		for beatIndex, rawBeat := range beats {
			beat, _ := rawBeat.(map[string]any)
			label := fmt.Sprintf("镜头 %d 动作段 %d 的画面描述", shotIndex+1, beatIndex+1)
			if value, exists := beat["productVisible"]; exists {
				if _, ok := value.(bool); !ok {
					return fmt.Errorf("%s（productVisible）必须为布尔值", label)
				}
			}
			for key, limit := range map[string]int{
				"shotSize": 120, "camera": 500, "subject": 800,
				"action": 1500, "actionTemplate": 1500, "referenceActionRaw": 1500,
				"scene": 600, "expression": 600, "transition": 400,
				"sectionLabel": 80, "cameraLabel": 80, "shows": 800,
			} {
				if err := checkText(beat, key, label, limit); err != nil {
					return err
				}
			}
			action, _ := beat["action"].(string)
			template, _ := beat["actionTemplate"].(string)
			if strings.TrimSpace(action) == "" && strings.TrimSpace(template) == "" {
				return fmt.Errorf("镜头 %d 的动作段 %d 缺少动作模板描述", shotIndex+1, beatIndex+1)
			}
		}
	}
	return nil
}
