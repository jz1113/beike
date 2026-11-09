package canvas

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

type nodeKind struct {
	Type    string   `json:"type"`
	Label   string   `json:"label"`
	Output  string   `json:"output"`
	Accepts []string `json:"accepts"`
}

var catalog = []nodeKind{
	{"image-input", "上传图片", "image", nil},
	{"video-input", "上传视频", "video", nil},
	{"audio-input", "上传音频", "audio", nil},
	{"text-node", "文字或文本生成", "text", []string{"text", "image", "video", "audio"}},
	{"gen-image", "生成图片", "image", []string{"text", "image"}},
	{"gen-video", "生成视频", "video", []string{"text", "image", "video"}},
	{"gen-speech", "配音", "audio", []string{"text"}},
	{"preview", "预览", "", []string{"image", "video", "audio"}},
	{"local-save", "下载", "", []string{"image", "video", "audio"}},
}
var identifier = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,64}$`)
var ratioPattern = regexp.MustCompile(`^[1-9][0-9]?:[1-9][0-9]?$`)

type node struct {
	ID              string `json:"id"`
	Type            string `json:"type"`
	Title           string `json:"title"`
	Text            string `json:"text,omitempty" jsonschema:"Static text for text-node; mutually exclusive with prompt"`
	Prompt          string `json:"prompt,omitempty"`
	Ratio           string `json:"ratio,omitempty"`
	DurationSeconds int    `json:"durationSeconds,omitempty"`
}
type edge struct {
	From string `json:"from"`
	To   string `json:"to"`
}
type graph struct {
	Title string `json:"title"`
	Nodes []node `json:"nodes"`
	Edges []edge `json:"edges"`
}

func (g graph) scene(projectID string) (map[string]any, error) {
	if !validText(g.Title, 120) || len(g.Nodes) < 1 || len(g.Nodes) > 50 || len(g.Edges) > 150 {
		return nil, fmt.Errorf("需要标题、1–50 个节点及最多 150 条连线")
	}
	kinds := map[string]nodeKind{}
	for _, kind := range catalog {
		kinds[kind.Type] = kind
	}
	byID := map[string]node{}
	indegree := map[string]int{}
	links := map[string][]string{}
	seen := map[edge]bool{}
	for _, n := range g.Nodes {
		kind, ok := kinds[n.Type]
		if !ok || !identifier.MatchString(n.ID) || byID[n.ID].ID != "" || !validText(n.Title, 120) {
			return nil, fmt.Errorf("无效或重复的节点：%s", n.ID)
		}
		if (n.Text != "" && (n.Type != "text-node" || n.Prompt != "" || !validText(n.Text, 12000))) ||
			(n.Prompt != "" && (len(kind.Accepts) == 0 || kind.Output == "" || !validText(n.Prompt, 12000))) ||
			(n.Ratio != "" && ((n.Type != "gen-image" && n.Type != "gen-video") || !ratioPattern.MatchString(n.Ratio))) ||
			(n.DurationSeconds != 0 && (n.Type != "gen-video" || n.DurationSeconds < 1 || n.DurationSeconds > 30)) {
			return nil, fmt.Errorf("节点 %s 的文字、提示词、比例或时长无效", n.ID)
		}
		byID[n.ID] = n
		indegree[n.ID] = 0
	}
	connections := make([]map[string]any, 0, len(g.Edges))
	for i, e := range g.Edges {
		from, to := kinds[byID[e.From].Type], kinds[byID[e.To].Type]
		compatible := false
		for _, input := range to.Accepts {
			if input == from.Output {
				compatible = true
			}
		}
		if seen[e] || e.From == e.To || !compatible || byID[e.To].Text != "" {
			return nil, fmt.Errorf("无效或重复的连线：%s → %s", e.From, e.To)
		}
		seen[e] = true
		indegree[e.To]++
		links[e.From] = append(links[e.From], e.To)
		connections = append(connections, map[string]any{"id": fmt.Sprintf("%s-edge-%d", projectID, i), "from": projectID + "-" + e.From, "to": projectID + "-" + e.To})
	}
	queue := []string{}
	cols := map[string]int{}
	for _, n := range g.Nodes {
		if indegree[n.ID] == 0 {
			queue = append(queue, n.ID)
		}
	}
	for i := 0; i < len(queue); i++ {
		id := queue[i]
		for _, to := range links[id] {
			cols[to] = max(cols[to], cols[id]+1)
			indegree[to]--
			if indegree[to] == 0 {
				queue = append(queue, to)
			}
		}
	}
	if len(queue) != len(g.Nodes) {
		return nil, fmt.Errorf("连线不能成环")
	}
	rows := map[int]int{}
	nodes := make([]map[string]any, 0, len(g.Nodes))
	for _, n := range g.Nodes {
		col := cols[n.ID]
		settings := map[string]any{}
		kind := n.Type
		switch kind {
		case "image-input", "video-input", "audio-input":
			settings["mediaType"] = kinds[kind].Output
			kind = "input-image"
		case "text-node":
			if n.Text != "" {
				settings["text"], settings["aiGenerated"] = n.Text, true
			}
			if n.Prompt != "" {
				settings["textNodeDraftPrompt"], settings["textNodeComposerPromptExpanded"] = n.Prompt, true
				settings["beikeTextResultRequired"] = true
			}
		}
		if n.Ratio != "" {
			settings["ratio"] = n.Ratio
		}
		if n.DurationSeconds != 0 {
			settings["duration"] = strconv.Itoa(n.DurationSeconds) + "s"
		}
		nodes = append(nodes, map[string]any{"id": projectID + "-" + n.ID, "type": kind, "nodeName": strings.TrimSpace(n.Title), "x": 80 + 420*col, "y": 100 + 380*rows[col], "width": 340, "height": 300, "settings": settings, "prompt": n.Prompt})
		rows[col]++
	}
	return map[string]any{"nodes": nodes, "connections": connections, "groups": []any{}, "textBoxes": []any{}, "strokes": []any{}, "view": map[string]any{"x": 40, "y": 60, "zoom": 0.6}}, nil
}
func validText(s string, maxLen int) bool {
	return strings.TrimSpace(s) != "" && utf8.RuneCountInString(s) <= maxLen && !strings.ContainsRune(s, 0)
}
