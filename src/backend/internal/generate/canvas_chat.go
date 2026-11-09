package generate

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/network"
	"beike.local/cloud/src/backend/internal/system"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Preserve tool calls and multimodal messages when the canvas uses its text model.
func writeCanvasChat(cfg config.Config, w http.ResponseWriter, r *http.Request, p map[string]any) {
	model, _ := p["model"].(string)
	base, key, upstream, status, message := canvasCredentials(cfg, r, p, model)
	if message != "" {
		httpx.WriteJSON(w, status, map[string]any{"error": message})
		return
	}
	wire := map[string]any{"model": upstream}
	for _, field := range []string{"messages", "tools", "tool_choice", "temperature", "max_tokens", "response_format", "reasoning_effort"} {
		if v := p[field]; v != nil {
			wire[field] = v
		}
	}
	req := gateway.TextRequest{BaseURL: base, APIKey: key, Protocol: gateway.TextProtocolForBase(r.Context(), upstream, base), Payload: wire, Client: canvasHTTP(), Timeout: 3 * time.Minute}
	if req.Protocol == "gemini" {
		if err := inlineCanvasChatVideos(r.Context(), wire); err != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
			return
		}
	}
	complete := gateway.CompleteText
	if p["apiFormat"] == "openai-responses" {
		if enabled, _ := p["canvasWebSearch"].(bool); enabled {
			wire["canvasWebSearch"] = true
		}
		complete = gateway.CompleteResponses
	}
	var evidence *canvasStoryboardEvidence
	var observed map[string]any
	var observation string
	if p["beikeStoryboardAnalysis"] == true {
		var err error
		evidence, err = prepareCanvasStoryboard(r.Context(), cfg, wire)
		if err != nil {
			httpx.WriteJSON(w, 422, map[string]any{"error": err.Error()})
			return
		}
		log.Printf("[canvas-analysis] measured %.3fs, content %.3fs, %d candidate shots", evidence.Duration, evidence.ContentEnd, len(evidence.Shots))
		code, stage := canvasObservationReceipt(cfg, r, p, http.HandlerFunc(func(w http.ResponseWriter, stageRequest *http.Request) {
			status, data, callErr := complete(stageRequest.Context(), canvasObservationRequest(req, evidence))
			if callErr != nil || status < 200 || status >= 300 {
				httpx.WriteJSON(w, 502, map[string]any{"success": false, "stage": "observation", "error": "05逐镜观察结果待核对，请查询原回执，不要重新分析"})
				return
			}
			text, parseErr := canvasObservationText(data, evidence)
			if parseErr != nil {
				httpx.WriteJSON(w, 502, map[string]any{"success": false, "stage": "observation", "error": parseErr.Error()})
				return
			}
			httpx.WriteJSON(w, 200, map[string]any{"success": true, "observation": text, "storyboardEvidence": evidence, "usage": data["usage"]})
		}))
		if code != 200 || stage["success"] != true || stage["submissionUnknown"] == true {
			httpx.WriteJSON(w, code, stage)
			return
		}
		observation, _ = stage["observation"].(string)
		observed = stage

		canvasStoryboardAdaptation(wire, evidence, observation)
	}
	status, data, err := complete(r.Context(), req)
	if err != nil || status < 200 || status >= 300 || data["choices"] == nil {
		detail := "上游未返回可用的 choices"
		if err != nil {
			detail = err.Error()
		}
		if key != "" {
			detail = strings.ReplaceAll(detail, key, "[redacted]")
		}
		detail = gateway.PresentUpstreamError(detail)
		if len([]rune(detail)) > 1000 {
			detail = string([]rune(detail)[:1000])
		}
		failure := map[string]any{"success": false, "stage": "result", "observation": observation, "storyboardEvidence": evidence, "error": fmt.Sprintf("文本模型 %s 调用失败（协议 %s，HTTP %d）：%s", upstream, req.Protocol, status, detail)}
		if evidence != nil && status == http.StatusBadRequest && canvasStoryboardImageRejected(detail) {
			failure["submissionRejected"] = true
		}
		httpx.WriteJSON(w, http.StatusBadGateway, failure)
		return
	}
	if observed != nil {
		combineCanvasUsage(observed, data)
	}
	choices, _ := data["choices"].([]any)
	for _, value := range choices {
		choice, _ := value.(map[string]any)
		message, _ := choice["message"].(map[string]any)
		if observation != "" {
			if text, ok := message["content"].(string); ok {
				if at := strings.Index(text, "【原片风格分析】"); at >= 0 {
					message["content"] = "【原片观察】\n" + observation + "\n" + text[at:]
				}
			}
		}
		delete(message, "native_content")
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "stage": "result", "observation": observation, "choices": choices, "model": upstream, "usage": data["usage"], "object": "chat.completion", "storyboardEvidence": evidence})
}

