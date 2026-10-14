package assistant

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/platform/network"
)

type mcpBinding struct {
	remote string
	url    string
}

func listMCPTools(servers []any) ([]map[string]any, map[string]mcpBinding) {
	client := network.SafeClient()
	tools := []map[string]any{}
	bindings := map[string]mcpBinding{}
	for _, item := range servers {
		server, _ := item.(map[string]any)
		if server == nil || server["enabled"] == false {
			continue
		}
		rawURL, _ := server["url"].(string)
		rawURL = strings.TrimSpace(rawURL)
		if rawURL == "" {
			continue
		}
		listed := mcpRPC(client, rawURL, "tools/list", map[string]any{})
		result, _ := listed["result"].(map[string]any)
		rows, _ := result["tools"].([]any)
		if len(rows) > 100 {
			rows = rows[:100]
		}
		id, _ := server["id"].(string)
		ns := id
		if len(ns) > 8 {
			ns = ns[:8]
		}
		for _, row := range rows {
			tool, _ := row.(map[string]any)
			name, _ := tool["name"].(string)
			if name == "" {
				continue
			}
			sum := sha256.Sum256([]byte(rawURL + "\n" + name))
			advertised := "mcp_" + ns + "_" + trimRunes(name, 40) + "_" + hex.EncodeToString(sum[:])[:6]
			bindings[advertised] = mcpBinding{remote: name, url: rawURL}
			schema, _ := tool["inputSchema"].(map[string]any)
			if schema == nil {
				schema = map[string]any{"type": "object"}
			}
			description, _ := tool["description"].(string)
			tools = append(tools, map[string]any{"type": "function", "function": map[string]any{
				"name": advertised, "description": description, "parameters": schema,
			}})
		}
	}
	return tools, bindings
}

func (box *toolBox) callMCP(name string, args map[string]any) string {
	binding, ok := box.mcp[name]
	if !ok {
		return toolJSON(false, "未知工具: "+name)
	}
	response := mcpRPC(network.SafeClient(), binding.url, "tools/call", map[string]any{"name": binding.remote, "arguments": args})
	if errText, _ := response["error"].(map[string]any); errText != nil {
		message, _ := errText["message"].(string)
		return toolJSON(false, message)
	}
	result := response["result"]
	if row, ok := result.(map[string]any); ok && row["isError"] == true {
		return toolJSON(false, "MCP 工具返回错误")
	}
	body, _ := json.Marshal(map[string]any{"success": true, "result": result})
	return string(body)
}

func mcpRPC(client *http.Client, rawURL, method string, params any) map[string]any {
	payload, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
	req, err := http.NewRequest(http.MethodPost, rawURL, bytes.NewReader(payload))
	if err != nil {
		return map[string]any{"error": map[string]any{"message": err.Error()}}
	}
	req.Header.Set("content-type", "application/json")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	req = req.WithContext(ctx)
	response, err := client.Do(req)
	if err != nil {
		return map[string]any{"error": map[string]any{"message": err.Error()}}
	}
	defer response.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	var body map[string]any
	if json.Unmarshal(raw, &body) != nil {
		return map[string]any{"error": map[string]any{"message": "MCP 响应不是 JSON"}}
	}
	return body
}

func trimRunes(value string, limit int) string {
	runes := []rune(value)
	if len(runes) > limit {
		runes = runes[:limit]
	}
	return string(runes)
}
