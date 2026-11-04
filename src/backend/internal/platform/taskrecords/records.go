package taskrecords

import (
	"database/sql"
	"net/http"
	"strconv"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

// Each domain supplies a workspace-scoped projection. Keep pagination and search
// identical in both studios, without copying task data into a second ledger.
type Record struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Kind     string `json:"kind"`
	Status   string `json:"status"`
	Created  string `json:"createdAt"`
	Started  string `json:"startedAt"`
	Ended    string `json:"finishedAt"`
	Model    string `json:"model"`
	External string `json:"externalId"`
	Group    string `json:"group"`
	Error    string `json:"error"`
	Stage    string `json:"stage"`
	Result   string `json:"resultUrl"`
}

func Handler(cfg config.Config, source string, prepare func(*sql.DB, string) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		fail := func(status int, msg string) { httpx.WriteJSON(w, status, map[string]any{"error": msg}) }
		w.Header().Set("Cache-Control", "no-store")
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			fail(503, "任务存储不可用")
			return
		}
		defer db.Close()
		workspace := httpx.WorkspaceFrom(r)
		if prepare != nil {
			if err := prepare(db, workspace); err != nil {
				fail(503, "核对后台任务失败")
				return
			}
		}
		q := r.URL.Query()
		page, _ := strconv.Atoi(q.Get("page"))
		size, _ := strconv.Atoi(q.Get("size"))
		if page < 1 {
			page = 1
		}
		if size != 10 && size != 25 && size != 50 {
			size = 10
		}
		args := []any{workspace}
		predicates := []string{"1=1"}
		for _, field := range []string{"kind", "status", "model"} {
			if v := q.Get(field); v != "" {
				predicates = append(predicates, field+"=?")
				args = append(args, v)
			}
		}
		for _, key := range []string{"from", "until"} {
			if v := q.Get(key); v != "" {
				if _, err := time.Parse(time.RFC3339, v); err != nil {
					fail(400, "日期格式无效")
					return
				}
				op := ">="
				if key == "until" {
					op = "<"
				}
				predicates = append(predicates, "julianday(created)"+op+"julianday(?)")
				args = append(args, v)
			}
		}
		if term := strings.TrimSpace(q.Get("q")); term != "" {
			predicates = append(predicates, "instr(lower(id||' '||name||' '||external||' '||model||' '||groupName||' '||error),lower(?))>0")
			args = append(args, term)
		}
		base := "WITH records(id,name,kind,status,created,started,ended,model,external,groupName,error,stage,result) AS (" + source + ") "
		where := " FROM records WHERE " + strings.Join(predicates, " AND ")
		tx, err := db.BeginTx(r.Context(), &sql.TxOptions{ReadOnly: true})
		if err != nil {
			fail(503, "读取任务记录失败")
			return
		}
		defer tx.Rollback()
		// Offer only models actually recorded in this workspace, including models
		// no longer present in the current settings.
		modelRows, err := tx.QueryContext(r.Context(), base+"SELECT DISTINCT model FROM records WHERE model<>'' ORDER BY model", workspace)
		if err != nil {
			fail(503, "读取渠道列表失败")
			return
		}
		models := []string{}
		for modelRows.Next() {
			var model string
			if err := modelRows.Scan(&model); err != nil {
				modelRows.Close()
				fail(503, "读取渠道列表失败")
				return
			}
			models = append(models, model)
		}
		err = modelRows.Err()
		modelRows.Close()
		if err != nil {
			fail(503, "读取渠道列表失败")
			return
		}
		var total int
		if err := tx.QueryRowContext(r.Context(), base+"SELECT count(*)"+where, args...).Scan(&total); err != nil {
			fail(503, "统计任务记录失败")
			return
		}
		pages := max(1, (total+size-1)/size)
		page = min(page, pages)
		rows, err := tx.QueryContext(r.Context(), base+"SELECT *"+where+" ORDER BY julianday(created) DESC,id DESC,groupName,kind LIMIT ? OFFSET ?", append(args, size, (page-1)*size)...)
		if err != nil {
			fail(503, "查询任务记录失败")
			return
		}
		defer rows.Close()
		records := []Record{}
		for rows.Next() {
			var v Record
			if err := rows.Scan(&v.ID, &v.Name, &v.Kind, &v.Status, &v.Created, &v.Started, &v.Ended, &v.Model, &v.External, &v.Group, &v.Error, &v.Stage, &v.Result); err != nil {
				fail(503, "读取任务记录失败")
				return
			}
			records = append(records, v)
		}
		if rows.Err() != nil {
			fail(503, "读取任务记录失败")
			return
		}
		httpx.WriteJSON(w, 200, map[string]any{"records": records, "models": models, "total": total, "page": page})
	}
}
