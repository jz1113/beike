package assistant

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

func TestMCPHandshakePaginatesDefersSchemaAndHidesHeaders(t *testing.T) {
	var mu sync.Mutex
	methods := []string{}
	sawAuth := true
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer secret" {
			sawAuth = false
		}
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		method, _ := body["method"].(string)
		mu.Lock()
		methods = append(methods, method)
		mu.Unlock()
		w.Header().Set("Mcp-Session-Id", "sess-1")
		if method != "initialize" && r.Header.Get("Mcp-Session-Id") != "sess-1" {
			http.Error(w, "missing session", http.StatusBadRequest)
			return
		}
		switch method {
		case "initialize":
			_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": 1, "result": map[string]any{"protocolVersion": mcpProtocol}})
		case "notifications/initialized":
			w.WriteHeader(http.StatusAccepted)
		case "tools/list":
			params, _ := body["params"].(map[string]any)
			cursor, _ := params["cursor"].(string)
			if cursor == "" {
				tools := []any{}
				for i := 0; i < 9; i++ {
					tools = append(tools, map[string]any{
						"name": fmt.Sprintf("read_%d", i), "description": "读取",
						"inputSchema": map[string]any{"type": "object"},
						"annotations": map[string]any{"readOnlyHint": true},
					})
				}
				tools = append(tools, map[string]any{
					"name": "huge", "description": "大 schema",
					"inputSchema": map[string]any{"type": "object", "description": strings.Repeat("x", 9000)},
				})
				_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": 1, "result": map[string]any{"tools": tools, "nextCursor": "p2"}})
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": 1, "result": map[string]any{"tools": []any{
				map[string]any{"name": "write", "description": "写入", "inputSchema": map[string]any{"type": "object"}, "annotations": map[string]any{"destructiveHint": true}},
			}}})
		default:
			http.Error(w, "unexpected", http.StatusBadRequest)
		}
	}))
	defer server.Close()
	direct, bindings := listMCPToolsWith(server.Client(), []any{map[string]any{
		"name": "demo", "url": server.URL, "headers": map[string]any{"Authorization": "Bearer secret"},
	}})
	if !sawAuth {
		t.Fatal("auth header missing")
	}
	if strings.Join(methods, ",") != "initialize,notifications/initialized,tools/list,tools/list" {
		t.Fatalf("methods %v", methods)
	}
	if len(direct) != 8 {
		t.Fatalf("direct %d", len(direct))
	}
	encoded, _ := json.Marshal(direct)
	if strings.Contains(string(encoded), "secret") || strings.Contains(string(encoded), "huge") {
		t.Fatalf("direct leaked %s", encoded)
	}
	var huge, write mcpBinding
	var hugeOK, writeOK bool
	for _, binding := range bindings {
		switch binding.remote {
		case "huge":
			huge, hugeOK = binding, true
		case "write":
			write, writeOK = binding, true
		}
	}
	if !hugeOK || huge.exposed || huge.schemaBytes <= mcpSchemaLimit || !writeOK || write.exposed || !write.destructive {
		t.Fatalf("deferred huge=%v write=%v", huge, write)
	}
	if parallelSafe("mcp_demo__write", write, true) {
		t.Fatal("destructive tool grouped as parallel")
	}
	box := &toolBox{mcp: bindings, mcpEnabled: true}
	found := box.searchMCP(map[string]any{"query": "写入"})
	if !strings.Contains(found, "write") || strings.Contains(found, "secret") {
		t.Fatalf("search %s", found)
	}
	missing := box.loadMCP(map[string]any{"name": "mcp_demo__missing"})
	if !strings.Contains(missing, "search_mcp_tools") || !strings.Contains(missing, "demo") || strings.Contains(missing, "secret") {
		t.Fatalf("missing %s", missing)
	}
	loop := &agentLoop{tools: append([]map[string]any{}, direct...), names: []string{}, box: box}
	for _, tool := range direct {
		fn, _ := tool["function"].(map[string]any)
		name, _ := fn["name"].(string)
		loop.names = append(loop.names, name)
	}
	box.activateMCP = loop.activateMCPTool
	loaded := box.loadMCP(map[string]any{"name": advertisedName(bindings, "huge")})
	if !strings.Contains(loaded, "下一轮可以调用") || !containsTool(loop.names, advertisedName(bindings, "huge")) {
		t.Fatalf("load %s %#v", loaded, loop.names)
	}
}

func TestVisualBudgetOmitsOversizedImages(t *testing.T) {
	budget := &visualBudget{}
	if !budget.accept("data:image/png;base64,aaaa") {
		t.Fatal("small image rejected")
	}
	if budget.accept("data:image/png;base64," + strings.Repeat("a", visualByteCap)) {
		t.Fatal("oversized image accepted")
	}
	budget.count = visualImageCap
	box := &toolBox{visual: budget}
	raw := box.attachVisual(`{"success":true,"text":"ok","imageCount":1}`, []string{"data:image/png;base64," + strings.Repeat("b", 100)})
	if strings.Contains(raw, strings.Repeat("b", 40)) || !strings.Contains(raw, `"omittedImages":1`) {
		t.Fatalf("omitted %s", raw)
	}
}

func advertisedName(bindings map[string]mcpBinding, remote string) string {
	for name, binding := range bindings {
		if binding.remote == remote {
			return name
		}
	}
	return ""
}
