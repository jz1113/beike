package keywords

import (
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"unicode/utf8"

	reviewsvc "beike.local/cloud/src/backend/internal/keywords/review"
)

func parseKeywordReview(raw []byte) (map[string]any, []reviewsvc.Row, string) {
	var payload any
	if json.Unmarshal(raw, &payload) != nil {
		return nil, nil, "请求数据格式异常"
	}
	object, ok := payload.(map[string]any)
	if !ok {
		return nil, nil, "Expected object, received " + jsonKind(payload)
	}
	parsed := map[string]any{}
	if message := copyOptionalString(object, parsed, "model", 160); message != "" {
		return nil, nil, message
	}
	if message := copyEnum(object, parsed, "provider", []string{"deepseek", "gateway"}); message != "" {
		return nil, nil, message
	}
	if message := copyEnum(object, parsed, "reviewMode", []string{"image", "video"}); message != "" {
		return nil, nil, message
	}
	if message := copyOptionalString(object, parsed, "customBaseUrl", 0); message != "" {
		return nil, nil, message
	}
	if message := copyOptionalString(object, parsed, "customApiKey", 0); message != "" {
		return nil, nil, message
	}
	if message := copyOptionalString(object, parsed, "textProtocol", 32); message != "" {
		return nil, nil, message
	}
	if message := copyEnum(object, parsed, "reasoningEffort", []string{"auto", "low", "medium", "high", "xhigh", "max"}); message != "" {
		return nil, nil, message
	}
	if message := copyOptionalBool(object, parsed, "lookup"); message != "" {
		return nil, nil, message
	}
	if message := copyBoundedInt(object, parsed, "lookupBudget", 0, 100); message != "" {
		return nil, nil, message
	}
	if message := copyBoundedInt(object, parsed, "rulesVersion", 0, -1); message != "" {
		return nil, nil, message
	}
	rows, rowPayload, message := parseKeywordRows(object["rows"])
	if message != "" {
		return nil, nil, message
	}
	parsed["rows"] = rowPayload
	return parsed, rows, ""
}

func parseKeywordRows(value any) ([]reviewsvc.Row, []any, string) {
	if value == nil {
		return nil, nil, "rows: Required"
	}
	items, ok := value.([]any)
	if !ok {
		return nil, nil, "rows: Expected array, received " + jsonKind(value)
	}
	if len(items) == 0 {
		return nil, nil, "rows: Array must contain at least 1 element(s)"
	}
	if len(items) > 60 {
		return nil, nil, "rows: Array must contain at most 60 element(s)"
	}
	rows := make([]reviewsvc.Row, len(items))
	payload := make([]any, len(items))
	seen := map[string]struct{}{}
	for index, item := range items {
		object, ok := item.(map[string]any)
		if !ok {
			return nil, nil, fmt.Sprintf("rows.%d: Expected object, received %s", index, jsonKind(item))
		}
		id, message := reviewRequiredString(object, "id", 1, 120)
		if message != "" {
			return nil, nil, fmt.Sprintf("rows.%d.id: %s", index, message)
		}
		query, message := reviewRequiredString(object, "query", 1, 500)
		if message != "" {
			return nil, nil, fmt.Sprintf("rows.%d.query: %s", index, message)
		}
		if _, ok := seen[id]; ok {
			return nil, nil, "rows: 关键词行 id 不能重复"
		}
		seen[id] = struct{}{}
		row := reviewsvc.Row{ID: id, Query: query}
		stored := map[string]any{"id": id, "query": query}
		if text, message := optionalBoundedString(object, "expansion", 4000); message != "" {
			return nil, nil, fmt.Sprintf("rows.%d.expansion: %s", index, message)
		} else if text != nil {
			row.Expansion = text
			stored["expansion"] = *text
		}
		if text, message := optionalBoundedString(object, "entityExpansion", 4000); message != "" {
			return nil, nil, fmt.Sprintf("rows.%d.entityExpansion: %s", index, message)
		} else if text != nil {
			row.EntityExpansion = text
			stored["entityExpansion"] = *text
		}
		if text, message := optionalBoundedString(object, "contentType", 500); message != "" {
			return nil, nil, fmt.Sprintf("rows.%d.contentType: %s", index, message)
		} else if text != nil {
			row.ContentType = text
			stored["contentType"] = *text
		}
		rows[index] = row
		payload[index] = stored
	}
	return rows, payload, ""
}

func copyOptionalString(source, target map[string]any, key string, max int) string {
	value, ok := source[key]
	if !ok {
		return ""
	}
	text, ok := value.(string)
	if !ok {
		return key + ": Expected string, received " + jsonKind(value)
	}
	if max > 0 && utf8.RuneCountInString(text) > max {
		return fmt.Sprintf("%s: String must contain at most %d character(s)", key, max)
	}
	target[key] = text
	return ""
}

func copyEnum(source, target map[string]any, key string, allowed []string) string {
	value, ok := source[key]
	if !ok {
		return ""
	}
	text, ok := value.(string)
	if !ok || !containsText(allowed, text) {
		received := jsonKind(value)
		if ok {
			received = "'" + text + "'"
		}
		return key + ": Invalid enum value. Expected " + enumList(allowed) + ", received " + received
	}
	target[key] = text
	return ""
}

func copyOptionalBool(source, target map[string]any, key string) string {
	value, ok := source[key]
	if !ok {
		return ""
	}
	flag, ok := value.(bool)
	if !ok {
		return key + ": Expected boolean, received " + jsonKind(value)
	}
	target[key] = flag
	return ""
}

func copyBoundedInt(source, target map[string]any, key string, min, max int) string {
	value, ok := source[key]
	if !ok {
		return ""
	}
	number, ok := value.(float64)
	if !ok {
		return key + ": Expected number, received " + jsonKind(value)
	}
	if number != math.Trunc(number) {
		return key + ": Expected integer, received float"
	}
	if number < float64(min) {
		return fmt.Sprintf("%s: Number must be greater than or equal to %d", key, min)
	}
	if max >= 0 && number > float64(max) {
		return fmt.Sprintf("%s: Number must be less than or equal to %d", key, max)
	}
	target[key] = number
	return ""
}

func reviewRequiredString(object map[string]any, key string, min, max int) (string, string) {
	value, ok := object[key]
	if !ok || value == nil {
		return "", "Required"
	}
	text, ok := value.(string)
	if !ok {
		return "", "Expected string, received " + jsonKind(value)
	}
	length := utf8.RuneCountInString(text)
	if length < min {
		return "", fmt.Sprintf("String must contain at least %d character(s)", min)
	}
	if length > max {
		return "", fmt.Sprintf("String must contain at most %d character(s)", max)
	}
	return text, ""
}

func optionalBoundedString(object map[string]any, key string, max int) (*string, string) {
	value, ok := object[key]
	if !ok {
		return nil, ""
	}
	text, ok := value.(string)
	if !ok {
		return nil, "Expected string, received " + jsonKind(value)
	}
	if utf8.RuneCountInString(text) > max {
		return nil, fmt.Sprintf("String must contain at most %d character(s)", max)
	}
	return &text, ""
}

func containsText(values []string, value string) bool {
	for _, item := range values {
		if item == value {
			return true
		}
	}
	return false
}

func enumList(values []string) string {
	quoted := make([]string, len(values))
	for index, value := range values {
		quoted[index] = "'" + value + "'"
	}
	return strings.Join(quoted, " | ")
}
