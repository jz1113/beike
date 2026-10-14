package assistant

import (
	"encoding/json"
	"math"
	"strings"
)

func parseToolArguments(name, raw string) (map[string]any, error) {
	if len(raw) > 100_000 {
		return nil, errArgs("工具参数过大")
	}
	if strings.TrimSpace(raw) == "" {
		raw = "{}"
	}
	var value any
	if json.Unmarshal([]byte(raw), &value) != nil {
		return nil, errArgs("工具参数不是有效 JSON")
	}
	args, ok := value.(map[string]any)
	if !ok {
		return nil, errArgs("工具参数必须是对象")
	}
	def, known := toolByName(name)
	if !known && !strings.HasPrefix(name, "mcp_") {
		return nil, errArgs("工具不存在")
	}
	schema := map[string]any{"type": "object"}
	if known {
		schema = def.Parameters
	}
	if err := validateToolValue(value, schema, 0); err != nil {
		return nil, err
	}
	return args, nil
}

func validateToolValue(value any, schema map[string]any, depth int) error {
	if depth > 12 {
		return errArgs("工具参数嵌套过深")
	}
	if schema == nil {
		schema = map[string]any{}
	}
	if enums, ok := schema["enum"].([]any); ok && !enumHas(enums, value) {
		return errArgs("工具参数不在允许的选项中")
	}
	if text, ok := value.(string); ok {
		limit := 100_000
		if max, ok := numberField(schema, "maxLength"); ok && int(max) < limit {
			limit = int(max)
		}
		if len(text) > limit {
			return errArgs("工具文本参数过长")
		}
		if min, ok := numberField(schema, "minLength"); ok && len(text) < int(min) {
			return errArgs("工具文本参数为空或过短")
		}
	}
	if num, ok := value.(float64); ok {
		if math.IsNaN(num) || math.IsInf(num, 0) {
			return errArgs("工具数值参数超出范围")
		}
		if min, ok := numberField(schema, "minimum"); ok && num < min {
			return errArgs("工具数值参数超出范围")
		}
		if max, ok := numberField(schema, "maximum"); ok && num > max {
			return errArgs("工具数值参数超出范围")
		}
	}
	types := schemaTypes(schema)
	if len(types) > 0 && !typeMatches(types, value) {
		return errArgs("工具参数类型不符合定义")
	}
	if list, ok := value.([]any); ok {
		limit := 1000
		if max, ok := numberField(schema, "maxItems"); ok && int(max) < limit {
			limit = int(max)
		}
		if len(list) > limit {
			return errArgs("工具列表参数过多")
		}
		if min, ok := numberField(schema, "minItems"); ok && len(list) < int(min) {
			return errArgs("工具列表参数过多")
		}
		itemSchema, _ := schema["items"].(map[string]any)
		for _, item := range list {
			if err := validateToolValue(item, itemSchema, depth+1); err != nil {
				return err
			}
		}
		return nil
	}
	obj, ok := value.(map[string]any)
	if !ok {
		return nil
	}
	if len(obj) > 1000 {
		return errArgs("工具参数字段过多")
	}
	props, _ := schema["properties"].(map[string]any)
	if required, ok := schema["required"].([]any); ok {
		for _, key := range required {
			name, _ := key.(string)
			if name != "" {
				if _, exists := obj[name]; !exists {
					return errArgs("工具参数缺少必填字段 " + name)
				}
			}
		}
	}
	for key, item := range obj {
		if key == "__proto__" || key == "prototype" || key == "constructor" {
			return errArgs("工具参数包含不允许的字段")
		}
		child, known := props[key].(map[string]any)
		if schema["additionalProperties"] == false && !known {
			return errArgs("工具参数包含未定义字段")
		}
		if err := validateToolValue(item, child, depth+1); err != nil {
			return err
		}
	}
	return nil
}

func schemaTypes(schema map[string]any) []string {
	switch typed := schema["type"].(type) {
	case string:
		return []string{typed}
	case []any:
		out := []string{}
		for _, item := range typed {
			if text, ok := item.(string); ok {
				out = append(out, text)
			}
		}
		return out
	default:
		return nil
	}
}

func typeMatches(types []string, value any) bool {
	actual := "null"
	switch typed := value.(type) {
	case string:
		actual = "string"
	case float64:
		actual = "number"
	case bool:
		actual = "boolean"
	case []any:
		actual = "array"
	case map[string]any:
		actual = "object"
	case nil:
		actual = "null"
	default:
		_ = typed
	}
	for _, kind := range types {
		if kind == actual {
			return true
		}
		if kind == "integer" {
			if num, ok := value.(float64); ok && num == math.Trunc(num) {
				return true
			}
		}
	}
	return false
}

func enumHas(enums []any, value any) bool {
	for _, item := range enums {
		if item == value {
			return true
		}
	}
	return false
}

func numberField(schema map[string]any, key string) (float64, bool) {
	switch typed := schema[key].(type) {
	case float64:
		return typed, true
	case int:
		return float64(typed), true
	default:
		return 0, false
	}
}

type errArgs string

func (e errArgs) Error() string { return string(e) }
