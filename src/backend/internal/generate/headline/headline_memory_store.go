package headline

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"sync/atomic"
	"time"
)

var coverSeq atomic.Int64

func coverID(prefix string) string {
	return fmt.Sprintf("%s_%d_%d", prefix, time.Now().UnixNano(), coverSeq.Add(1))
}

func coverNow() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}

type coverEntry struct {
	ID        string `json:"id"`
	Branch    string `json:"branch"`
	Rule      string `json:"rule"`
	Evidence  string `json:"evidence"`
	SampleID  string `json:"sampleId"`
	Status    string `json:"status"`
	Source    string `json:"source"`
	UseCount  int    `json:"useCount"`
	CreatedAt string `json:"createdAt"`
}

type coverSample struct {
	ID        string   `json:"id"`
	Title     string   `json:"title"`
	ImageURLs []string `json:"imageUrls"`
	Model     string   `json:"model"`
	Status    string   `json:"status"`
	Error     string   `json:"error"`
	CreatedAt string   `json:"createdAt"`
}

type coverUsage struct {
	ID        string            `json:"id"`
	BatchID   string            `json:"batchId"`
	ItemID    string            `json:"itemId"`
	ItemTitle string            `json:"itemTitle"`
	EntryIDs  []string          `json:"entryIds"`
	Design    map[string]string `json:"design"`
	CreatedAt string            `json:"createdAt"`
}

func insertCoverSample(ctx context.Context, db *sql.DB, workspace, id, title, model string, imageURLs []string) error {
	raw, _ := json.Marshal(imageURLs)
	now := coverNow()
	_, err := db.ExecContext(ctx, `INSERT INTO "CoverMemorySample"
		("id","workspaceId","title","imageUrls","model","deconstruction","status","error","createdAt","updatedAt")
		VALUES (?,?,?,?,?,'','running','',?,?)`, id, workspace, title, string(raw), model, now, now)
	return err
}

func finishCoverSample(ctx context.Context, db *sql.DB, workspace, id, status, deconstruction, errText string) error {
	_, err := db.ExecContext(ctx, `UPDATE "CoverMemorySample" SET "status"=?, "deconstruction"=?, "error"=?, "updatedAt"=?
		WHERE "id"=? AND "workspaceId"=?`, status, deconstruction, errText, coverNow(), id, workspace)
	return err
}

type coverExec interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func insertCoverEntries(ctx context.Context, db coverExec, workspace string, entries []coverEntry) error {
	for _, entry := range entries {
		if strings.TrimSpace(entry.Rule) == "" {
			continue
		}
		now := coverNow()
		if entry.ID == "" {
			entry.ID = coverID("entry")
		}
		if entry.Status == "" {
			entry.Status = "pending"
		}
		if entry.Source == "" {
			entry.Source = "sample"
		}
		_, err := db.ExecContext(ctx, `INSERT INTO "CoverMemoryEntry"
			("id","workspaceId","branch","rule","evidence","sampleId","status","source","useCount","createdAt","updatedAt")
			VALUES (?,?,?,?,?,?,?,?,0,?,?)`,
			entry.ID, workspace, entry.Branch, entry.Rule, entry.Evidence, entry.SampleID, entry.Status, entry.Source, now, now)
		if err != nil {
			return err
		}
	}
	return nil
}

func listCoverMemory(ctx context.Context, db *sql.DB, workspace string) ([]coverEntry, []coverSample, []coverUsage, error) {
	entries, err := listCoverEntries(ctx, db, workspace)
	if err != nil {
		return nil, nil, nil, err
	}
	samples, err := listCoverSamples(ctx, db, workspace)
	if err != nil {
		return nil, nil, nil, err
	}
	usages, err := listCoverUsages(ctx, db, workspace)
	return entries, samples, usages, err
}

func listCoverEntries(ctx context.Context, db *sql.DB, workspace string) ([]coverEntry, error) {
	rows, err := db.QueryContext(ctx, `SELECT "id","branch","rule","evidence","sampleId","status","source","useCount","createdAt"
		FROM "CoverMemoryEntry" WHERE "workspaceId"=? ORDER BY "createdAt" DESC LIMIT 200`, workspace)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []coverEntry{}
	for rows.Next() {
		var entry coverEntry
		if err := rows.Scan(&entry.ID, &entry.Branch, &entry.Rule, &entry.Evidence, &entry.SampleID, &entry.Status, &entry.Source, &entry.UseCount, &entry.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, entry)
	}
	return out, rows.Err()
}

func listCoverSamples(ctx context.Context, db *sql.DB, workspace string) ([]coverSample, error) {
	rows, err := db.QueryContext(ctx, `SELECT "id","title","imageUrls","model","status","error","createdAt"
		FROM "CoverMemorySample" WHERE "workspaceId"=? ORDER BY "createdAt" DESC LIMIT 30`, workspace)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []coverSample{}
	for rows.Next() {
		var sample coverSample
		var raw string
		if err := rows.Scan(&sample.ID, &sample.Title, &raw, &sample.Model, &sample.Status, &sample.Error, &sample.CreatedAt); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(raw), &sample.ImageURLs)
		if sample.ImageURLs == nil {
			sample.ImageURLs = []string{}
		}
		out = append(out, sample)
	}
	return out, rows.Err()
}

