package canvas

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

var workspaceID = regexp.MustCompile(`^[0-9a-f]{64}$`)

type draftLink struct {
	ID       string `json:"id"`
	Revision int    `json:"revision"`
	URL      string `json:"url"`
}
type linkedDraft struct {
	draftLink
	Graph         graph          `json:"graph"`
	PromptChanges []promptChange `json:"promptChanges"`
}

func MCP(cfg config.Config) http.Handler {
	unavailable := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.NotFound(w, r) })
	origin, err := url.Parse(cfg.CanvasPublicURL)
	if len(cfg.CanvasMCPToken) < 32 || err != nil || origin.Host == "" || origin.User != nil ||
		(origin.Scheme != "https" && (cfg.Production() || origin.Scheme != "http" || (origin.Hostname() != "localhost" && origin.Hostname() != "127.0.0.1"))) ||
		(origin.Path != "" && origin.Path != "/") || origin.RawQuery != "" || origin.Fragment != "" ||
		(cfg.Production() && (!workspaceID.MatchString(cfg.CanvasMCPWorkspace) || cfg.AccessToken == "" ||
			httpx.TokenMatches(cfg.CanvasMCPToken, cfg.AccessToken) || httpx.TokenMatches(cfg.CanvasMCPToken, cfg.AdminToken))) {
		return unavailable
	}
	workspace := cfg.CanvasMCPWorkspace
	if !cfg.Production() {
		workspace = "local"
	}
	s := store{cfg, workspace}
	link := func(d draft) draftLink {
		u := *origin
		u.Path = "/"
		u.RawQuery = url.Values{"view": {"canvas"}, "cloudDraft": {d.ID}}.Encode()
		return draftLink{d.ID, d.Revision, u.String()}
	}
	server := mcp.NewServer(&mcp.Implementation{Name: "beike-canvas", Version: "1.0.0"}, &mcp.ServerOptions{
		Instructions: "先读取节点目录，用现有节点创建线上草稿。你负责写或优化提示词；仅将优化稿保存到草稿，最后返回可编辑链接。不要声称生成了媒体。目标模型只作为改写依据，实际可用模型在画布中选择。",
	})
	mcp.AddTool(server, &mcp.Tool{Name: "canvas_list_nodes", Description: "读取首版支持的贝壳 Studio 节点和连线类型。", Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true}},
		func(_ context.Context, _ *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, struct {
			Nodes []nodeKind `json:"nodes"`
			Usage string     `json:"usage"`
		}, error) {
			return nil, struct {
				Nodes []nodeKind `json:"nodes"`
				Usage string     `json:"usage"`
			}{catalog, "上传节点是素材占位。按 edges 数组顺序连接参考；有独立文案时用 text，需调用文本模型时用 prompt。模型在编辑器选择；比例和秒数是草稿参数，运行前需核对模型能力。"}, nil
		})
	mcp.AddTool(server, &mcp.Tool{Name: "canvas_create_draft", Description: "用节点和连线创建线上草稿，返回可编辑链接。不会运行节点。"},
		func(ctx context.Context, _ *mcp.CallToolRequest, g graph) (*mcp.CallToolResult, draftLink, error) {
			d, err := s.create(ctx, g)
			if err != nil {
				return nil, draftLink{}, err
			}
			return nil, link(d), nil
		})
	mcp.AddTool(server, &mcp.Tool{Name: "canvas_get_draft", Description: "读取草稿结构、当前版本和提示词修改记录。", Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true}},
		func(ctx context.Context, _ *mcp.CallToolRequest, a struct {
			ID string `json:"id"`
		}) (*mcp.CallToolResult, linkedDraft, error) {
			d, err := s.read(ctx, a.ID)
			if err != nil {
				return nil, linkedDraft{}, err
			}
			return nil, linkedDraft{link(d), d.Graph, d.PromptChanges}, nil
		})
	mcp.AddTool(server, &mcp.Tool{Name: "canvas_revise_prompt", Description: "保存你写好的提示词优化稿和理由，保留原稿。revision 必须匹配当前草稿。targetModel 记录改写所针对的模型，不更改节点实际使用的模型。不会调用模型或运行节点。"},
		func(ctx context.Context, _ *mcp.CallToolRequest, a reviseArgs) (*mcp.CallToolResult, draftLink, error) {
			d, err := s.revise(ctx, a)
			if err != nil {
				return nil, draftLink{}, err
			}
			return nil, link(d), nil
		})
	handler := mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return server }, &mcp.StreamableHTTPOptions{Stateless: true, JSONResponse: true})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if r.Header.Get("Origin") != "" && r.Header.Get("Origin") != fmt.Sprintf("%s://%s", origin.Scheme, origin.Host) {
			http.Error(w, "Origin not allowed", http.StatusForbidden)
			return
		}
		scheme, token, ok := strings.Cut(r.Header.Get("Authorization"), " ")
		if !ok || !strings.EqualFold(scheme, "Bearer") || !httpx.TokenMatches(token, cfg.CanvasMCPToken) {
			w.Header().Set("WWW-Authenticate", `Bearer realm="beike-canvas"`)
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 4<<20)
		handler.ServeHTTP(w, r)
	})
}
