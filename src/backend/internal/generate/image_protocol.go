package generate

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"sync"

	"beike.local/cloud/src/backend/internal/system"
)

type imageRequest struct {
	Ctx          context.Context
	HTTP         *http.Request
	Base         string
	APIKey       string
	Model        string
	Prompt       string
	Size         string
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

// resolveImageProtocol prefers an explicit template, then DashScope, then the host.
// An OpenAI-compatible label does not override a Qianwen host, so existing providers keep working.
func resolveImageProtocol(base, explicit string) imageProtocol {
	switch normalizeImageProtocol(explicit) {
	case "template":
		return templateImageProtocol{}
	case "dashscope":
		return dashscopeImageProtocol{}
	}
	if system.IsDashScopeGateway(base) {
		return dashscopeImageProtocol{}
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
