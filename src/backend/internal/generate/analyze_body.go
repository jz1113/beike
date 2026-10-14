package generate

import (
	"encoding/json"
	"strings"
)

func analyzeBodyError(payload map[string]json.RawMessage) string {
	checks := []struct {
		key string
		max int
	}{
		{"mode", 64},
		{"productTitle", 500},
		{"model", 200},
		{"extraRequirements", 20_000},
		{"customBaseUrl", 2048},
		{"customApiKey", 4096},
	}
	if message := optionalAnalyzeString(payload, checks[0].key, checks[0].max); message != "" {
		return message
	}
	if message := optionalAnalyzeString(payload, checks[1].key, checks[1].max); message != "" {
		return message
	}
	if message := analyzeURLList(payload, "imageUrls"); message != "" {
		return message
	}
	if message := analyzeURLList(payload, "referenceImageUrls"); message != "" {
		return message
	}
	if message := optionalAnalyzeString(payload, "model", 200); message != "" {
		return message
	}
	if message := analyzeShotCount(payload["shotCount"]); message != "" {
		return message
	}
	for _, check := range checks[3:] {
		if message := optionalAnalyzeString(payload, check.key, check.max); message != "" {
			return message
		}
	}
	return ""
}

func optionalAnalyzeString(payload map[string]json.RawMessage, key string, max int) string {
	raw, ok := payload[key]
	if !ok {
		return ""
	}
	if analyzeKind(raw) != "string" {
		return key + ": Expected string, received " + analyzeKind(raw)
	}
	var value string
	if json.Unmarshal(raw, &value) != nil {
		return key + ": Expected string, received string"
	}
	if utf16Len(value) > max {
		return key + ": String must contain at most " + itoa(max) + " character(s)"
	}
	return ""
}

func analyzeURLList(payload map[string]json.RawMessage, key string) string {
	raw, ok := payload[key]
	if !ok {
		return ""
	}
	if analyzeKind(raw) != "array" {
		return key + ": Expected array, received " + analyzeKind(raw)
	}
	var items []json.RawMessage
	if json.Unmarshal(raw, &items) != nil {
		return key + ": Expected array, received array"
	}
	if len(items) > 24 {
		return key + ": Array must contain at most 24 element(s)"
	}
	for index, item := range items {
		if analyzeKind(item) != "string" {
			return key + "." + itoa(index) + ": Expected string, received " + analyzeKind(item)
		}
		var value string
		if json.Unmarshal(item, &value) != nil || utf16Len(value) > 8192 {
			return key + "." + itoa(index) + ": String must contain at most 8192 character(s)"
		}
	}
	return ""
}

func analyzeShotCount(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	if analyzeKind(raw) != "number" {
		return "shotCount: Expected number, received " + analyzeKind(raw)
	}
	var number float64
	if json.Unmarshal(raw, &number) != nil {
		return "shotCount: Number must be finite"
	}
	if number != float64(int(number)) {
		return "shotCount: Expected integer, received float"
	}
	if number < 1 {
		return "shotCount: Number must be greater than or equal to 1"
	}
	if number > 24 {
		return "shotCount: Number must be less than or equal to 24"
	}
	return ""
}

func analyzeKind(raw json.RawMessage) string {
	text := strings.TrimSpace(string(raw))
	switch {
	case text == "" || text == "null":
		return "null"
	case text == "true" || text == "false":
		return "boolean"
	case strings.HasPrefix(text, "\""):
		return "string"
	case strings.HasPrefix(text, "["):
		return "array"
	case strings.HasPrefix(text, "{"):
		return "object"
	default:
		return "number"
	}
}