// Media downloads never inherit gateway credentials or its custom transport.
var canvasVideoHTTP = func() *http.Client { return network.SafeClient() }

var errCanvasVideoIncomplete = errors.New("参考视频下载未完成，请检查素材链接或重新上传")

func inlineCanvasChatVideos(ctx context.Context, wire map[string]any) error {
	messages, _ := wire["messages"].([]any)
	for _, raw := range messages {
		message, _ := raw.(map[string]any)
		parts, _ := message["content"].([]any)
		for _, raw := range parts {
			part, _ := raw.(map[string]any)
			if part["type"] != "video_url" {
				continue
			}
			video, _ := part["video_url"].(map[string]any)
			source, _ := video["url"].(string)
			if strings.HasPrefix(source, "data:video/") {
				continue
			}
			data, err := downloadCanvasChatVideo(ctx, source)
			if err != nil {
				return err
			}
			video["url"] = data
		}
	}
	return nil
}

func downloadCanvasChatVideo(ctx context.Context, source string) (string, error) {
	u, err := url.Parse(source)
	if err != nil || u.Scheme != "https" && u.Scheme != "http" || u.Host == "" || u.User != nil {
		return "", errors.New("参考视频地址无效，请重新上传")
	}
	data, err := fetchCanvasChatVideo(ctx, u)
	if errors.Is(err, errCanvasVideoIncomplete) && ctx.Err() == nil {
		// Retry only the media GET, before submitting any model request.
		return fetchCanvasChatVideo(ctx, u)
	}
	return data, err
}

func fetchCanvasChatVideo(ctx context.Context, u *url.URL) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return "", errors.New("参考视频下载请求无效")
	}
	response, err := canvasVideoHTTP().Do(req)
	if err != nil {
		return "", errors.New("参考视频下载失败，请检查素材链接是否可访问")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return "", fmt.Errorf("参考视频下载失败（HTTP %d）", response.StatusCode)
	}
	if response.ContentLength > gateway.TextVideoInlineByteLimit {
		return "", errors.New("原生视频分析素材超过16MB，请压缩后重试")
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, gateway.TextVideoInlineByteLimit+1))
	if err != nil {
		return "", errCanvasVideoIncomplete
	}
	if len(data) == 0 || len(data) > gateway.TextVideoInlineByteLimit {
		return "", errors.New("原生视频分析素材为空或超过16MB")
	}
	mediaType, _, _ := mime.ParseMediaType(response.Header.Get("Content-Type"))
	if !strings.HasPrefix(mediaType, "video/") {
		mediaType = http.DetectContentType(data)
	}
	if mediaType != "video/mp4" && mediaType != "video/quicktime" && mediaType != "video/webm" {
		return "", errors.New("原生视频分析支持 MP4、MOV 和 WebM")
	}
	return "data:" + mediaType + ";base64," + base64.StdEncoding.EncodeToString(data), nil
}

const canvasObservationInstruction = `你只负责原片逐镜事实核对，不改编、不设计目标人物服装场景、不写最终视频提示词。程序提供实测时长、候选切点及每镜首中尾三帧。逐镜输出且保留编号【原片镜头 01】等，每镜写：源片范围、景别机位、首态、动作的接触对象与方向、视线转移、停顿、末态、光源方向与阴影证据。逐帧不能证明的连续动作明确标为无法确认，不把端点姿态猜成完整动作。相邻三帧只证明可见事实；候选切点不是事实，闪光或大动作需标为疑似切点，真正切镜不能因构图相似而漏掉。只记录可见人物和物体，不将书本、相机、猫或头发等互相替换。末尾黑场不计入内容。保留每个候选编号，即便判为同镜连续动作也注明关联，禁止只输出摘要。声音未提供可听证据时写未核实，不臆造旁白或台词。`

