package gateway

import (
	"encoding/json"
	"errors"
	"strings"
)

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
