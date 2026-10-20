package assistant

import (
	"strings"
	"testing"
)

func TestMCPNamesStayReadableAndUnique(t *testing.T) {
	used := map[string]mcpBinding{}
	first := uniqueMCPName("my-server", "list.tools", used)
	used[first] = mcpBinding{}
	second := uniqueMCPName("my server", "list tools", used)
	if first != "mcp_my_server__list_tools" {
		t.Fatalf("first %s", first)
	}
	if second == first || !strings.HasPrefix(second, "mcp_my_server__list_tools_") || len(second) > 64 {
		t.Fatalf("second %s", second)
	}
	long := uniqueMCPName(strings.Repeat("a", 80), strings.Repeat("b", 80), map[string]mcpBinding{})
	if len(long) > 64 || !strings.HasPrefix(long, "mcp_") {
		t.Fatalf("long %s", long)
	}
	if label, ok := mcpDisplayLabel(first); !ok || label != "外部工具 list tools" {
		t.Fatalf("label %q %v", label, ok)
	}
}

func TestFormatMCPResponseKeepsTextAndDropsImages(t *testing.T) {
	raw, refs := formatMCPResponse(map[string]any{
		"result": map[string]any{
			"content": []any{
				map[string]any{"type": "text", "text": "库存 3"},
				map[string]any{"type": "image", "data": strings.Repeat("a", 500), "mimeType": "image/png"},
			},
		},
	})
	if !strings.Contains(raw, `"text":"库存 3"`) || !strings.Contains(raw, `"imageCount":1`) || strings.Contains(raw, strings.Repeat("a", 100)) {
		t.Fatalf("content %s", raw)
	}
	if len(refs) != 1 || !strings.HasPrefix(refs[0], "data:image/png;base64,") {
		t.Fatalf("refs %#v", refs)
	}
	attached := (&toolBox{visual: &visualBudget{}}).attachVisual(raw, refs)
	if strings.Contains(stripVisual(attached), strings.Repeat("a", 100)) || visualFollowup(attached) == nil {
		t.Fatalf("visual %s", attached)
	}
	failed, _ := formatMCPResponse(map[string]any{
		"result": map[string]any{
			"isError": true,
			"content": []any{map[string]any{"type": "text", "text": "服务忙"}},
		},
	})
	if !strings.Contains(failed, `"success":false`) || !strings.Contains(failed, "服务忙") {
		t.Fatalf("error %s", failed)
	}
	blob, _ := formatMCPResponse(map[string]any{
		"result": map[string]any{"data": "data:image/png;base64," + strings.Repeat("b", 40), "note": "ok"},
	})
	if strings.Contains(blob, "base64") || !strings.Contains(blob, "[省略]") || !strings.Contains(blob, "ok") {
		t.Fatalf("blob %s", blob)
	}
}

func TestReadOnlyMCPToolsCanShareAGroup(t *testing.T) {
	groups := toolGroupsWith([]string{"mcp_demo__read", "query_asset_library", "mcp_demo__write"}, func(name string) bool {
		switch name {
		case "mcp_demo__read":
			return parallelSafe(name, mcpBinding{readOnly: true}, true)
		case "mcp_demo__write":
			return parallelSafe(name, mcpBinding{}, true)
		default:
			return parallelSafe(name, mcpBinding{}, false)
		}
	})
	if len(groups) != 2 || len(groups[0]) != 2 || groups[1][0] != 2 {
		t.Fatalf("groups %#v", groups)
	}
	if isParallelSafe("mcp_demo") {
		t.Fatal("unknown mcp stays sequential")
	}
	if parallelSafe("mcp_demo__danger", mcpBinding{readOnly: true, destructive: true}, true) {
		t.Fatal("destructive mcp stays sequential")
	}
	if parallelSafe("mcp_demo__world", mcpBinding{readOnly: true, openWorld: true}, true) {
		t.Fatal("open world mcp stays sequential")
	}
}

func TestReadSkillFileUsesTheTurnPackage(t *testing.T) {
	box := &toolBox{skillFiles: []skillResource{{Path: "examples.md", Content: "样例正文"}}}
	found := box.readSkillFile(map[string]any{"path": "examples.md"})
	if !strings.Contains(found, "样例正文") {
		t.Fatalf("found %s", found)
	}
	missing := box.readSkillFile(map[string]any{"path": "missing.md"})
	if !strings.Contains(missing, `"success":false`) {
		t.Fatalf("missing %s", missing)
	}
}