func canvasObservationMessages(e *canvasStoryboardEvidence) []any {
	return []any{map[string]any{"role": "system", "content": canvasObservationInstruction}, map[string]any{"role": "user", "content": e.parts}}
}
func canvasObservationText(data map[string]any, e *canvasStoryboardEvidence) (string, error) {
	choices := anySlice(data["choices"])
	if len(choices) == 0 {
		return "", errors.New("05原片观察未返回内容")
	}
	choice, _ := choices[0].(map[string]any)
	message, _ := choice["message"].(map[string]any)
	text, _ := message["content"].(string)
	if reason, _ := choice["finish_reason"].(string); reason != "stop" || strings.TrimSpace(text) == "" {
		return "", errors.New("05逐镜观察未完整返回，请重试")
	}
	for _, shot := range e.Shots {
		if !strings.Contains(text, fmt.Sprintf("【原片镜头 %02d】", shot.Index)) {
			return "", errors.New("05逐镜观察遗漏镜号，已停止改编，请重试")
		}
	}
	return text, nil
}
func canvasStoryboardAdaptation(wire map[string]any, e *canvasStoryboardEvidence, observation string) {
	// The original video has already been analyzed. Keep target images and text,
	// but never forward the video to the adaptation model as a visual attachment.
	var messages []any
	for _, raw := range anySlice(wire["messages"]) {
		message, _ := raw.(map[string]any)
		if parts, ok := message["content"].([]any); ok {
			kept := make([]any, 0, len(parts))
			for _, item := range parts {
				part, _ := item.(map[string]any)
				if part["type"] != "video_url" {
					kept = append(kept, item)
				}
			}
			if len(kept) == 0 && len(parts) > 0 {
				continue
			}
			message["content"] = kept
		}
		messages = append(messages, raw)
	}
	wire["messages"] = append(messages, map[string]any{"role": "user", "content": fmt.Sprintf(`【已核实的原片逐镜观察】
程序实测全片%.3f秒，有效画面至%.3f秒，共%d个候选镜头。以下逐镜观察来自单独的首中尾帧核对，引用时保留源镜号；未确认的内容不能补成事实。
%s
【已核实的原片逐镜观察结束】
现在只进行目标改编：先在【原片观察】原样保留上述事实与不确定项，再依据目标人物/服装/场景和创作要求逐镜改编。每个本地时间轴区间注明对应源镜号，保留重要切点、景别和动作因果，不把多个镜头概括成持续把玩相机或站立摆姿。用户要求单条15秒时输出一个15秒视频片段，内部多镜头；剔除黑尾、明确记录必要取舍，不加速塞入全部动作。输出完整参考图与三个准备交接区，07继续由官方技能整理视频提示词。`, e.Duration, e.ContentEnd, len(e.Shots), observation)})
	wire["max_tokens"] = 16384
	wire["reasoning_effort"] = "low"
}
func combineCanvasUsage(first, second map[string]any) {
	a, _ := first["usage"].(map[string]any)
	b, _ := second["usage"].(map[string]any)
	if a == nil {
		return
	}
	if b == nil {
		second["usage"] = a
		return
	}
	for _, key := range []string{"prompt_tokens", "completion_tokens", "total_tokens", "input_tokens", "output_tokens"} {
		av, aok := a[key].(float64)
		bv, bok := b[key].(float64)
		if aok || bok {
			b[key] = av + bv
		}
	}
}

// Same configured text route and protocol for both calls; no fallback to another provider.
func canvasObservationRequest(req gateway.TextRequest, e *canvasStoryboardEvidence) gateway.TextRequest {
	req.Payload = map[string]any{"model": req.Payload["model"], "messages": canvasObservationMessages(e), "max_tokens": 16384, "reasoning_effort": "low"}
	return req
}

type canvasShot struct {
	Index int     `json:"index"`
	Start float64 `json:"start"`
	End   float64 `json:"end"`
}
type canvasStoryboardEvidence struct {
	Duration   float64      `json:"duration"`
	ContentEnd float64      `json:"contentEnd"`
	Shots      []canvasShot `json:"shots"`
	parts      []any
}

var canvasSceneTime = regexp.MustCompile(`pts_time:([0-9.]+)`)
var canvasBlackStart = regexp.MustCompile(`black_start:([0-9.]+)`)

// Candidate boundaries remain observations to verify, rather than invented model timestamps.
func canvasShotBoundaries(duration float64, log string) (float64, []canvasShot, error) {
	end := duration
	for _, m := range canvasBlackStart.FindAllStringSubmatch(log, -1) {
		v, _ := strconv.ParseFloat(m[1], 64)
		if v > duration-0.6 && v < end {
			end = v
		}
	}
	boundaries := []float64{0}
	for _, m := range canvasSceneTime.FindAllStringSubmatch(log, -1) {
		v, _ := strconv.ParseFloat(m[1], 64)
		if v > 0.15 && v < end-0.15 {
			boundaries = append(boundaries, v)
		}
	}
	sort.Float64s(boundaries)
	clean := boundaries[:1]
	for _, v := range boundaries[1:] {
		if v-clean[len(clean)-1] >= 0.15 {
			clean = append(clean, v)
		}
	}
	clean = append(clean, end)
	if len(clean) > 33 {
		return 0, nil, errors.New("原片超过32个候选镜头，请先选取片段再分析")
	}
	shots := make([]canvasShot, 0, len(clean)-1)
	for i := 0; i < len(clean)-1; i++ {
		shots = append(shots, canvasShot{Index: i + 1, Start: clean[i], End: clean[i+1]})
	}
	return end, shots, nil
}

