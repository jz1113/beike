package library

func modelOption(payload map[string]any, name string) any {
	if value, ok := payload[name]; ok {
		return value
	}
	overrides, _ := payload["overrides"].(map[string]any)
	return overrides[name]
}
