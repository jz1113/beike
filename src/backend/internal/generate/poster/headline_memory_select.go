package poster

import (
	"context"
	"database/sql"
	"errors"
	"strings"
)

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
