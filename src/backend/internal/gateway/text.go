package gateway

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// TextRequest uses OpenAI messages as its canonical input. Native metadata is
// server-only conversation state and must be removed before sending to a UI.
type TextRequest struct {
	BaseURL, APIKey, Protocol string
	Payload                   map[string]any
	Client                    *http.Client
	Timeout                   time.Duration
}

type textProtocolKey struct{}

func ResolveTextProtocol(model, explicit string) string {
	p := strings.ToLower(strings.TrimSpace(explicit))
	if p != "" && p != "auto" {
		return p
	}
	m := strings.ToLower(strings.TrimSpace(model))
	if strings.HasPrefix(m, "gemini-") {
		return "gemini"
	}
	if strings.HasPrefix(m, "claude-") {
		return "anthropic"
	}
	return "openai"
}

// ResolveTextProtocolForBase keeps model-id inference for unknown endpoints,
// while preferring the protocol that is unambiguous from an official/native
// endpoint or an explicitly compatible path.
func ResolveTextProtocolForBase(model, explicit, base string) string {
	p := strings.ToLower(strings.TrimSpace(explicit))
	if p != "" && p != "auto" {
		return p
	}
	if inferred := textProtocolFromBase(base); inferred != "" {
		return inferred
	}
	return ResolveTextProtocol(model, explicit)
}

func textProtocolFromBase(base string) string {
	u, err := url.Parse(strings.TrimSpace(base))
	if err != nil || u.Host == "" {
		return ""
	}
	host := strings.ToLower(u.Hostname())
	path := strings.ToLower(strings.TrimRight(u.Path, "/"))
	switch {
	case host == "api.anthropic.com" || strings.HasSuffix(path, "/messages"):
		return "anthropic"
	case host == "generativelanguage.googleapis.com" || strings.HasSuffix(host, ".googleapis.com") || strings.Contains(path, "/generatecontent"):
		return "gemini"
	case host == "api.openai.com" || host == "api.deepseek.com" || host == "api.siliconflow.cn" ||
		host == "ai.comfly.org" || host == "ai.comfly.chat" || host == "shop.comfly.chat" ||
		host == "dashscope.aliyuncs.com" || strings.HasSuffix(host, ".qianwenaiapi.com") ||
		strings.Contains(path, "/chat/completions") || strings.Contains(path, "/compatible-mode/"):
		return "openai"
	default:
		return ""
	}
}

func WithTextProtocol(ctx context.Context, protocol string) context.Context {
	return context.WithValue(ctx, textProtocolKey{}, protocol)
}

func TextProtocol(ctx context.Context, model string) string {
	p, _ := ctx.Value(textProtocolKey{}).(string)
	return ResolveTextProtocol(model, p)
}

func TextProtocolForBase(ctx context.Context, model, base string) string {
	p, _ := ctx.Value(textProtocolKey{}).(string)
	return ResolveTextProtocolForBase(model, p, base)
}

func CompleteText(ctx context.Context, req TextRequest) (int, map[string]any, error) {
	return requestText(ctx, req, false, nil)
}

func StreamText(ctx context.Context, req TextRequest, onDelta func(kind, text string)) (int, map[string]any, error) {
	return requestText(ctx, req, true, onDelta)
}

const textBodyLimit = 32 << 20

