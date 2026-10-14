package generate

func OptionalEnum(obj map[string]any, key, choices string, allowed ...string) string {
	value, ok := obj[key]
	if !ok {
		return ""
	}
	text, isString := value.(string)
	if !isString {
		return "Expected " + choices + ", received " + ZodReceived(value)
	}
	for _, item := range allowed {
		if text == item {
			return ""
		}
	}
	return "Invalid enum value. Expected " + choices + ", received '" + text + "'"
}

func ZodReceived(value any) string {
	switch value.(type) {
	case nil:
		return "null"
	case string:
		return "string"
	case bool:
		return "boolean"
	case float64:
		return "number"
	case []any:
		return "array"
	default:
		return "object"
	}
}
