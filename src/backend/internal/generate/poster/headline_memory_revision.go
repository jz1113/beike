package poster

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

type coverRevision struct {
	ID          string `json:"id"`
	Reason      string `json:"reason"`
	Fingerprint string `json:"fingerprint"`
	EntryCount  int    `json:"entryCount"`
	SampleCount int    `json:"sampleCount"`
	CreatedAt   string `json:"createdAt"`
	Markdown    string `json:"markdown,omitempty"`
}

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
	err = tx.QueryRowContext(ctx, `SELECT "fingerprint" FROM "CoverMemoryRevision" WHERE "workspaceId"=? ORDER BY "createdAt" DESC,"id" DESC LIMIT 1`, workspace).Scan(&previous)
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
	rows, err := db.QueryContext(ctx, `SELECT "id","reason","fingerprint","entryCount","sampleCount","createdAt" FROM "CoverMemoryRevision" WHERE "workspaceId"=? ORDER BY "createdAt" DESC,"id" DESC LIMIT 100 OFFSET ?`, workspace, offset)
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
