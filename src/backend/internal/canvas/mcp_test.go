package canvas

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database/migrate"
)

func TestRemoteDraftRoundTrip(t *testing.T) {
	root := filepath.Join("..", "..", "..", "..")
	path := filepath.Join(t.TempDir(), "canvas.db")
	if err := migrate.Run(path, root, false); err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{NodeEnv: "production", DatabaseURL: "file:" + path, CanvasPublicURL: "https://beike.example",
		AccessToken: "test-browser-access", CanvasMCPToken: strings.Repeat("m", 40), CanvasMCPWorkspace: fmt.Sprintf("%x", sha256.Sum256([]byte("test-workspace")))}
	handler := MCP(cfg)
	send := func(body, token string) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest("POST", "/api/canvas/mcp", strings.NewReader(body))
		req.Header.Set("Accept", "application/json, text/event-stream")
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("MCP-Protocol-Version", "2025-11-25")
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)
		return w
	}
	init := `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}`
	if w := send(init, cfg.AccessToken); w.Code != 401 {
		t.Fatalf("browser token on MCP: %d", w.Code)
	}
	if w := send(init, cfg.CanvasMCPToken); w.Code != 200 || !strings.Contains(w.Body.String(), "beike-canvas") {
		t.Fatalf("initialize: %d %s", w.Code, w.Body)
	}
	if w := send(`{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}`, cfg.CanvasMCPToken); w.Code != 200 || !strings.Contains(w.Body.String(), "canvas_revise_prompt") {
		t.Fatalf("list: %d %s", w.Code, w.Body)
	}
	call := func(name string, args any, out any) bool {
		t.Helper()
		body, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": map[string]any{"name": name, "arguments": args}})
		w := send(string(body), cfg.CanvasMCPToken)
		var envelope struct {
			Result struct {
				IsError           bool
				StructuredContent json.RawMessage
			}
			Error json.RawMessage
		}
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &envelope) != nil || envelope.Error != nil {
			t.Fatalf("call %s: %d %s", name, w.Code, w.Body)
		}
		if envelope.Result.IsError {
			return false
		}
		if out != nil && json.Unmarshal(envelope.Result.StructuredContent, out) != nil {
			t.Fatalf("decode %s: %s", name, w.Body)
		}
		return true
	}
	g := graph{Title: "15 秒短片", Nodes: []node{
		{ID: "photo", Type: "image-input", Title: "商品图"},
		{ID: "first", Type: "gen-image", Title: "首帧", Prompt: "拍商品"},
		{ID: "video", Type: "gen-video", Title: "视频", Prompt: "展示商品", DurationSeconds: 15, Ratio: "9:16"},
		{ID: "preview", Type: "preview", Title: "预览"},
	}, Edges: []edge{{"photo", "first"}, {"first", "video"}, {"video", "preview"}}}
	var d draftLink
	if !call("canvas_create_draft", g, &d) || d.Revision != 1 || !strings.HasPrefix(d.URL, "https://beike.example/?cloudDraft=") {
		t.Fatalf("create: %#v", d)
	}
	edit := reviseArgs{ID: d.ID, Revision: 1, NodeID: "video", Prompt: "保持商品外观，镜头缓慢推进", Reason: "补充镜头和商品一致性", TargetModel: "Seedance"}
	var revised draftLink
	if !call("canvas_revise_prompt", edit, &revised) || revised.Revision != 2 {
		t.Fatalf("revise: %#v", revised)
	}
	edit.Prompt = "不应覆盖"
	if call("canvas_revise_prompt", edit, nil) {
		t.Fatal("stale revision accepted")
	}
	var read linkedDraft
	if !call("canvas_get_draft", map[string]string{"id": d.ID}, &read) || len(read.PromptChanges) != 1 ||
		read.PromptChanges[0].Original != "展示商品" || read.Graph.Nodes[2].Prompt != "保持商品外观，镜头缓慢推进" {
		t.Fatalf("read: %#v", read)
	}
	for _, scope := range []string{"other", cfg.CanvasMCPWorkspace} {
		req := httptest.NewRequest("GET", "/api/canvas/drafts/"+d.ID, nil)
		req.SetPathValue("id", d.ID)
		w := httptest.NewRecorder()
		DraftGet(cfg).ServeHTTP(w, req.WithContext(httpx.WithWorkspace(req.Context(), scope)))
		if scope == "other" {
			if w.Code != 404 {
				t.Fatalf("cross-workspace read: %d", w.Code)
			}
		} else if w.Code != 200 || !bytes.Contains(w.Body.Bytes(), []byte("保持商品外观")) || !bytes.Contains(w.Body.Bytes(), []byte("studioScene")) {
			t.Fatalf("editor project: %d %s", w.Code, w.Body)
		}
	}
}

func TestGraphRejectsInvalidConnections(t *testing.T) {
	g := graph{Title: "草稿", Nodes: []node{{ID: "one", Type: "text-node", Title: "分镜"}, {ID: "two", Type: "text-node", Title: "脚本"}, {ID: "video", Type: "gen-video", Title: "短片"}}}
	for _, edges := range [][]edge{
		{{"missing", "two"}}, {{"one", "one"}}, {{"one", "two"}, {"one", "two"}}, {{"one", "two"}, {"two", "one"}},
	} {
		g.Edges = edges
		if _, err := g.scene("project"); err == nil {
			t.Errorf("accepted invalid edges: %#v", edges)
		}
	}
}
