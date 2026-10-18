package ppt

func wantsFallback(payload map[string]any) bool {
	allowed, _ := payload["allowFallback"].(bool)
	return allowed
}