func listCoverUsages(ctx context.Context, db *sql.DB, workspace string) ([]coverUsage, error) {
	rows, err := db.QueryContext(ctx, `SELECT "id","batchId","itemId","itemTitle","entryIds","design","createdAt"
		FROM "CoverMemoryUsage" WHERE "workspaceId"=? ORDER BY "createdAt" DESC LIMIT 50`, workspace)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []coverUsage{}
	for rows.Next() {
		var usage coverUsage
		var ids, design string
		if err := rows.Scan(&usage.ID, &usage.BatchID, &usage.ItemID, &usage.ItemTitle, &ids, &design, &usage.CreatedAt); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(ids), &usage.EntryIDs)
		_ = json.Unmarshal([]byte(design), &usage.Design)
		if usage.EntryIDs == nil {
			usage.EntryIDs = []string{}
		}
		if usage.Design == nil {
			usage.Design = map[string]string{}
		}
		out = append(out, usage)
	}
	return out, rows.Err()
}

func setCoverEntryStatus(ctx context.Context, db *sql.DB, workspace, id, status string) error {
	result, err := db.ExecContext(ctx, `UPDATE "CoverMemoryEntry" SET "status"=?, "updatedAt"=? WHERE "id"=? AND "workspaceId"=?`,
		status, coverNow(), id, workspace)
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
	return nil
}

func clearCoverTrash(ctx context.Context, db *sql.DB, workspace string) error {
	_, err := db.ExecContext(ctx, `DELETE FROM "CoverMemoryEntry" WHERE "workspaceId"=? AND "status"='trashed'`, workspace)
	return err
}

func saveCoverDeconstruction(ctx context.Context, db *sql.DB, workspace, id, deconstruction string, entries []coverEntry) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, `UPDATE "CoverMemorySample" SET "status"=?, "deconstruction"=?, "error"='', "updatedAt"=?
		WHERE "id"=? AND "workspaceId"=? AND "status"='running'`, "completed", deconstruction, coverNow(), id, workspace)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count != 1 {
		return fmt.Errorf("样张状态已变化")
	}
	if err := insertCoverEntries(ctx, tx, workspace, entries); err != nil {
		return err
	}
	return tx.Commit()
}

func recordCoverUsage(ctx context.Context, db *sql.DB, workspace, batchID, itemID, title string, entryIDs []string, design map[string]string) error {
	if entryIDs == nil {
		entryIDs = []string{}
	}
	ids, _ := json.Marshal(entryIDs)
	raw, _ := json.Marshal(design)
	_, err := db.ExecContext(ctx, `INSERT INTO "CoverMemoryUsage"
		("id","workspaceId","batchId","itemId","itemTitle","entryIds","design","createdAt")
		VALUES (?,?,?,?,?,?,?,?)`, coverID("usage"), workspace, batchID, itemID, title, string(ids), string(raw), coverNow())
	if err != nil {
		return err
	}
	for _, id := range entryIDs {
		if _, err := db.ExecContext(ctx, `UPDATE "CoverMemoryEntry" SET "useCount"="useCount"+1, "updatedAt"=? WHERE "id"=? AND "workspaceId"=?`, coverNow(), id, workspace); err != nil {
			return err
		}
	}
	return nil
}

func coverBranchLabel(branch string) string {
	switch branch {
	case "layout":
		return "构图"
	case "typography":
		return "字体"
	case "color":
		return "字色"
	case "background":
		return "背景"
	case "subject":
		return "主体"
	case "correction":
		return "纠正"
	default:
		return "记忆"
	}
}

func entriesFromDeconstruction(sampleID string, parsed map[string]any) []coverEntry {
	fields := []struct{ key, branch string }{
		{"layout", "layout"},
		{"typeface", "typography"},
		{"textColor", "color"},
		{"background", "background"},
		{"subject", "subject"},
		{"harmony", "color"},
	}
	out := []coverEntry{}
	for _, field := range fields {
		rule, evidence := coverRuleOf(parsed[field.key])
		if rule == "" {
			continue
		}
		out = append(out, coverEntry{
			ID: coverID("entry"), Branch: field.branch, Rule: rule, Evidence: evidence, SampleID: sampleID, Status: "pending", Source: "sample",
		})
	}
	return out
}

func coverRuleOf(value any) (string, string) {
	switch item := value.(type) {
	case string:
		return strings.TrimSpace(item), ""
	case map[string]any:
		method := strings.TrimSpace(textOf(item["method"]))
		observation := strings.TrimSpace(textOf(item["observation"]))
		uncertainty := strings.TrimSpace(textOf(item["uncertainty"]))
		rule := strings.TrimSpace(textOf(item["rule"]))
		evidence := strings.TrimSpace(textOf(item["evidence"]))
		if method != "" || observation != "" {
			chosen := method
			if chosen == "" {
				chosen = observation
			}
			parts := []string{}
			if observation != "" {
				parts = append(parts, observation)
			}
			if uncertainty != "" {
				parts = append(parts, "不确定："+uncertainty)
			}
			if evidence != "" {
				parts = append(parts, evidence)
			}
			return chosen, strings.Join(parts, "；")
		}
		return rule, evidence
	default:
		return "", ""
	}
}

func validCoverBranch(branch string) bool {
	switch branch {
	case "layout", "typography", "color", "background", "subject", "correction":
		return true
	default:
		return false
	}
}

func validCoverStatus(status string) bool {
	return status == "pending" || status == "adopted" || status == "trashed"
}
