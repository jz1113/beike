package poster

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
)

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
	err = tx.QueryRowContext(ctx, `SELECT "id" FROM "CoverMemoryRevision" WHERE "workspaceId"=? ORDER BY "createdAt" DESC,"id" DESC LIMIT 1`, workspace).Scan(&memory.RevisionID)
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
