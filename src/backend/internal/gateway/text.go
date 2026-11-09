package gateway

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/base64"
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
		adaptComflyVideoParts(req.BaseURL, payload)
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
			if errors.Is(err, ErrInvalidTextJSON) {
				return status, streamFailureReceipt("openai", model, data), &TextJSONError{Response: data}
			}
			if data == nil {
				data = streamFailureReceipt("openai", model, nil)
			}
			if id := response.Header.Get("x-request-id"); id != "" {
				data["requestId"] = id
			}
			return status, data, err
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
		return status, textFailureUsageReceipt(protocol, model, data), errors.New("text upstream returned an error")
	}
	observed := data
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
		if errors.Is(err, ErrInvalidTextJSON) {
			return status, textFailureUsageReceipt(protocol, model, observed), &TextJSONError{Response: data}
		}
		return status, textFailureUsageReceipt(protocol, model, observed), err
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

func textMap(v any) map[string]any { m, _ := v.(map[string]any); return m }
func textArray(v any) []any        { a, _ := v.([]any); return a }
func textString(v any) string      { s, _ := v.(string); return s }
func textNumber(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int:
		return float64(n)
	case int64:
		return float64(n)
	case json.Number:
		f, _ := n.Float64()
		return f
	}
	return 0
}
func textClone(v map[string]any) (map[string]any, error) {
	b, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	var out map[string]any
	err = json.Unmarshal(b, &out)
	if err == nil && out == nil {
		err = errors.New("text payload is required")
	}
	return out, err
}

// Matching native metadata is authoritative: signed reasoning and tool blocks
// must travel together, byte-for-byte at the JSON value level.
func textNative(msg map[string]any, protocol, model string) ([]any, bool, error) {
	native := textMap(msg["native_content"])
	if native == nil || textString(native["protocol"]) != protocol || textString(native["model"]) != model {
		return nil, false, nil
	}
	blocks, ok := native["content"].([]any)
	if !ok || len(blocks) == 0 {
		return nil, false, errors.New("invalid native text content")
	}
	for _, raw := range blocks {
		if textMap(raw) == nil {
			return nil, false, errors.New("invalid native text content block")
		}
	}
	return blocks, true, nil
}

func textContentParts(msg map[string]any) ([]any, error) {
	if s, ok := msg["content"].(string); ok {
		return []any{map[string]any{"type": "text", "text": s}}, nil
	}
	if msg["content"] == nil {
		return nil, nil
	}
	parts, ok := msg["content"].([]any)
	if !ok {
		return nil, errors.New("unsupported text message content")
	}
	return parts, nil
}

func textArguments(value any) (map[string]any, error) {
	if m := textMap(value); m != nil {
		return m, nil
	}
	var args map[string]any
	if err := json.Unmarshal([]byte(textString(value)), &args); err != nil || args == nil {
		return nil, errors.New("tool arguments must be a complete JSON object")
	}
	return args, nil
}

func textToolCalls(msg map[string]any) ([]any, error) {
	calls := textArray(msg["tool_calls"])
	for _, raw := range calls {
		call := textMap(raw)
		fn := textMap(call["function"])
		if textString(call["id"]) == "" || textString(fn["name"]) == "" {
			return nil, errors.New("incomplete text tool call")
		}
		if _, err := textArguments(fn["arguments"]); err != nil {
			return nil, err
		}
	}
	return calls, nil
}

func textResult(protocol, model string, content []any, text, reasoning, finish string, calls []any, usage map[string]any) map[string]any {
	message := map[string]any{"role": "assistant", "content": text, "native_content": map[string]any{"protocol": protocol, "model": model, "content": content}}
	if reasoning != "" {
		message["reasoning_content"] = reasoning
	}
	if len(calls) > 0 {
		message["tool_calls"] = calls
	}
	result := map[string]any{"object": "chat.completion", "model": model, "choices": []any{map[string]any{"index": 0, "message": message, "finish_reason": finish}}}
	if len(usage) > 0 {
		result["usage"] = usage
	}
	return result
}

func validateOpenAIText(data map[string]any) error {
	choices := textArray(data["choices"])
	if len(choices) == 0 {
		return errors.New("text upstream returned no choices")
	}
	choice := textMap(choices[0])
	msg := textMap(choice["message"])
	if msg == nil {
		return errors.New("text upstream returned no assistant message")
	}
	calls, err := textToolCalls(msg)
	if err != nil {
		return err
	}
	finish := textString(choice["finish_reason"])
	if len(calls) > 0 && finish != "tool_calls" && finish != "function_call" && finish != "stop" {
		return errors.New("text upstream returned unfinished tool calls")
	}
	return nil
}

func textToolDefinitions(p map[string]any) ([]any, error) {
	tools := textArray(p["tools"])
	for _, raw := range tools {
		tool := textMap(raw)
		if textString(tool["type"]) != "function" || textString(textMap(tool["function"])["name"]) == "" {
			return nil, errors.New("native text protocols only support function tools")
		}
	}
	return tools, nil
}

