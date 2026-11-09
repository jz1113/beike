package poster

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
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
	db, err := database.OpenRequired(cfg.SQLiteFile())
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

var coverWords = regexp.MustCompile(`[a-z0-9]{2,}`)

func coverTerms(text string) map[string]bool {
	terms := map[string]bool{}
	text = strings.ToLower(text)
	for _, word := range coverWords.FindAllString(text, -1) {
		terms[word] = true
	}
	runes := []rune(text)
	for i := 1; i < len(runes); i++ {
		if unicode.Is(unicode.Han, runes[i-1]) && unicode.Is(unicode.Han, runes[i]) {
			terms[string(runes[i-1:i+1])] = true
		}
	}
	return terms
}

// Keyword overlap is an explainable tie-breaker, not a claim of semantic model evaluation.
func relevantCoverSample(ctx context.Context, db coverMemoryReader, workspace, query, newest string, groups map[string][]adoptedTrait) (string, error) {
	titles := map[string]string{}
	rows, err := db.QueryContext(ctx, `SELECT "id","title" FROM "CoverMemorySample" WHERE "workspaceId"=?`, workspace)
	if err != nil {
		return "", err
	}
	for rows.Next() {
		var id, title string
		if err := rows.Scan(&id, &title); err != nil {
			rows.Close()
			return "", err
		}
		titles[id] = title
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return "", err
	}
	feedback, err := coverSampleFeedback(ctx, db, workspace)
	if err != nil {
		return "", err
	}
	terms := coverTerms(query)
	chosen, best := newest, -1<<30
	for id, traits := range groups {
		reference := titles[id]
		for _, trait := range traits {
			reference += " " + trait.rule
		}
		words := coverTerms(reference)
		score := 0
		for term := range terms {
			if words[term] {
				score += 4
			}
		}
		// A few ratings help selection without allowing repeated votes to swamp product relevance.
		score += max(-6, min(6, feedback[id]*2))
		if score > best || score == best && (chosen == "" || traits[0].createdAt > groups[chosen][0].createdAt || traits[0].createdAt == groups[chosen][0].createdAt && id > chosen) {
			chosen, best = id, score
		}
	}
	return chosen, nil
}

func coverSampleFeedback(ctx context.Context, db coverMemoryReader, workspace string) (map[string]int, error) {
	rows, err := db.QueryContext(ctx, `SELECT "rating","design" FROM "CoverMemoryUsage" WHERE "workspaceId"=? AND "rating"<>''`, workspace)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	scores := map[string]int{}
	for rows.Next() {
		var rating, raw string
		if err := rows.Scan(&rating, &raw); err != nil {
			return nil, err
		}
		design := decodeCoverSheet(raw)
		sample := design["memorySampleId"]
		if rating == "good" {
			scores[sample]++
		} else if rating == "bad" {
			scores[sample]--
		}
	}
	return scores, rows.Err()
}

type coverRevision struct {
	ID          string `json:"id"`
	Reason      string `json:"reason"`
	Fingerprint string `json:"fingerprint"`
	EntryCount  int    `json:"entryCount"`
	SampleCount int    `json:"sampleCount"`
	CreatedAt   string `json:"createdAt"`
	Markdown    string `json:"markdown,omitempty"`
}

// coverNow writes UTC RFC3339Nano, whose optional/trailing fractional digits do
// not sort chronologically as TEXT (e.g. .6039Z sorts after .603975Z).
// Pad only the sort key, retaining historical timestamps and nanosecond precision.
// Equal instants use insertion order rather than the numeric ID suffix as text.
const coverRevisionOrder = `substr("createdAt",1,19) DESC,
 CASE WHEN substr("createdAt",20,1)='.'
 THEN substr(rtrim(substr("createdAt",21),'Z') || '000000000',1,9)
 ELSE '000000000' END DESC, rowid DESC`

