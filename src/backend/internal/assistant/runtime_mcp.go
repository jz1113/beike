package assistant

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"beike.local/cloud/src/backend/internal/platform/network"
)

const (
	mcpSchemaLimit = 8 * 1024
	mcpDirectLimit = 8
	mcpToolLimit   = 100
	mcpProtocol    = "2025-03-26"
	visualImageCap = 20
	visualByteCap  = 5_000_000
)

type mcpServerState struct {
	name      string
	url       string
	headers   map[string]string
	sessionID string
}

type mcpBinding struct {
	remote      string
	server      *mcpServerState
	readOnly    bool
	destructive bool
	openWorld   bool
	description string
	schema      map[string]any
	schemaBytes int
	exposed     bool
}

type visualBudget struct {
	mu    sync.Mutex
	count int
	bytes int
}

func (b *visualBudget) accept(dataURL string) bool {
	if b == nil || dataURL == "" {
		return false
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.count >= visualImageCap || b.bytes+len(dataURL) > visualByteCap {
		return false
	}
	b.count++
	b.bytes += len(dataURL)
	return true
}

func (binding mcpBinding) serverLabel() string {
	if binding.server == nil || strings.TrimSpace(binding.server.name) == "" {
		return "外部服务"
	}
	return binding.server.name
}

func listMCPTools(servers []any) ([]map[string]any, map[string]mcpBinding) {
	return listMCPToolsWith(network.SafeClient(), servers)
}

func listMCPToolsWith(client *http.Client, servers []any) ([]map[string]any, map[string]mcpBinding) {
	direct := []map[string]any{}
	bindings := map[string]mcpBinding{}
	directCount := 0
	for _, item := range servers {
		if len(bindings) >= mcpToolLimit {
			break
		}
		server, _ := item.(map[string]any)
		if server == nil || server["enabled"] == false {
			continue
		}
		rawURL, _ := server["url"].(string)
		rawURL = strings.TrimSpace(rawURL)
		if rawURL == "" {
			continue
		}
		name, _ := server["name"].(string)
		if strings.TrimSpace(name) == "" {
			name, _ = server["id"].(string)
		}
		state := &mcpServerState{name: strings.TrimSpace(name), url: rawURL, headers: mcpHeaders(server["headers"])}
		sessionID, ok := mcpHandshake(client, state)
		if !ok {
			continue
		}
		state.sessionID = sessionID
		cursor := ""
		for len(bindings) < mcpToolLimit {
			params := map[string]any{}
			if cursor != "" {
				params["cursor"] = cursor
			}
			listed, nextSession := mcpRPC(client, state.url, "tools/list", params, state.headers, state.sessionID, false)
			if nextSession != "" {
				state.sessionID = nextSession
			}
			if _, failed := listed["error"]; failed {
				break
			}
			result, _ := listed["result"].(map[string]any)
			if result == nil {
				break
			}
			rows, _ := result["tools"].([]any)
			for _, row := range rows {
				if len(bindings) >= mcpToolLimit {
					break
				}
				tool, _ := row.(map[string]any)
				remote, _ := tool["name"].(string)
				if remote == "" {
					continue
				}
				advertised := uniqueMCPName(state.name, remote, bindings)
				annotations, _ := tool["annotations"].(map[string]any)
				schema, _ := tool["inputSchema"].(map[string]any)
				if schema == nil {
					schema = map[string]any{"type": "object"}
				}
				encoded, _ := json.Marshal(schema)
				description, _ := tool["description"].(string)
				description = trimRunes(description, 400)
				binding := mcpBinding{
					remote: remote, server: state, description: description, schema: schema, schemaBytes: len(encoded),
					readOnly: annotationFlag(annotations, "readOnlyHint"), destructive: annotationFlag(annotations, "destructiveHint"),
					openWorld: annotationFlag(annotations, "openWorldHint"),
				}
				if binding.schemaBytes <= mcpSchemaLimit && directCount < mcpDirectLimit {
					binding.exposed = true
					directCount++
					direct = append(direct, mcpFunctionSpec(advertised, description, schema))
				}
				bindings[advertised] = binding
			}
			next, _ := result["nextCursor"].(string)
			next = strings.TrimSpace(next)
			if next == "" || next == cursor {
				break
			}
			cursor = next
		}
	}
	return direct, bindings
}

func annotationFlag(annotations map[string]any, key string) bool {
	value, _ := annotations[key].(bool)
	return value
}

func mcpFunctionSpec(name, description string, schema map[string]any) map[string]any {
	if schema == nil {
		schema = map[string]any{"type": "object"}
	}
	return map[string]any{"type": "function", "function": map[string]any{
		"name": name, "description": trimRunes(description, 400), "parameters": schema,
	}}
}

func mcpHeaders(raw any) map[string]string {
	rows, _ := raw.(map[string]any)
	if len(rows) == 0 {
		return nil
	}
	keys := make([]string, 0, len(rows))
	for key := range rows {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	out := map[string]string{}
	for _, key := range keys {
		if len(out) >= 8 {
			break
		}
		name := strings.TrimSpace(key)
		text, _ := rows[key].(string)
		if name == "" || text == "" || len(name) > 200 || len(text) > 4000 {
			continue
		}
		switch strings.ToLower(name) {
		case "host", "content-length", "content-type", "accept", "mcp-session-id", "mcp-protocol-version":
			continue
		}
		out[name] = text
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func mcpHandshake(client *http.Client, state *mcpServerState) (string, bool) {
	initialized, sessionID := mcpRPC(client, state.url, "initialize", map[string]any{
		"protocolVersion": mcpProtocol,
		"capabilities":    map[string]any{},
		"clientInfo":      map[string]any{"name": "beike-assistant", "version": "1.0.0"},
	}, state.headers, "", false)
	if _, failed := initialized["error"]; failed {
		return "", false
	}
	if _, ok := initialized["result"]; !ok {
		return "", false
	}
	_, _ = mcpRPC(client, state.url, "notifications/initialized", map[string]any{}, state.headers, sessionID, true)
	return sessionID, true
}

func uniqueMCPName(serverName, toolName string, used map[string]mcpBinding) string {
	base := "mcp_" + slugToken(serverName, "server") + "__" + slugToken(toolName, "tool")
	name := fitASCII(base, 64)
	if _, exists := used[name]; !exists {
		return name
	}
	sum := sha256.Sum256([]byte(serverName + "\n" + toolName))
	digest := hex.EncodeToString(sum[:])
	for offset := 0; offset+4 <= len(digest); offset += 4 {
		suffix := "_" + digest[offset:offset+4]
		candidate := strings.TrimRight(fitASCII(base, 64-len(suffix)), "_") + suffix
		if _, exists := used[candidate]; !exists {
			return candidate
		}
	}
	return strings.TrimRight(fitASCII(base, 60), "_") + "_alt"
}

func slugToken(value, fallback string) string {
	var b strings.Builder
	for _, r := range value {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '_':
			b.WriteRune(r)
		case r == '-', r == ' ', r == '.':
			b.WriteByte('_')
		}
	}
	out := strings.Trim(b.String(), "_")
	if out == "" {
		return fallback
	}
	return out
}

func fitASCII(value string, limit int) string {
	if len(value) <= limit {
		return value
	}
	return value[:limit]
}

func mcpDisplayLabel(name string) (string, bool) {
	if !strings.HasPrefix(name, "mcp_") {
		return "", false
	}
	rest := strings.TrimPrefix(name, "mcp_")
	parts := strings.SplitN(rest, "__", 2)
	if len(parts) != 2 {
		return "外部工具", true
	}
	label := strings.TrimSpace(strings.ReplaceAll(parts[1], "_", " "))
	if label == "" {
		return "外部工具", true
	}
	return "外部工具 " + label, true
}

func mcpRPC(client *http.Client, rawURL, method string, params any, headers map[string]string, sessionID string, notify bool) (map[string]any, string) {
	payload := map[string]any{"jsonrpc": "2.0", "method": method}
	if !notify {
		payload["id"] = 1
	}
	if params != nil {
		payload["params"] = params
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequest(http.MethodPost, rawURL, bytes.NewReader(body))
	if err != nil {
		return map[string]any{"error": map[string]any{"message": "MCP 请求无法发送"}}, ""
	}
	req.Header.Set("content-type", "application/json")
	req.Header.Set("accept", "application/json, text/event-stream")
	req.Header.Set("mcp-protocol-version", mcpProtocol)
	if sessionID != "" {
		req.Header.Set("mcp-session-id", sessionID)
	}
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	req = req.WithContext(ctx)
	response, err := client.Do(req)
	if err != nil {
		return map[string]any{"error": map[string]any{"message": "MCP 服务暂时不可用"}}, ""
	}
	defer response.Body.Close()
	nextSession := response.Header.Get("Mcp-Session-Id")
	raw, _ := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if notify {
		if response.StatusCode >= 400 {
			return map[string]any{"error": map[string]any{"message": "MCP 初始化通知失败"}}, nextSession
		}
		return map[string]any{"result": map[string]any{}}, nextSession
	}
	if response.StatusCode >= 300 {
		return map[string]any{"error": map[string]any{"message": "MCP 服务暂时不可用"}}, nextSession
	}
	var parsed map[string]any
	if json.Unmarshal(raw, &parsed) != nil {
		return map[string]any{"error": map[string]any{"message": "MCP 响应不是 JSON"}}, nextSession
	}
	return parsed, nextSession
}

func trimRunes(value string, limit int) string {
	runes := []rune(value)
	if len(runes) > limit {
		runes = runes[:limit]
	}
	return string(runes)
}

func exposedMCPNames(bindings map[string]mcpBinding) []string {
	names := []string{}
	for name, binding := range bindings {
		if binding.exposed {
			names = append(names, name)
		}
	}
	sort.Strings(names)
	return names
}