func prepareCanvasStoryboard(ctx context.Context, cfg config.Config, wire map[string]any) (*canvasStoryboardEvidence, error) {
	var source string
	for _, raw := range anySlice(wire["messages"]) {
		m, _ := raw.(map[string]any)
		for _, raw := range anySlice(m["content"]) {
			p, _ := raw.(map[string]any)
			if p["type"] == "video_url" {
				v, _ := p["video_url"].(map[string]any)
				url, _ := v["url"].(string)
				if source != "" {
					return nil, errors.New("05逐镜分析只接受一条原片")
				}
				source = url
			}
		}
	}
	if source == "" {
		return nil, errors.New("05逐镜分析缺少原片，请连接原视频")
	}
	if !strings.HasPrefix(source, "data:video/") {
		var err error
		source, err = downloadCanvasChatVideo(ctx, source)
		if err != nil {
			return nil, err
		}
	}
	_, encoded, ok := strings.Cut(source, ",")
	if !ok || len(encoded) > base64.StdEncoding.EncodedLen(gateway.TextVideoInlineByteLimit) {
		return nil, errors.New("原片内嵌数据无效或过大")
	}
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(data) == 0 {
		return nil, errors.New("原片内嵌内容无效")
	}
	dir, err := os.MkdirTemp("", "beike-canvas-analysis-*")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(dir)
	input := filepath.Join(dir, "source.mp4")
	if err = os.WriteFile(input, data, 0600); err != nil {
		return nil, err
	}
	probe, err := system.ProbeLocalVideo(ctx, cfg.Root, input)
	if err != nil {
		return nil, errors.New("无法测量原片，请检查FFmpeg视频环境")
	}
	if probe.Duration <= 0 || probe.Duration > 60 {
		return nil, errors.New("逐镜分析支持60秒以内原片，请先裁切")
	}
	binary, ok := system.FFmpegBinary(cfg.Root)
	if !ok {
		return nil, errors.New("逐镜分析需要FFmpeg，请检查视频环境")
	}
	mediaCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	args := []string{"-nostdin", "-hide_banner", "-protocol_whitelist", "file,pipe", "-format_whitelist", "mov,matroska,webm", "-i", input, "-vf", "blackdetect=d=0.08:pix_th=0.08,scale=320:-2,select='gt(scene,0.18)',showinfo", "-an", "-f", "null", "-"}
	log, err := exec.CommandContext(mediaCtx, binary, args...).CombinedOutput()
	if err != nil {
		return nil, errors.New("原片切点测量失败，请重试")
	}
	end, shots, err := canvasShotBoundaries(probe.Duration, string(log))
	if err != nil {
		return nil, err
	}
	evidence := &canvasStoryboardEvidence{Duration: probe.Duration, ContentEnd: end, Shots: shots}
	evidence.parts = append(evidence.parts, map[string]any{"type": "text", "text": fmt.Sprintf("程序测量：全片 %.3f秒，有效画面至 %.3f秒，%d个候选镜头；末尾黑场不作为内容。逐镜核实，不合并相似构图的真实切镜。", probe.Duration, end, len(shots))})
	for _, shot := range shots {
		evidence.parts = append(evidence.parts, map[string]any{"type": "text", "text": fmt.Sprintf("【原片镜头 %02d】源片 %.3f–%.3f秒。以下依次为首态、中态、末态；核实动作、视线、接触、景别、光影及是否真实切镜。", shot.Index, shot.Start, shot.End)})
		for j, fraction := range []float64{0.1, 0.5, 0.9} {
			t := shot.Start + (shot.End-shot.Start)*fraction
			output := filepath.Join(dir, fmt.Sprintf("shot-%02d-%d.jpg", shot.Index, j))
			args = []string{"-nostdin", "-v", "error", "-y", "-protocol_whitelist", "file,pipe", "-format_whitelist", "mov,matroska,webm", "-ss", fmt.Sprintf("%.4f", t), "-i", input, "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "3", output}
			if exec.CommandContext(mediaCtx, binary, args...).Run() != nil {
				return nil, errors.New("逐镜首中尾帧提取失败")
			}
			frame, err := os.ReadFile(output)
			if err != nil {
				return nil, errors.New("逐镜证据帧读取失败")
			}
			evidence.parts = append(evidence.parts, map[string]any{"type": "text", "text": fmt.Sprintf("源片 %.3f秒", t)}, map[string]any{"type": "image_url", "image_url": map[string]any{"url": "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(frame)}})
		}
	}
	return evidence, nil
}

func anySlice(value any) []any { v, _ := value.([]any); return v }
