package poster

import (
	"database/sql"
	"net/http"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func HeadlineMemoryRevision(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		db, ok := openCoverDB(cfg)
		if !ok {
			httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "封面记忆数据库不可用"})
			return
		}
		defer db.Close()
		workspace, id := httpx.WorkspaceFrom(r), r.PathValue("id")
		if r.Method == http.MethodPost {
			err := restoreCoverRevision(r.Context(), db, workspace, id)
			if err != nil {
				coverLearningError(w, err)
				return
			}
			httpx.WriteJSON(w, 200, map[string]any{"success": true})
			return
		}
		var revision coverRevision
		err := db.QueryRowContext(r.Context(), `SELECT "id","reason","fingerprint","entryCount","sampleCount","createdAt","markdown" FROM "CoverMemoryRevision" WHERE "workspaceId"=? AND "id"=?`, workspace, id).Scan(&revision.ID, &revision.Reason, &revision.Fingerprint, &revision.EntryCount, &revision.SampleCount, &revision.CreatedAt, &revision.Markdown)
		if err != nil {
			coverLearningError(w, err)
			return
		}
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "revision": revision})
	})
}

func HeadlineMemoryFeedback(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Rating     string `json:"rating"`
			Note       string `json:"note"`
			Correction string `json:"correction"`
		}
		if decodeCoverBody(r, &body) != nil || (body.Rating != "" && body.Rating != "good" && body.Rating != "bad") || len([]rune(body.Note)) > 500 || len([]rune(body.Correction)) > 300 || strings.TrimSpace(body.Correction) != "" && len([]rune(strings.TrimSpace(body.Correction))) < 2 {
			httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": "评价无效；备注最多 500 字，纠正为 2 到 300 字"})
			return
		}
		db, ok := openCoverDB(cfg)
		if !ok {
			httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "封面记忆数据库不可用"})
			return
		}
		defer db.Close()
		workspace, id := httpx.WorkspaceFrom(r), r.PathValue("id")
		err := mutateCoverExperience(r.Context(), db, workspace, "成图反馈纠正", func(tx *sql.Tx) error {
			result, err := tx.ExecContext(r.Context(), `UPDATE "CoverMemoryUsage" SET "rating"=?,"note"=? WHERE "id"=? AND "workspaceId"=?`, body.Rating, strings.TrimSpace(body.Note), id, workspace)
			if err != nil {
				return err
			}
			count, err := result.RowsAffected()
			if err != nil {
				return err
			}
			if count == 0 {
				return sql.ErrNoRows
			}
			if rule := strings.TrimSpace(body.Correction); rule != "" {
				entry := coverEntry{ID: "feedback_" + id, Branch: "correction", Rule: rule, Source: "correction", Status: "adopted", Evidence: "成图反馈：" + id}
				result, err := tx.ExecContext(r.Context(), `UPDATE "CoverMemoryEntry" SET "rule"=?,"status"='adopted',"updatedAt"=? WHERE "id"=? AND "workspaceId"=?`, rule, coverNow(), entry.ID, workspace)
				if err != nil {
					return err
				}
				count, err := result.RowsAffected()
				if err != nil {
					return err
				}
				if count == 0 {
					return insertCoverEntries(r.Context(), tx, workspace, []coverEntry{entry})
				}
			}
			return nil
		})
		if err != nil {
			coverLearningError(w, err)
			return
		}
		httpx.WriteJSON(w, 200, map[string]any{"success": true})
	})
}

func coverLearningError(w http.ResponseWriter, err error) {
	code, message := 500, "封面经验保存或读取失败"
	if err == sql.ErrNoRows {
		code, message = 404, "找不到当前工作区的记录"
	}
	httpx.WriteJSON(w, code, map[string]any{"success": false, "error": message})
}
