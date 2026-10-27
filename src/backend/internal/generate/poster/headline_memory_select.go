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
	rows, err := db.QueryContext(ctx, `SELECT "id","branch","rule","source","sampleId","createdAt" FROM "CoverMemoryEntry"
		WHERE "workspaceId"=? AND "status"='adopted' ORDER BY "createdAt" DESC, "id" DESC`, workspace)
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