// ErrInvalidTextJSON identifies a completed answer with invalid JSON syntax.
// Callers may inspect the response; it does not represent a transport failure.
var ErrInvalidTextJSON = errors.New("native text response did not contain valid JSON")

// TextJSONError retains a completed response for callers that can repair its syntax.
// The ordinary result stays nil on failure, so other callers cannot consume it as success.
type TextJSONError struct{ Response map[string]any }

func (e *TextJSONError) Error() string { return ErrInvalidTextJSON.Error() }
func (e *TextJSONError) Unwrap() error { return ErrInvalidTextJSON }

// Claude's json_object compatibility mode uses a system instruction, because
// Messages only offers schema-constrained JSON. Validate the final object rather
// than silently accepting prose. Tool turns/refusals/length stops are not JSON
// answers and retain their own explicit finish reason.
func validateNativeTextJSON(protocol string, payload, result map[string]any) error {
	if protocol == "openai" {
		return nil
	}
	format := textString(textMap(payload["response_format"])["type"])
	if format != "json_object" && format != "json_schema" {
		return nil
	}
	choices := textArray(result["choices"])
	if len(choices) == 0 {
		return errors.New("missing native JSON response choice")
	}
	choice := textMap(choices[0])
	msg := textMap(choice["message"])
	if textString(choice["finish_reason"]) != "stop" || len(textArray(msg["tool_calls"])) > 0 {
		return nil
	}
	extracted, value, ok := nativeJSONValue(textString(msg["content"]), format)
	if !ok {
		return ErrInvalidTextJSON
	}
	if format == "json_object" && textMap(value) == nil {
		return ErrInvalidTextJSON
	}
	msg["content"] = extracted
	return nil
}

func nativeJSONValue(content, format string) (string, any, bool) {
	content = strings.TrimSpace(content)
	if text, value, ok := unmarshalNativeJSON(content); ok {
		return text, value, true
	}
	stripped := stripJSONFence(content)
	if stripped != content {
		if text, value, ok := unmarshalNativeJSON(stripped); ok {
			return text, value, true
		}
	}
	if format != "json_object" {
		return "", nil, false
	}
	start := strings.Index(stripped, "{")
	end := strings.LastIndex(stripped, "}")
	if start < 0 || end <= start {
		return "", nil, false
	}
	if text, value, ok := unmarshalNativeJSON(stripped[start : end+1]); ok && textMap(value) != nil {
		return text, value, true
	}
	return "", nil, false
}

func unmarshalNativeJSON(content string) (string, any, bool) {
	var value any
	if json.Unmarshal([]byte(content), &value) != nil {
		return "", nil, false
	}
	return content, value, true
}

func stripJSONFence(content string) string {
	text := strings.TrimSpace(content)
	if !strings.HasPrefix(text, "```") {
		return text
	}
	text = strings.TrimPrefix(text, "```")
	if newline := strings.IndexByte(text, '\n'); newline >= 0 {
		text = text[newline+1:]
	} else {
		text = strings.TrimPrefix(text, "json")
	}
	text = strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(text), "```"))
	return text
}

// Generated from src/shared/domain/models/textModelCapabilities.json by check-shared-data.
//
//go:embed textModelCapabilities.json
var textCapabilityJSON []byte

type textThinkingCapability struct {
	Protocol string         `json:"protocol"`
	Mode     string         `json:"thinking"`
	Levels   []string       `json:"levels"`
	Aliases  []string       `json:"aliases"`
	Budgets  map[string]int `json:"budgets"`
}

var textKnownCapabilities = func() map[string]textThinkingCapability {
	var data struct {
		Models map[string]textThinkingCapability `json:"models"`
	}
	if err := json.Unmarshal(textCapabilityJSON, &data); err != nil {
		panic(err)
	}
	for _, capability := range data.Models {
		for _, alias := range capability.Aliases {
			data.Models[alias] = capability
		}
	}
	return data.Models
}()

func textThinkingMode(model string) string {
	return textKnownCapabilities[strings.ToLower(strings.TrimSpace(model))].Mode
}

// Normalize stale UI preferences using exactly the same ordered levels as TS.
func nativeTextEffort(model, effort string) string {
	capability, ok := textKnownCapabilities[strings.ToLower(strings.TrimSpace(model))]
	if !ok || effort == "" || effort == "auto" {
		return ""
	}
	if effort != "low" && effort != "medium" && effort != "high" && effort != "xhigh" && effort != "max" {
		effort = "medium"
	}
	for _, level := range capability.Levels {
		if effort == level {
			return effort
		}
	}
	order := []string{"low", "medium", "high", "xhigh"}
	index := func(value string) int {
		for i, item := range order {
			if item == value {
				return i
			}
		}
		return 2
	}
	last := ""
	for _, level := range capability.Levels {
		if level == "max" {
			continue
		}
		last = level
		if index(level) >= index(effort) {
			return level
		}
	}
	return last
}