func adoptedSnapshot(ctx context.Context, tx *sql.Tx, workspace string) ([]coverEntry, error) {
	rows, err := tx.QueryContext(ctx, `SELECT "id","branch","rule","evidence","sampleId","source","createdAt" FROM "CoverMemoryEntry" WHERE "workspaceId"=? AND "status"='adopted' ORDER BY "id"`, workspace)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	entries := []coverEntry{}
	for rows.Next() {
		var e coverEntry
		e.Status = "adopted"
		if err := rows.Scan(&e.ID, &e.Branch, &e.Rule, &e.Evidence, &e.SampleID, &e.Source, &e.CreatedAt); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

func compileCoverExperience(entries []coverEntry) (string, int) {
	groups := map[string][]coverEntry{}
	for _, entry := range entries {
		key := coverSampleGroup(entry.SampleID)
		if entry.Source == "correction" || entry.Branch == "correction" {
			key = "corrections"
		}
		groups[key] = append(groups[key], entry)
	}
	var out strings.Builder
	out.WriteString("# 封面经验\n\n来自人工采纳的样张和纠正，自动整理，不代表模型训练或成图质量已验证。\n固定生成约束优先；纠正优先于样张。不同样张保留各自条件，不把冲突风格合成通用规则。\n\n")
	keys := []string{}
	for key := range groups {
		if key != "corrections" {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	ordered := append([]string{"corrections"}, keys...)
	for _, key := range ordered {
		if len(groups[key]) == 0 {
			continue
		}
		title := "样张 " + key + "（仅选中该样张时适用）"
		if key == "corrections" {
			title = "全局纠正"
		}
		out.WriteString("## " + title + "\n\n")
		seen := map[string]bool{}
		for _, entry := range groups[key] {
			rule := "[" + coverBranchLabel(entry.Branch) + "] " + entry.Rule
			if seen[rule] {
				continue
			}
			seen[rule] = true
			out.WriteString("- " + rule + "（来源 " + entry.ID + "）\n")
		}
		out.WriteString("\n")
	}
	return out.String(), len(keys)
}

func saveCoverRevision(ctx context.Context, tx *sql.Tx, workspace, reason string) error {
	entries, err := adoptedSnapshot(ctx, tx, workspace)
	if err != nil {
		return err
	}
	raw, err := json.Marshal(entries)
	if err != nil {
		return err
	}
	hash := fmt.Sprintf("%x", sha256.Sum256(raw))
	var previous string
	err = tx.QueryRowContext(ctx, `SELECT "fingerprint" FROM "CoverMemoryRevision" WHERE "workspaceId"=? ORDER BY `+coverRevisionOrder+` LIMIT 1`, workspace).Scan(&previous)
	if err != nil && err != sql.ErrNoRows {
		return err
	}
	if err == nil && previous == hash {
		return nil
	}
	markdown, samples := compileCoverExperience(entries)
	_, err = tx.ExecContext(ctx, `INSERT INTO "CoverMemoryRevision" ("id","workspaceId","reason","fingerprint","snapshot","markdown","entryCount","sampleCount","createdAt") VALUES (?,?,?,?,?,?,?,?,?)`, coverID("revision"), workspace, reason, hash, string(raw), markdown, len(entries), samples, coverNow())
	return err
}

// Rules and their revision always commit together. Failed revision writes undo the mutation.
func mutateCoverExperience(ctx context.Context, db *sql.DB, workspace, reason string, change func(*sql.Tx) error) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	// Preserve the pre-change rules as the first rollback target, including legacy adopted rules.
	if err := saveCoverRevision(ctx, tx, workspace, "原有经验"); err != nil {
		return err
	}
	if err := change(tx); err != nil {
		return err
	}
	if err := saveCoverRevision(ctx, tx, workspace, reason); err != nil {
		return err
	}
	return tx.Commit()
}

func listCoverRevisions(ctx context.Context, db *sql.DB, workspace string, offset int) ([]coverRevision, error) {
	rows, err := db.QueryContext(ctx, `SELECT "id","reason","fingerprint","entryCount","sampleCount","createdAt" FROM "CoverMemoryRevision" WHERE "workspaceId"=? ORDER BY `+coverRevisionOrder+` LIMIT 100 OFFSET ?`, workspace, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	revisions := []coverRevision{}
	for rows.Next() {
		var revision coverRevision
		if err := rows.Scan(&revision.ID, &revision.Reason, &revision.Fingerprint, &revision.EntryCount, &revision.SampleCount, &revision.CreatedAt); err != nil {
			return nil, err
		}
		revisions = append(revisions, revision)
	}
	return revisions, rows.Err()
}

func restoreCoverRevision(ctx context.Context, db *sql.DB, workspace, id string) error {
	return mutateCoverExperience(ctx, db, workspace, "回退经验", func(tx *sql.Tx) error {
		var raw string
		if err := tx.QueryRowContext(ctx, `SELECT "snapshot" FROM "CoverMemoryRevision" WHERE "id"=? AND "workspaceId"=?`, id, workspace).Scan(&raw); err != nil {
			return err
		}
		var entries []coverEntry
		if err := json.Unmarshal([]byte(raw), &entries); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE "CoverMemoryEntry" SET "status"='pending',"updatedAt"=? WHERE "workspaceId"=? AND "status"='adopted'`, coverNow(), workspace); err != nil {
			return err
		}
		for _, entry := range entries {
			result, err := tx.ExecContext(ctx, `UPDATE "CoverMemoryEntry" SET "status"='adopted',"rule"=?,"evidence"=?,"updatedAt"=? WHERE "id"=? AND "workspaceId"=?`, entry.Rule, entry.Evidence, coverNow(), entry.ID, workspace)
			if err != nil {
				return err
			}
			count, err := result.RowsAffected()
			if err != nil {
				return err
			}
			if count == 0 {
				if err := insertCoverEntries(ctx, tx, workspace, []coverEntry{entry}); err != nil {
					return err
				}
			}
		}
		return nil
	})
}

type coverMemoryReader interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

var ErrCoverSampleNotAdopted = errors.New("所选样张没有已采纳的特点")

type adoptedTrait struct {
	id, branch, rule, source, sampleID, createdAt string
}

func adoptedCoverSelection(ctx context.Context, db coverMemoryReader, workspace, requested string, hint ...string) ([]string, []string, string, error) {
	query := `SELECT "id","branch","rule","source","sampleId","createdAt" FROM "CoverMemoryEntry" WHERE "workspaceId"=? AND "status"='adopted'`
	args := []any{workspace}
	if requested == "corrections" {
		query += ` AND ("source"='correction' OR "branch"='correction')`
	} else if requested != "" && requested != "auto" && requested != "ungrouped" {
		query += ` AND ("source"='correction' OR "branch"='correction' OR "sampleId"=?)`
		args = append(args, requested)
	}
	rows, err := db.QueryContext(ctx, query+` ORDER BY "createdAt" DESC,"id" DESC`, args...)
	if err != nil {
		return nil, nil, "", err
	}
	defer rows.Close()
	corrections := []adoptedTrait{}
	groups := map[string][]adoptedTrait{}
	var newest string
	var seenNewest bool
	for rows.Next() {
		var entry adoptedTrait
		if err := rows.Scan(&entry.id, &entry.branch, &entry.rule, &entry.source, &entry.sampleID, &entry.createdAt); err != nil {
			return nil, nil, "", err
		}
		entry.rule = strings.TrimSpace(entry.rule)
		if entry.rule == "" {
			continue
		}
		if entry.source == "correction" || entry.branch == "correction" {
			corrections = append(corrections, entry)
			continue
		}
		key := coverSampleGroup(entry.sampleID)
		groups[key] = append(groups[key], entry)
		if !seenNewest {
			newest = key
			seenNewest = true
		}
	}
	if err := rows.Err(); err != nil {
		return nil, nil, "", err
	}
	if (strings.TrimSpace(requested) == "" || requested == "auto") && len(hint) > 0 && len(groups) > 0 {
		newest, err = relevantCoverSample(ctx, db, workspace, hint[0], newest, groups)
		if err != nil {
			return nil, nil, "", err
		}
	}
	chosen, err := chooseCoverSample(groups, newest, requested)
	if err != nil {
		return nil, nil, "", err
	}

	traits := []adoptedTrait{}
	if chosen != "" {
		traits = groups[chosen]
	}
	lines := make([]string, 0, len(corrections)+len(traits))
	ids := make([]string, 0, len(corrections)+len(traits))
	for _, entry := range append(corrections, traits...) {
		label := coverBranchLabel(entry.branch)
		if entry.source == "correction" || entry.branch == "correction" {
			label = "纠正"
		}
		lines = append(lines, "- ["+label+"] "+entry.rule)
		ids = append(ids, entry.id)
	}
	if chosen != "" && chosen != "ungrouped" {
		var raw string
		err := db.QueryRowContext(ctx, `SELECT "deconstruction" FROM "CoverMemorySample" WHERE "workspaceId"=? AND "id"=?`, workspace, chosen).Scan(&raw)
		if err != nil && err != sql.ErrNoRows {
			return nil, nil, "", err
		}
		if prompt, legacy := coverTemplatePrompt(raw); prompt != "" && !legacy {
			lines = append(lines, "完整模板（优先于该样张的旧拆解条目，但服从用户补充要求和全局纠正；将变量替换为当前商品和文案，最终不得留下占位符）：\n"+prompt)
		}
	}
	if len([]rune(strings.Join(lines, "\n"))) > 16000 {
		return nil, nil, "", errors.New("已采纳规则超过设计容量，请合并或停用重复规则后再生成")
	}
	if chosen == "" {
		return lines, ids, "corrections", nil
	}
	return lines, ids, chosen, nil
}

func chooseCoverSample(groups map[string][]adoptedTrait, newest, requested string) (string, error) {
	requested = strings.TrimSpace(requested)
	if requested == "" || requested == "auto" {
		return newest, nil
	}
	if requested == "corrections" {
		return "", nil
	}
	if _, ok := groups[requested]; !ok {
		return "", ErrCoverSampleNotAdopted
	}
	return requested, nil
}

func coverSampleGroup(sampleID string) string {
	if strings.TrimSpace(sampleID) == "" {
		return "ungrouped"
	}
	return sampleID
}

type coverDesignMemory struct {
	Lines      []string
	IDs        []string
	SampleID   string
	RevisionID string
	UsageID    string
}

func decodeCoverSheet(raw string) map[string]string {
	var sheet map[string]string
	_ = json.Unmarshal([]byte(raw), &sheet)
	if sheet == nil {
		return map[string]string{}
	}
	return sheet
}

func readDesignMemory(ctx context.Context, db *sql.DB, workspace, requested, hint, usageID, batchID, itemID string) (coverDesignMemory, error) {
	var memory coverDesignMemory
	tx, err := db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return memory, err
	}
	defer tx.Rollback()
	if usageID != "" {
		var raw, ids string
		err := tx.QueryRowContext(ctx, `SELECT "design","entryIds" FROM "CoverMemoryUsage" WHERE "workspaceId"=? AND "id"=? AND "batchId"=? AND "itemId"=?`, workspace, usageID, batchID, itemID).Scan(&raw, &ids)
		if err != nil {
			return memory, fmt.Errorf("原设计记忆快照不可用，请重新开始此条封面")
		}
		sheet := decodeCoverSheet(raw)
		if _, ok := sheet["memoryRules"]; !ok {
			return memory, fmt.Errorf("旧设计没有完整记忆快照，请重新开始此条封面")
		}
		memory.SampleID, memory.RevisionID = sheet["memorySampleId"], sheet["memoryRevisionId"]
		if sheet["memoryRules"] != "" {
			memory.Lines = strings.Split(sheet["memoryRules"], "\n")
		}
		if err := json.Unmarshal([]byte(ids), &memory.IDs); err != nil {
			return memory, err
		}
		return memory, nil
	}
	memory.Lines, memory.IDs, memory.SampleID, err = adoptedCoverSelection(ctx, tx, workspace, requested, hint)
	if err != nil {
		return memory, err
	}
	err = tx.QueryRowContext(ctx, `SELECT "id" FROM "CoverMemoryRevision" WHERE "workspaceId"=? ORDER BY `+coverRevisionOrder+` LIMIT 1`, workspace).Scan(&memory.RevisionID)
	if err != nil && err != sql.ErrNoRows {
		return memory, err
	}
	return memory, nil
}

func saveDesignMemory(ctx context.Context, db *sql.DB, workspace, batchID, itemID, title string, memory coverDesignMemory, design map[string]any) (string, error) {
	sheet := coverDesignSheet(design)
	sheet["memorySampleId"] = memory.SampleID
	sheet["memoryRevisionId"] = memory.RevisionID
	sheet["memoryRules"] = strings.Join(memory.Lines, "\n")
	if err := recordCoverUsage(ctx, db, workspace, batchID, itemID, title, memory.IDs, sheet); err != nil {
		return "", err
	}
	return coverUsageID(workspace, batchID, itemID, memory.IDs, sheet), nil
}
