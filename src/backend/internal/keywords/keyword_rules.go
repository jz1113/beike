package keywords

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func keywordRulesGetHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "读取审核规则失败"})
			return
		}
		defer db.Close()
		current, history, err := database.ListKeywordRules(r.Context(), db, httpx.WorkspaceFrom(r))
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "读取审核规则失败"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "current": current, "history": history})
	}
}

func keywordRulesPutHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if err != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求数据格式异常"})
			return
		}
		var raw map[string]any
		if err := json.Unmarshal(body, &raw); err != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求数据格式异常"})
			return
		}
		baseVersion, entries, note, message := parseRuleUpdate(raw)
		if message != "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": message})
			return
		}
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "保存审核规则失败"})
			return
		}
		defer db.Close()
		current, err := database.PublishKeywordRules(r.Context(), db, httpx.WorkspaceFrom(r), baseVersion, entries, note)
		if errors.Is(err, database.ErrRuleConflict) {
			httpx.WriteJSON(w, http.StatusConflict, map[string]any{"success": false, "error": err.Error()})
			return
		}
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "保存审核规则失败"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "current": current})
	}
}

func parseRuleUpdate(raw map[string]any) (int, []database.RuleEntry, string, string) {
	baseValue, ok := raw["baseVersion"].(float64)
	if !ok || baseValue < 0 || baseValue != float64(int(baseValue)) {
		return 0, nil, "", "baseVersion: 必须是非负整数"
	}
	note, _ := raw["note"].(string)
	note = strings.TrimSpace(note)
	if utf8.RuneCountInString(note) < 2 || utf8.RuneCountInString(note) > 200 {
		return 0, nil, "", "note: 说明需要 2 到 200 字"
	}
	list, ok := raw["entries"].([]any)
	if !ok || len(list) > 30 {
		return 0, nil, "", "entries: 补充规则不能超过 30 条"
	}
	entries := make([]database.RuleEntry, 0, len(list))
	total := 0
	for index, value := range list {
		row, ok := value.(map[string]any)
		if !ok {
			return 0, nil, "", "entries: 规则格式无效"
		}
		section, _ := row["section"].(string)
		if section != "垂类边界" && section != "不制作" && section != "其他说明" {
			return 0, nil, "", "entries." + strconv.Itoa(index) + ".section: 规则分类无效"
		}
		text, _ := row["text"].(string)
		text = strings.TrimSpace(text)
		length := utf8.RuneCountInString(text)
		if length < 4 || length > 300 {
			return 0, nil, "", "entries." + strconv.Itoa(index) + ".text: 规则需要 4 到 300 字"
		}
		mode, _ := row["mode"].(string)
		if mode != "" && mode != "image" && mode != "video" {
			return 0, nil, "", "entries." + strconv.Itoa(index) + ".mode: 规则模式无效"
		}
		total += length
		entries = append(entries, database.RuleEntry{Section: section, Text: text, Mode: mode})
	}
	if total > 6000 {
		return 0, nil, "", "补充规则总长度不能超过 6000 字"
	}
	return int(baseValue), entries, note, ""
}
