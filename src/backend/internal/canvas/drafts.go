package canvas

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	"github.com/google/uuid"
)

var draftID = regexp.MustCompile(`^[0-9a-f-]{36}$`)
var errNotFound = errors.New("找不到此工作区的画布草稿")
var errConflict = errors.New("画布版本已变化，请先读取最新草稿再修改")
var errStorage = errors.New("画布草稿存储暂不可用")

type promptChange struct {
	NodeID      string `json:"nodeId"`
	Original    string `json:"original"`
	Revised     string `json:"revised"`
	Reason      string `json:"reason"`
	TargetModel string `json:"targetModel,omitempty"`
}
type draft struct {
	ID            string         `json:"id"`
	Revision      int            `json:"revision"`
	Graph         graph          `json:"graph"`
	PromptChanges []promptChange `json:"promptChanges"`
	CreatedAt     int64          `json:"createdAt"`
	UpdatedAt     int64          `json:"updatedAt"`
}
type store struct {
	cfg       config.Config
	workspace string
}

func (s store) create(ctx context.Context, g graph) (draft, error) {
	now := time.Now().UnixMilli()
	d := draft{ID: uuid.NewString(), Revision: 1, Graph: g, PromptChanges: []promptChange{}, CreatedAt: now, UpdatedAt: now}
	if _, err := g.scene(d.ID); err != nil {
		return draft{}, err
	}
	db, err := database.OpenRequired(s.cfg.SQLiteFile())
	if err != nil {
		return draft{}, errStorage
	}
	defer db.Close()
	data, _ := json.Marshal(g)
	if _, err = db.ExecContext(ctx, `INSERT INTO canvas_drafts (workspace,id,revision,graph,prompt_changes,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`, s.workspace, d.ID, 1, string(data), "[]", now, now); err != nil {
		return draft{}, errStorage
	}
	return d, nil
}
func (s store) read(ctx context.Context, id string) (draft, error) {
	if !draftID.MatchString(id) {
		return draft{}, errNotFound
	}
	db, err := database.OpenRequired(s.cfg.SQLiteFile())
	if err != nil {
		return draft{}, errStorage
	}
	defer db.Close()
	d := draft{ID: id}
	var graphData, changes string
	err = db.QueryRowContext(ctx, `SELECT revision,graph,prompt_changes,created_at,updated_at FROM canvas_drafts WHERE workspace=? AND id=?`, s.workspace, id).Scan(&d.Revision, &graphData, &changes, &d.CreatedAt, &d.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return draft{}, errNotFound
	}
	if err != nil || json.Unmarshal([]byte(graphData), &d.Graph) != nil || json.Unmarshal([]byte(changes), &d.PromptChanges) != nil {
		return draft{}, errStorage
	}
	return d, nil
}

type reviseArgs struct {
	ID          string `json:"id"`
	Revision    int    `json:"revision"`
	NodeID      string `json:"nodeId"`
	Prompt      string `json:"prompt"`
	Reason      string `json:"reason"`
	TargetModel string `json:"targetModel,omitempty"`
}

func (s store) revise(ctx context.Context, a reviseArgs) (draft, error) {
	if !validText(a.Prompt, 12000) || !validText(a.Reason, 1000) || (a.TargetModel != "" && !validText(a.TargetModel, 120)) {
		return draft{}, fmt.Errorf("请提供有效的优化稿和修改理由")
	}
	d, err := s.read(ctx, a.ID)
	if err != nil {
		return draft{}, err
	}
	if d.Revision != a.Revision {
		return draft{}, errConflict
	}
	idx := -1
	for i, n := range d.Graph.Nodes {
		if n.ID == a.NodeID {
			idx = i
			break
		}
	}
	if idx < 0 {
		return draft{}, fmt.Errorf("找不到目标节点")
	}
	n := &d.Graph.Nodes[idx]
	if n.Type != "gen-video" && n.Type != "gen-image" && n.Type != "gen-speech" && (n.Type != "text-node" || n.Text != "") {
		return draft{}, fmt.Errorf("该节点不接收生成提示词")
	}
	if n.Prompt == a.Prompt {
		return d, nil
	}
	change := promptChange{n.ID, n.Prompt, a.Prompt, a.Reason, a.TargetModel}
	// Keep the original and latest revision per node; bound storage even for long-lived drafts.
	for i, old := range d.PromptChanges {
		if old.NodeID == n.ID {
			change.Original = old.Original
			d.PromptChanges = append(d.PromptChanges[:i], d.PromptChanges[i+1:]...)
			break
		}
	}
	d.PromptChanges = append(d.PromptChanges, change)
	n.Prompt = a.Prompt
	d.UpdatedAt = time.Now().UnixMilli()
	data, _ := json.Marshal(d.Graph)
	changes, _ := json.Marshal(d.PromptChanges)
	db, err := database.OpenRequired(s.cfg.SQLiteFile())
	if err != nil {
		return draft{}, errStorage
	}
	defer db.Close()
	result, err := db.ExecContext(ctx, `UPDATE canvas_drafts SET revision=revision+1,graph=?,prompt_changes=?,updated_at=? WHERE workspace=? AND id=? AND revision=?`, string(data), string(changes), d.UpdatedAt, s.workspace, d.ID, a.Revision)
	if err != nil {
		return draft{}, errStorage
	}
	count, err := result.RowsAffected()
	if err != nil {
		return draft{}, errStorage
	}
	if count != 1 {
		return draft{}, errConflict
	}
	d.Revision++
	return d, nil
}

func DraftGet(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		s := store{cfg, httpx.WorkspaceFrom(r)}
		d, err := s.read(r.Context(), r.PathValue("id"))
		if err != nil {
			status := http.StatusInternalServerError
			if errors.Is(err, errNotFound) {
				status = http.StatusNotFound
			}
			httpx.WriteJSON(w, status, map[string]string{"error": err.Error()})
			return
		}
		id := fmt.Sprintf("cloud-canvas-%s-r%d", d.ID, d.Revision)
		scene, err := d.Graph.scene(id)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": errStorage.Error()})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"project": map[string]any{
			"id": id, "title": d.Graph.Title, "createdAt": d.CreatedAt, "updatedAt": d.UpdatedAt,
			"draft": false, "nodes": []any{}, "edges": []any{}, "studioScene": scene,
		}})
	})
}