func requestText(ctx context.Context, req TextRequest, stream bool, onDelta func(string, string)) (int, map[string]any, error) {
	timeout := req.Timeout
	if timeout <= 0 {
		timeout = 5 * time.Minute
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	payload, err := textClone(req.Payload)
	if err != nil {
		return 0, nil, err
	}
	model := textString(payload["model"])
	protocol := strings.TrimSpace(req.Protocol)
	if protocol == "" || strings.EqualFold(protocol, "auto") {
		protocol = ResolveTextProtocolForBase(model, protocol, req.BaseURL)
	}
	protocol = ResolveTextProtocol(model, protocol)
	if protocol != "openai" && protocol != "gemini" && protocol != "anthropic" {
		return 0, nil, fmt.Errorf("unsupported text protocol %q", protocol)
	}
	endpoint, err := textEndpoint(req.BaseURL, model, protocol, stream)
	if err != nil {
		return 0, nil, err
	}
	switch protocol {
	case "gemini":
		payload, err = geminiRequest(ctx, payload, model)
	case "anthropic":
		payload, err = anthropicRequest(ctx, payload, model, stream)
	default:
		err = prepareOpenAITextImages(ctx, payload)
		payload = openAITextPayload(payload)
		payload["stream"] = stream
		if stream {
			options := textMap(payload["stream_options"])
			if options == nil {
				options = map[string]any{}
			}
			options["include_usage"] = true
			payload["stream_options"] = options
		}
	}
	if err != nil {
		return 0, nil, err
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return 0, nil, err
	}
	if len(body) > textBodyLimit {
		return 0, nil, errors.New("text upstream request exceeds size limit")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return 0, nil, err
	}
	request.Header.Set("Content-Type", "application/json")
	if stream {
		request.Header.Set("Accept", "text/event-stream")
	}
	switch protocol {
	case "gemini":
		request.Header.Set("x-goog-api-key", req.APIKey)
	case "anthropic":
		request.Header.Set("x-api-key", req.APIKey)
		request.Header.Set("anthropic-version", "2023-06-01")
	default:
		request.Header.Set("Authorization", "Bearer "+req.APIKey)
	}
	client := textHTTPClient(req.Client)
	response, err := client.Do(request)
	if err != nil {
		return 0, nil, &textRequestError{message: "text upstream request failed: " + textSafeError(err, req.APIKey), cause: err}
	}
	defer response.Body.Close()
	status := response.StatusCode
	if status < 200 || status >= 300 {
		data, readErr := readTextJSON(response.Body)
		if readErr != nil {
			return status, nil, fmt.Errorf("text upstream HTTP %d: invalid error response", status)
		}
		return status, data, fmt.Errorf("text upstream HTTP %d: %s", status, textSafeError(errors.New(upstreamMessage(data, status)), req.APIKey))
	}
	if stream && strings.HasPrefix(strings.ToLower(response.Header.Get("Content-Type")), "text/event-stream") {
		data, err := readTextStream(response.Body, protocol, model, onDelta)
		if err == nil {
			err = validateNativeTextJSON(protocol, req.Payload, data)
		}
		if err != nil {
			return status, nil, err
		}
		return status, data, nil
	}
	// A finished JSON completion is accepted when a stream request is not served as SSE.
	data, err := readTextJSON(response.Body)
	if err != nil {
		if stream {
			return status, nil, errors.New("text upstream did not return SSE")
		}
		return status, nil, err
	}
	if data["error"] != nil {
		return status, nil, errors.New("text upstream returned an error")
	}
	switch protocol {
	case "gemini":
		data, err = geminiResponse(data, model)
	case "anthropic":
		data, err = anthropicResponse(data, model)
	default:
		err = validateOpenAIText(data)
	}
	if err == nil {
		err = validateNativeTextJSON(protocol, req.Payload, data)
	}
	if err != nil {
		return status, nil, err
	}
	return status, data, nil
}

func textHTTPClient(input *http.Client) *http.Client {
	client := &http.Client{}
	if input != nil {
		*client = *input
	}
	prior := client.CheckRedirect
	client.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return errors.New("too many text upstream redirects")
		}
		if len(via) > 0 && (!strings.EqualFold(req.URL.Host, via[0].URL.Host) || req.URL.Scheme != via[0].URL.Scheme) {
			return errors.New("cross-origin text authentication redirect refused")
		}
		if prior != nil {
			return prior(req, via)
		}
		return nil
	}
	return client
}

