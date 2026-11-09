package generate

import (
	"beike.local/cloud/src/backend/internal/gateway"
	"context"
	"encoding/json"
	"math"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

type imageRequest struct {
	Ctx          context.Context
	HTTP         *http.Request
	Base         string
	APIKey       string
	Model        string
	Prompt       string
	Size         string
	AspectRatio  string
	Quality      string
	ImageQuality string
	Strength     string
	Negative     string
	Refs         []string
	Workspace    string
	Production   bool
	Template     json.RawMessage
}

func (req imageRequest) context() context.Context {
	if req.HTTP != nil {
		return req.HTTP.Context()
	}
	if req.Ctx != nil {
		return req.Ctx
	}
	return context.Background()
}

func (req imageRequest) httpRequest() *http.Request {
	if req.HTTP != nil {
		return req.HTTP
	}
	request, err := http.NewRequestWithContext(req.context(), http.MethodPost, "http://local/api/generate/image", nil)
	if err != nil {
		request, _ = http.NewRequest(http.MethodPost, "http://local/api/generate/image", nil)
	}
	return request
}

type imageSubmitResult struct {
	Status  int
	Data    map[string]any
	TaskID  string
	Direct  string
	Adapted imageAdapted
}

type imagePollRequest struct {
	Ctx      context.Context
	HTTP     *http.Request
	Base     string
	APIKey   string
	TaskID   string
	Model    string
	Template json.RawMessage
}

func (req imagePollRequest) context() context.Context {
	if req.HTTP != nil {
		return req.HTTP.Context()
	}
	if req.Ctx != nil {
		return req.Ctx
	}
	return context.Background()
}

type imageProtocol interface {
	ID() string
	Submit(req imageRequest) (imageSubmitResult, error)
	Poll(req imagePollRequest) (pollParsed, map[string]any, bool)
}

// resolveImageProtocol prefers an explicit template, then DashScope/Gemini, then the host.
// An OpenAI-compatible label does not override a Qianwen or Google official host.
func resolveImageProtocol(base, explicit string) imageProtocol {
	switch normalizeImageProtocol(explicit) {
	case "template":
		return templateImageProtocol{}
	case "dashscope":
		return dashscopeImageProtocol{}
	case "gemini":
		return geminiImageProtocol{}
	}
	if gateway.IsDashScopeGateway(base) {
		return dashscopeImageProtocol{}
	}
	if isGeminiOfficialGateway(base) {
		return geminiImageProtocol{}
	}
	return openaiImageProtocol{}
}

func nativeDashscopeImageModel(model string) bool {
	id := strings.ToLower(strings.TrimSpace(model))
	if id == "" {
		return false
	}
	if strings.Contains(id, "qwen-image-3") || strings.Contains(id, "qwen-image-2.0") || strings.Contains(id, "qwen-image-2.1") || strings.Contains(id, "qwen-image-2-0") || strings.Contains(id, "qwen-image-2-1") {
		return true
	}
	return strings.Contains(id, "wan2.7-image") || strings.Contains(id, "wan2.6-image") || strings.Contains(id, "wan2.6-t2i")
}

func normalizeImageProtocol(explicit string) string {
	switch strings.ToLower(strings.TrimSpace(explicit)) {
	case "dashscope", "qwen", "qianwen":
		return "dashscope"
	case "gemini", "google":
		return "gemini"
	case "template", "custom-template":
		return "template"
	case "openai", "openai-compatible":
		return "openai"
	default:
		return ""
	}
}

func imageProtocolName(payload map[string]json.RawMessage, header string) string {
	name := rawString(payload, "customProtocol")
	if name == "" {
		name = strings.TrimSpace(header)
	}
	return name
}

func imageRequestTemplate(payload map[string]json.RawMessage) json.RawMessage {
	raw := payload["requestTemplate"]
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	return raw
}

var imageRequestTemplates sync.Map

func rememberImageTemplate(base, taskID string, raw json.RawMessage) {
	if strings.TrimSpace(taskID) == "" || len(raw) == 0 || string(raw) == "null" {
		return
	}
	imageRequestTemplates.Store(imageTemplateKey(base, taskID), append(json.RawMessage(nil), raw...))
}

func imageTemplateForPoll(base, taskID, header string) json.RawMessage {
	header = strings.TrimSpace(header)
	if header != "" && header != "null" {
		return json.RawMessage(header)
	}
	value, ok := imageRequestTemplates.Load(imageTemplateKey(base, taskID))
	if !ok {
		return nil
	}
	raw, _ := value.(json.RawMessage)
	return raw
}

func imageTemplateKey(base, taskID string) string {
	return strings.TrimRight(base, "/") + ":" + taskID
}

type dashscopeLimits struct {
	maxTier int
	maxEdge int
	minEdge int
}

func dashscopePixelSize(model, size, quality string) string {
	limits := dashscopeModelLimits(model)
	tier := dashscopeQualityTier(quality)
	if tier > limits.maxTier {
		tier = limits.maxTier
	}
	ratio := dashscopeNearestRatio(size)
	width, height := dashscopeTierSize(ratio, tier)
	width, height = fitDashscopeSize(width, height, limits.maxEdge, limits.minEdge)
	return strconv.Itoa(width) + "*" + strconv.Itoa(height)
}

func dashscopeModelLimits(model string) dashscopeLimits {
	id := strings.ToLower(model)
	switch {
	case strings.Contains(id, "wan2.7-image-pro"):
		return dashscopeLimits{maxTier: 4, maxEdge: 4096, minEdge: 768}
	case strings.Contains(id, "wan2.7-image"):
		return dashscopeLimits{maxTier: 2, maxEdge: 2048, minEdge: 768}
	case strings.Contains(id, "wan2.6-image"):
		return dashscopeLimits{maxTier: 1, maxEdge: 1280, minEdge: 768}
	case strings.Contains(id, "wan2.6-t2i"):
		return dashscopeLimits{maxTier: 1, maxEdge: 1696, minEdge: 768}
	default:
		return dashscopeLimits{maxTier: 2, maxEdge: 2048, minEdge: 512}
	}
}

func dashscopeQualityTier(quality string) int {
	switch strings.ToLower(strings.TrimSpace(quality)) {
	case "low", "1k":
		return 1
	case "high", "4k", "hd", "xhigh", "max":
		return 4
	default:
		return 2
	}
}

func dashscopeNearestRatio(size string) string {
	text := strings.ToLower(strings.TrimSpace(size))
	text = strings.NewReplacer("×", "x", "*", "x", " ", "").Replace(text)
	known := []string{"21:9", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "1:1"}
	for _, ratio := range known {
		if text == ratio {
			return ratio
		}
	}
	width, height, ok := dashscopePixelPair(text)
	if !ok || width <= 0 || height <= 0 {
		return "1:1"
	}
	target := float64(width) / float64(height)
	best := "1:1"
	bestGap := math.MaxFloat64
	for _, ratio := range known {
		parts := strings.Split(ratio, ":")
		left, _ := strconv.ParseFloat(parts[0], 64)
		right, _ := strconv.ParseFloat(parts[1], 64)
		gap := math.Abs(target - left/right)
		if gap < bestGap {
			bestGap = gap
			best = ratio
		}
	}
	return best
}

func dashscopePixelPair(size string) (int, int, bool) {
	parts := strings.Split(size, "x")
	if len(parts) != 2 {
		return 0, 0, false
	}
	width, errW := strconv.Atoi(parts[0])
	height, errH := strconv.Atoi(parts[1])
	if errW != nil || errH != nil {
		return 0, 0, false
	}
	return width, height, true
}

func dashscopeTierSize(ratio string, tier int) (int, int) {
	table := map[string]map[int][2]int{
		"1:1":  {1: {1280, 1280}, 2: {2048, 2048}, 4: {4096, 4096}},
		"16:9": {1: {1696, 960}, 2: {2688, 1536}, 4: {4096, 2304}},
		"9:16": {1: {960, 1696}, 2: {1536, 2688}, 4: {2304, 4096}},
		"4:3":  {1: {1472, 1104}, 2: {2368, 1728}, 4: {4096, 3072}},
		"3:4":  {1: {1104, 1472}, 2: {1728, 2368}, 4: {3072, 4096}},
		"3:2":  {1: {1536, 1024}, 2: {2496, 1664}, 4: {3840, 2560}},
		"2:3":  {1: {1024, 1536}, 2: {1664, 2496}, 4: {2560, 3840}},
		"21:9": {1: {1792, 768}, 2: {2688, 1152}, 4: {4096, 1760}},
	}
	if sizes, ok := table[ratio]; ok {
		if size, ok := sizes[tier]; ok {
			return size[0], size[1]
		}
	}
	edge := map[int]int{1: 1280, 2: 2048, 4: 4096}[tier]
	if edge == 0 {
		edge = 2048
	}
	return edge, edge
}

func fitDashscopeSize(width, height, maxEdge, minEdge int) (int, int) {
	if width < 1 || height < 1 {
		return maxEdge, maxEdge
	}
	longEdge := width
	if height > longEdge {
		longEdge = height
	}
	if longEdge > maxEdge {
		scale := float64(maxEdge) / float64(longEdge)
		width = roundDashscope(float64(width) * scale)
		height = roundDashscope(float64(height) * scale)
	}
	if width > maxEdge {
		width = maxEdge
	}
	if height > maxEdge {
		height = maxEdge
	}
	if width < minEdge {
		width = minEdge
	}
	if height < minEdge {
		height = minEdge
	}
	return width, height
}

func roundDashscope(value float64) int {
	rounded := int(math.Round(value/16) * 16)
	if rounded < 16 {
		return 16
	}
	return rounded
}

type openaiImageProtocol struct{}

func (openaiImageProtocol) ID() string { return "openai" }

func (openaiImageProtocol) Submit(req imageRequest) (imageSubmitResult, error) {
	adapted := buildImagePayloadWithAspect(req.Model, req.Prompt, req.Size, req.AspectRatio, req.Quality, req.ImageQuality, req.Refs)
	if imageHostIs(req.Base, "comfly.org") {
		if len(req.Refs) > 0 && comflyJSONEdit(req.Model) {
			return submitUnifiedImageEdit(req, adapted)
		}
		if adapted.family == "gemini-nano" {
			tier, _ := adapted.payload["image_size"].(string)
			adapted.modelID = comflyGeminiImageModel(req.Base, req.Model, tier)
			adapted.payload["model"] = adapted.modelID
		}
	}
	if !adapted.useEdits && len(req.Refs) > 0 {
		resolved, err := dashscopeImageRefs(req)
		if err != nil {
			return imageSubmitResult{}, err
		}
		if len(resolved) > 0 {
			adapted.payload["image"] = resolved
		}
	}
	status, data, err := dispatchImage(req.httpRequest(), imageSubmitURLs(req.Base, adapted.useEdits, adapted.family, req.Model), req.APIKey, adapted.payload, req.Workspace, req.Production)
	if err != nil {
		return imageSubmitResult{}, err
	}
	if adapted.family == "gemini-nano" && gateway.CanTryAnotherEndpoint(status) {
		return geminiImageProtocol{}.Submit(req)
	}
	taskID, direct := imageOutcome(data)
	return imageSubmitResult{Status: status, Data: data, TaskID: taskID, Direct: direct, Adapted: adapted}, nil
}

func (openaiImageProtocol) Poll(req imagePollRequest) (pollParsed, map[string]any, bool) {
	root := strings.TrimRight(gateway.NormalizeGatewayBaseURL(req.Base), "/")
	taskID := req.TaskID
	urls := []string{
		root + "/v1/images/tasks/" + taskID,
		root + "/v1/tasks/" + taskID,
		root + "/v1/images/generations/" + taskID,
		root + "/v1/images/" + taskID,
		root + "/v1/query/image_generation?task_id=" + taskID,
	}
	for _, endpoint := range urls {
		status, raw, err := gateway.PostModel(req.context(), http.MethodGet, endpoint, req.APIKey, nil, 3500*time.Millisecond)
		if err != nil || status < 200 || status >= 300 {
			continue
		}
		var data map[string]any
		if json.Unmarshal(raw, &data) != nil {
			continue
		}
		parsed, ok := parseImagePoll(data)
		if !ok {
			continue
		}
		return parsed, data, true
	}
	return pollParsed{}, nil, false
}