func textEffort(p map[string]any) string {
	return strings.ToLower(strings.TrimSpace(textString(p["reasoning_effort"])))
}

func geminiReasoning(config, p map[string]any, model string) error {
	effort := nativeTextEffort(model, textEffort(p))
	capability := textKnownCapabilities[strings.ToLower(strings.TrimSpace(model))]
	if effort == "" || capability.Protocol != "gemini" {
		return nil
	}
	thinking := map[string]any{"includeThoughts": true}
	switch capability.Mode {
	case "level":
		thinking["thinkingLevel"] = effort
	case "budget":
		thinking["thinkingBudget"] = capability.Budgets[effort]
	default:
		return nil
	}
	config["thinkingConfig"] = thinking
	return nil
}

func anthropicReasoning(out, p map[string]any, model string) error {
	effort := nativeTextEffort(model, textEffort(p))
	capability := textKnownCapabilities[strings.ToLower(strings.TrimSpace(model))]
	// Adaptive models may think by default even when effort is omitted.
	if capability.Protocol == "anthropic" && capability.Mode == "adaptive" {
		delete(out, "temperature")
		delete(out, "top_p")
		delete(out, "top_k")
	}
	if effort == "" || capability.Protocol != "anthropic" {
		return nil
	}
	if capability.Mode == "adaptive" {
		out["thinking"] = map[string]any{"type": "adaptive"}
		cfg := textMap(out["output_config"])
		if cfg == nil {
			cfg = map[string]any{}
		}
		cfg["effort"] = effort
		out["output_config"] = cfg
	} else if capability.Mode == "budget" {
		budget := capability.Budgets[effort]
		if budget < 1024 {
			return fmt.Errorf("invalid verified Claude budget for %q", model)
		}
		if textNumber(out["max_tokens"]) <= float64(budget) {
			return errors.New("Claude max_tokens must exceed thinking budget")
		}
		out["thinking"] = map[string]any{"type": "enabled", "budget_tokens": budget}
	} else {
		return nil
	}
	choice := textString(textMap(out["tool_choice"])["type"])
	if choice == "any" || choice == "tool" {
		return errors.New("Claude thinking is incompatible with forced tool choice")
	}
	delete(out, "temperature")
	delete(out, "top_p")
	delete(out, "top_k")
	return nil
}

// Leave room for base64, images and conversation text in a 32 MiB request.
const TextVideoInlineByteLimit = 16_000_000

// Comfly's video-understanding endpoint expects video URLs as image_url parts.
func adaptComflyVideoParts(base string, payload map[string]any) {
	u, err := url.Parse(base)
	if err != nil || (u.Hostname() != "ai.comfly.org" && u.Hostname() != "ai.comfly.chat" && u.Hostname() != "shop.comfly.chat") {
		return
	}
	for _, raw := range textArray(payload["messages"]) {
		for _, item := range textArray(textMap(raw)["content"]) {
			part := textMap(item)
			if part["type"] != "video_url" {
				continue
			}
			video := textMap(part["video_url"])
			part["type"] = "image_url"
			part["image_url"] = map[string]any{"url": video["url"]}
			delete(part, "video_url")
			delete(part, "fps")
			delete(part, "media_resolution")
		}
	}
}

func textVideo(ctx context.Context, source string) (string, string, error) {
	if err := ctx.Err(); err != nil {
		return "", "", err
	}
	head, data, ok := strings.Cut(source, ",")
	if !ok || !strings.HasPrefix(head, "data:video/") || !strings.HasSuffix(head, ";base64") {
		return "", "", errors.New("视频必须先上传并转换为内嵌内容，不能使用本地或浏览器临时地址")
	}
	mime := strings.TrimSuffix(strings.TrimPrefix(head, "data:"), ";base64")
	if mime != "video/mp4" && mime != "video/quicktime" && mime != "video/webm" {
		return "", "", errors.New("原生视频分析支持 MP4、MOV 和 WebM")
	}
	if len(data) == 0 || len(data) > base64.StdEncoding.EncodedLen(TextVideoInlineByteLimit) {
		return "", "", errors.New("原生视频内容超过内嵌大小上限")
	}
	raw, err := base64.StdEncoding.DecodeString(data)
	if err != nil || len(raw) == 0 || len(raw) > TextVideoInlineByteLimit {
		return "", "", errors.New("无效的视频内嵌内容")
	}
	valid := len(raw) >= 12 && (string(raw[4:8]) == "ftyp" || string(raw[4:8]) == "moov" || string(raw[4:8]) == "mdat" || string(raw[4:8]) == "wide")
	if mime == "video/webm" {
		valid = len(raw) >= 4 && string(raw[:4]) == "\x1a\x45\xdf\xa3"
	}
	if !valid {
		return "", "", errors.New("视频内容与声明格式不匹配")
	}
	return mime, data, nil
}
