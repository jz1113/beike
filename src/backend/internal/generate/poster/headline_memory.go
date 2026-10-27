package poster

import (
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func HeadlineMemory(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		db, ok := openCoverDB(cfg)
		if !ok {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "封面记忆数据库不可用"})
			return
		}
		defer db.Close()
		offset, err := strconv.Atoi(r.URL.Query().Get("offset"))
		if r.URL.Query().Get("offset") == "" {
			offset, err = 0, nil
		}
		if err != nil || offset < 0 {
			httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": "分页位置无效"})
			return
		}
		workspace := httpx.WorkspaceFrom(r)
		if err := recoverStaleCoverFeeds(r.Context(), db, workspace); err != nil {
			httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "核对样张状态失败"})
			return
		}
		entries, samples, usages, err := listCoverMemory(r.Context(), db, workspace, offset)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "读取封面记忆失败"})
			return
		}
		revisions, err := listCoverRevisions(r.Context(), db, workspace, offset)
		if err != nil {
			httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "读取经验版本失败"})
			return
		}
		var nextOffset any
		if len(entries) == 100 || len(samples) == 100 || len(usages) == 100 || len(revisions) == 100 {
			nextOffset = offset + 100
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "entries": entries, "samples": samples, "usages": usages, "revisions": revisions, "nextOffset": nextOffset})
	})
}

func HeadlineMemoryEntry(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Status string `json:"status"`
		}
		if err := decodeCoverBody(r, &body); err != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求数据格式异常"})
			return
		}
		if !validCoverStatus(body.Status) {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "记忆状态无效"})
			return
		}
		db, ok := openCoverDB(cfg)
		if !ok {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "封面记忆数据库不可用"})
			return
		}
		defer db.Close()
		workspace := httpx.WorkspaceFrom(r)
		err := mutateCoverExperience(r.Context(), db, workspace, "更新采纳规则", func(tx *sql.Tx) error {
			return setCoverEntryStatus(r.Context(), tx, workspace, r.PathValue("id"), body.Status)
		})
		if err == sql.ErrNoRows {
			httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "error": "找不到这条封面记忆"})
			return
		}
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "更新封面记忆失败"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true})
	})
}

func HeadlineMemoryCorrection(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Rule string `json:"rule"`
		}
		if err := decodeCoverBody(r, &body); err != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求数据格式异常"})
			return
		}
		rule := strings.TrimSpace(body.Rule)
		if len([]rune(rule)) < 2 || len([]rune(rule)) > 300 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "纠正需要 2 到 300 个字"})
			return
		}
		db, ok := openCoverDB(cfg)
		if !ok {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "封面记忆数据库不可用"})
			return
		}
		defer db.Close()
		entry := coverEntry{ID: coverID("entry"), Branch: "correction", Rule: rule, Status: "adopted", Source: "correction"}
		workspace := httpx.WorkspaceFrom(r)
		if err := mutateCoverExperience(r.Context(), db, workspace, "写入纠正", func(tx *sql.Tx) error {
			return insertCoverEntries(r.Context(), tx, workspace, []coverEntry{entry})
		}); err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "保存纠正失败"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "entry": entry})
	})
}

func HeadlineMemoryTrash(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		db, ok := openCoverDB(cfg)
		if !ok {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "封面记忆数据库不可用"})
			return
		}
		defer db.Close()
		if err := clearCoverTrash(r.Context(), db, httpx.WorkspaceFrom(r)); err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "清空回收站失败"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true})
	})
}

func openCoverDB(cfg config.Config) (*sql.DB, bool) {
	if strings.TrimSpace(cfg.SQLiteFile()) == "" {
		return nil, false
	}
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		return nil, false
	}
	return db, true
}

func decodeCoverBody(r *http.Request, dest any) error {
	raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		return err
	}
	return json.Unmarshal(raw, dest)
}

func coverDesignSheet(design map[string]any) map[string]string {
	out := map[string]string{}
	for _, key := range []string{"layout", "typeface", "textColor", "background", "subject", "harmony", "variation"} {
		out[key] = strings.TrimSpace(textOf(design[key]))
	}
	return out
}

func textOf(value any) string {
	text, _ := value.(string)
	return text
}
