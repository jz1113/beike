package poster

import (
	"context"
	"database/sql"
	"errors"
	"strings"
)

var ErrCoverSampleNotAdopted = errors.New("所选样张没有已采纳的特点")

type adoptedTrait struct {
	id, branch, rule, source, sampleID, createdAt string
}

func adoptedCoverSelection(ctx context.Context, db *sql.DB, workspace, requested string) ([]string, []string, string, error) {
	rows, err := db.QueryContext(ctx, `SELECT "id","branch","rule","source","sampleId","createdAt" FROM "CoverMemoryEntry"
		WHERE "workspaceId"=? AND "status"='adopted' ORDER BY "createdAt" DESC LIMIT 200`, workspace)
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
	chosen, err := chooseCoverSample(groups, newest, requested)
	if err != nil {
		return nil, nil, "", err
	}
	if len(corrections) > 8 {
		corrections = corrections[:8]
	}
	traits := []adoptedTrait{}
	if chosen != "" {
		traits = groups[chosen]
		if len(traits) > 16 {
			traits = traits[:16]
		}
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
