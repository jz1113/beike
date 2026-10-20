package modelgw

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/platform/network"
)

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

const textImageLimit = 10 << 20

// textImageClient stays on the public-network client. Tests may replace it
// with a local transport; production calls do not inherit model credentials.
var textImageClient = func() *http.Client { return network.SafeClient() }

// TextImageError classifies image preparation without exposing the source URL.
type TextImageError struct {
	Kind   string
	Status int
	err    error
}

func (e *TextImageError) Error() string {
	switch e.Kind {
	case "download":
		return "safe remote image download failed"
	case "status":
		return fmt.Sprintf("remote image HTTP %d", e.Status)
	case "mime":
		return "unsupported text image MIME"
	case "mismatch":
		return "text image MIME does not match content"
	case "size":
		return "invalid text image size"
	case "data":
		return "image data URL must use base64"
	default:
		return "invalid text image"
	}
}

func (e *TextImageError) Unwrap() error { return e.err }

// IndexedImageError identifies the catalog picture that failed preparation.
type IndexedImageError struct {
	Index int
	Err   error
}

func (e *IndexedImageError) Error() string {
	return fmt.Sprintf("图片编号 %d：%s", e.Index, e.Err.Error())
}

func (e *IndexedImageError) Unwrap() error { return e.Err }

func failTextImage(part map[string]any, err error) error {
	if err == nil {
		return nil
	}
	image := textMap(part["image_url"])
	if _, ok := image["index"]; !ok {
		return err
	}
	return &IndexedImageError{Index: int(textNumber(image["index"])), Err: err}
}

func textImage(ctx context.Context, raw string) (string, string, error) {
	var data []byte
	var mediaType string
	if strings.HasPrefix(raw, "data:") {
		head, body, ok := strings.Cut(strings.TrimPrefix(raw, "data:"), ",")
		if !ok || !strings.HasSuffix(head, ";base64") {
			return "", "", &TextImageError{Kind: "data"}
		}
		mediaType = strings.TrimSuffix(head, ";base64")
		if len(body) > base64.StdEncoding.EncodedLen(textImageLimit) {
			return "", "", &TextImageError{Kind: "size"}
		}
		var err error
		data, err = base64.StdEncoding.DecodeString(body)
		if err != nil {
			return "", "", &TextImageError{Kind: "invalid", err: err}
		}
	} else {
		u, err := url.Parse(raw)
		if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" || u.User != nil {
			return "", "", &TextImageError{Kind: "invalid", err: err}
		}
		downloadCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		defer cancel()
		req, err := http.NewRequestWithContext(downloadCtx, http.MethodGet, u.String(), nil)
		if err != nil {
			return "", "", errors.New("invalid remote image request")
		}
		// A separate public-network client deliberately receives no model headers,
		// custom transport, cookies, or authentication from TextRequest.Client.
		response, err := textImageClient().Do(req)
		if err != nil {
			return "", "", &TextImageError{Kind: "download", err: err}
		}
		defer response.Body.Close()
		if response.StatusCode != http.StatusOK {
			return "", "", &TextImageError{Kind: "status", Status: response.StatusCode}
		}
		mediaType, _, _ = mime.ParseMediaType(response.Header.Get("Content-Type"))
		data, err = io.ReadAll(io.LimitReader(response.Body, textImageLimit+1))
		if err != nil {
			return "", "", &TextImageError{Kind: "download", err: err}
		}
	}
	if len(data) == 0 || len(data) > textImageLimit {
		return "", "", &TextImageError{Kind: "size"}
	}
	detected := http.DetectContentType(data)
	switch mediaType {
	case "image/jpeg", "image/png", "image/gif", "image/webp":
	default:
		return "", "", &TextImageError{Kind: "mime"}
	}
	if detected != mediaType {
		return "", "", &TextImageError{Kind: "mismatch"}
	}
	return mediaType, base64.StdEncoding.EncodeToString(data), nil
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
