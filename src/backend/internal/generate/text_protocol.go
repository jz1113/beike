package generate

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
)

// RequestTextProtocol validates the request override. An explicitly supplied body
// field (including auto or empty) wins over the header.
func RequestTextProtocol(r *http.Request, payload map[string]any) (string, error) {
	value := strings.TrimSpace(r.Header.Get("x-text-protocol"))
	raw, exists := payload["textProtocol"]
	if !exists {
		// Background deconstruction submissions retain model options in overrides.
		if overrides, ok := payload["overrides"].(map[string]any); ok {
			raw, exists = overrides["textProtocol"]
		}
	}
	if exists {
		text, ok := raw.(string)
		if !ok {
			return "", fmt.Errorf("textProtocol 必须为字符串")
		}
		value = strings.TrimSpace(text)
	}
	value = strings.ToLower(value)
	switch value {
	case "", "auto", "openai", "gemini", "anthropic":
		return value, nil
	default:
		return "", fmt.Errorf("无效的 textProtocol，支持 auto、openai、gemini、anthropic")
	}
}

// BindTextProtocol keeps protocol selection scoped to this model request.
func BindTextProtocol(w http.ResponseWriter, r *http.Request, payload map[string]any) (*http.Request, bool) {
	protocol, err := RequestTextProtocol(r, payload)
	if err != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": err.Error()})
		return r, false
	}
	return r.WithContext(gateway.WithTextProtocol(r.Context(), protocol)), true
}

// TextFallbackAllowed prevents a native provider failure from being disguised as
// a successful local placeholder. Existing compatible-provider fallback policy remains.
func TextFallbackAllowed(ctx context.Context, model string) bool {
	return gateway.TextProtocol(ctx, model) == "openai"
}

func bindRawTextProtocol(w http.ResponseWriter, r *http.Request, payload map[string]json.RawMessage) (*http.Request, bool) {
	fields := map[string]any{}
	if raw, exists := payload["textProtocol"]; exists {
		var value any
		_ = json.Unmarshal(raw, &value)
		fields["textProtocol"] = value
	}
	return BindTextProtocol(w, r, fields)
}