func textEndpoint(base, model, protocol string, stream bool) (string, error) {
	u, err := url.Parse(strings.TrimRight(strings.TrimSpace(base), "/"))
	if err != nil || u.Host == "" || (u.Scheme != "https" && u.Scheme != "http") || u.User != nil {
		return "", errors.New("invalid text upstream base URL")
	}
	if u.RawQuery != "" || u.Fragment != "" {
		return "", errors.New("text upstream base URL must not contain a query or fragment")
	}
	path := strings.TrimRight(u.Path, "/")
	switch protocol {
	case "gemini":
		if model == "" || strings.ContainsAny(model, "/?#\\") || strings.Contains(model, "..") {
			return "", errors.New("invalid Gemini model id")
		}
		if i := strings.Index(path, "/models/"); i >= 0 {
			path = path[:i]
		}
		if !strings.HasSuffix(path, "/v1") && !strings.HasSuffix(path, "/v1beta") {
			path += "/v1beta"
		}
		method := ":generateContent"
		if stream {
			method = ":streamGenerateContent"
			u.RawQuery = "alt=sse"
		}
		path += "/models/" + model + method
	case "anthropic":
		path = anthropicMessagesPath(path)
	default:
		if !strings.HasSuffix(path, "/chat/completions") {
			if isTextDashScopeHost(u.Hostname()) && !strings.HasSuffix(path, "/compatible-mode/v1") {
				path = strings.TrimSuffix(path, "/v1")
				path = strings.TrimSuffix(path, "/compatible-mode")
				path = strings.TrimSuffix(path, "/api")
				path += "/compatible-mode/v1"
			}
			if !strings.HasSuffix(path, "/v1") && !strings.HasSuffix(path, "/v1beta") {
				path += "/v1"
			}
			path += "/chat/completions"
		}
	}
	u.Path = path
	u.RawPath = ""
	return u.String(), nil
}

// anthropicMessagesPath accepts a domain, a versioned prefix, the official
// Messages endpoint, or a previously saved Chat Completions endpoint.
func anthropicMessagesPath(path string) string {
	for {
		next := path
		for _, suffix := range []string{"/chat/completions", "/messages", "/v1beta"} {
			next = strings.TrimSuffix(next, suffix)
		}
		if next == path {
			break
		}
		path = next
	}
	if !strings.HasSuffix(path, "/v1") {
		path += "/v1"
	}
	return path + "/messages"
}

func isTextDashScopeHost(host string) bool {
	host = strings.ToLower(host)
	return host == "qianwenaiapi.com" || strings.HasSuffix(host, ".qianwenaiapi.com") ||
		(strings.Contains(host, "dashscope") && strings.HasSuffix(host, ".aliyuncs.com"))
}

func readTextJSON(r io.Reader) (map[string]any, error) {
	b, err := io.ReadAll(io.LimitReader(r, textBodyLimit+1))
	if err != nil {
		return nil, err
	}
	if len(b) > textBodyLimit {
		return nil, errors.New("text upstream response exceeds size limit")
	}
	var out map[string]any
	if err = json.Unmarshal(b, &out); err != nil || out == nil {
		return nil, errors.New("invalid text upstream JSON")
	}
	return out, nil
}

type textRequestError struct {
	message string
	cause   error
}

func (e *textRequestError) Error() string { return e.message }
func (e *textRequestError) Unwrap() error { return e.cause }

func textSafeError(err error, key string) string {
	s := err.Error()
	if key != "" {
		s = strings.ReplaceAll(s, key, "[redacted]")
	}
	return s
}

func openAITextPayload(p map[string]any) map[string]any {
	for _, raw := range textArray(p["messages"]) {
		msg := textMap(raw)
		delete(msg, "native_content")
		for _, part := range textArray(msg["content"]) {
			delete(textMap(textMap(part)["image_url"]), "index")
		}
		// Reasoning signatures and native blocks are never OpenAI message fields.
	}
	return p
}
