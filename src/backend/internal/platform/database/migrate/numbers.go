package migrate

import (
	"context"
	"database/sql"
	"fmt"
)

const fullPromptGroupVisibilitySQL = `(
  "provenance" <> 'legacy_single' AND (
    "groupIndex" IS NOT NULL OR "provenance" <> 'deconstructed'
    OR ("sourceImageIndices" IS NOT NULL AND "sourceImageIndices" NOT IN ('', '[]', 'null'))
    OR ("shotPromptsJson" IS NOT NULL AND "shotPromptsJson" NOT IN ('', '[]', 'null'))
  )
)`

func applyFullPromptDisplayNumbers(ctx context.Context, db execer) error {
	present, err := hasColumn(ctx, db, "FullPromptAsset", "displayNumber")
	if err != nil {
		return err
	}
	if !present {
		if err := exec(ctx, db, `ALTER TABLE "FullPromptAsset" ADD COLUMN "displayNumber" INTEGER`); err != nil {
			return err
		}
	}
	if err := exec(ctx, db, `CREATE TABLE IF NOT EXISTS "FullPromptDisplaySequence" ("id" TEXT NOT NULL PRIMARY KEY, "lastNumber" INTEGER NOT NULL DEFAULT 0)`); err != nil {
		return err
	}
	if err := exec(ctx, db, `INSERT OR IGNORE INTO "FullPromptDisplaySequence" ("id", "lastNumber") VALUES (?, 0)`, "full_prompt"); err != nil {
		return err
	}
	var start int
	if err := db.QueryRowContext(ctx, `SELECT MAX(
		(SELECT "lastNumber" FROM "FullPromptDisplaySequence" WHERE "id" = 'full_prompt'),
		COALESCE((SELECT MAX("displayNumber") FROM "FullPromptAsset"), 0)
	)`).Scan(&start); err != nil {
		return err
	}
	if err := exec(ctx, db, `WITH numbered AS (
		SELECT "id", ROW_NUMBER() OVER (ORDER BY "isFavorite" DESC, "usageCount" DESC, "createdAt" DESC, "id" DESC) + ? AS "number"
		FROM "FullPromptAsset"
		WHERE "displayNumber" IS NULL AND ("groupIndex" IS NOT NULL OR "provenance" <> 'legacy_single')
	)
	UPDATE "FullPromptAsset"
	SET "displayNumber" = (SELECT "number" FROM numbered WHERE numbered."id" = "FullPromptAsset"."id")
	WHERE "id" IN (SELECT "id" FROM numbered)`, start); err != nil {
		return err
	}
	if err := exec(ctx, db, `UPDATE "FullPromptDisplaySequence"
		SET "lastNumber" = MAX("lastNumber", COALESCE((SELECT MAX("displayNumber") FROM "FullPromptAsset"), 0))
		WHERE "id" = 'full_prompt'`); err != nil {
		return err
	}
	return exec(ctx, db, `CREATE UNIQUE INDEX IF NOT EXISTS "FullPromptAsset_displayNumber_key" ON "FullPromptAsset"("displayNumber")`)
}

func nextFullPromptDisplayNumber(ctx context.Context, db execer) (int, error) {
	if err := exec(ctx, db, `INSERT INTO "FullPromptDisplaySequence" ("id", "lastNumber")
		VALUES ('full_prompt', 1)
		ON CONFLICT("id") DO UPDATE SET "lastNumber" = MAX("lastNumber", COALESCE((SELECT MAX("displayNumber") FROM "FullPromptAsset"), 0)) + 1`); err != nil {
		return 0, err
	}
	var number int
	if err := db.QueryRowContext(ctx, `SELECT "lastNumber" FROM "FullPromptDisplaySequence" WHERE "id" = ?`, "full_prompt").Scan(&number); err != nil {
		return 0, err
	}
	if number < 1 {
		return 0, fmt.Errorf("图组展示编号分配失败")
	}
	return number, nil
}

func ensureWorkspaceFullPromptNumbers(ctx context.Context, db execer, workspaceID string, backfill bool) error {
	sequenceID := "library:" + workspaceID
	if err := exec(ctx, db, `INSERT OR IGNORE INTO "FullPromptDisplaySequence" ("id", "lastNumber") VALUES (?, 0)`, sequenceID); err != nil {
		return err
	}
	var start int
	if err := db.QueryRowContext(ctx, `SELECT MAX(
		(SELECT "lastNumber" FROM "FullPromptDisplaySequence" WHERE "id" = ?),
		COALESCE((SELECT MAX("displayNumber") FROM "FullPromptLibraryNumber" WHERE "workspaceId" = ?), 0)
	)`, sequenceID, workspaceID).Scan(&start); err != nil {
		return err
	}
	order := `"createdAt" ASC, "id" ASC`
	if backfill {
		order = `"isFavorite" DESC, "usageCount" DESC, "createdAt" DESC, "id" DESC`
	}
	if err := exec(ctx, db, `INSERT INTO "FullPromptLibraryNumber" ("workspaceId", "assetId", "displayNumber", "legacyDisplayNumber")
		SELECT ?, "id", ROW_NUMBER() OVER (ORDER BY `+order+`) + ?, "displayNumber"
		FROM "FullPromptAsset"
		WHERE "workspaceId" IN (?, ?) AND `+fullPromptGroupVisibilitySQL+`
		  AND NOT EXISTS (SELECT 1 FROM "FullPromptLibraryNumber" AS n WHERE n."workspaceId" = ? AND n."assetId" = "FullPromptAsset"."id")`,
		workspaceID, start, workspaceID, officialWorkspace, workspaceID); err != nil {
		return err
	}
	return exec(ctx, db, `UPDATE "FullPromptDisplaySequence" SET "lastNumber" = MAX(
		"lastNumber", COALESCE((SELECT MAX("displayNumber") FROM "FullPromptLibraryNumber" WHERE "workspaceId" = ?), 0)
	) WHERE "id" = ?`, workspaceID, sequenceID)
}

type libraryNumber struct {
	assetID string
	number  int
	legacy  sql.NullInt64
}

func readWorkspaceNumbers(ctx context.Context, db execer, workspaceID string) ([]libraryNumber, error) {
	rows, err := db.QueryContext(ctx, `SELECT "assetId", "displayNumber", "legacyDisplayNumber" FROM "FullPromptLibraryNumber" WHERE "workspaceId" = ?`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var numbers []libraryNumber
	for rows.Next() {
		var item libraryNumber
		if err := rows.Scan(&item.assetID, &item.number, &item.legacy); err != nil {
			return nil, err
		}
		numbers = append(numbers, item)
	}
	return numbers, rows.Err()
}

func applyWorkspaceFullPromptNumbers(ctx context.Context, db execer) error {
	if err := exec(ctx, db, `CREATE TABLE IF NOT EXISTS "FullPromptLibraryNumber" (
		"workspaceId" TEXT NOT NULL,
		"assetId" TEXT NOT NULL,
		"displayNumber" INTEGER NOT NULL,
		"legacyDisplayNumber" INTEGER,
		PRIMARY KEY ("workspaceId", "assetId")
	)`); err != nil {
		return err
	}
	if err := exec(ctx, db, `CREATE UNIQUE INDEX IF NOT EXISTS "FullPromptLibraryNumber_workspaceId_displayNumber_key" ON "FullPromptLibraryNumber"("workspaceId", "displayNumber")`); err != nil {
		return err
	}
	rows, err := db.QueryContext(ctx, `SELECT DISTINCT "workspaceId" FROM "FullPromptAsset"
		UNION SELECT DISTINCT "workspaceId" FROM "WorkshopWorkspace"
		UNION SELECT DISTINCT "workspaceId" FROM "WorkshopBatch"
		UNION SELECT DISTINCT "workspaceId" FROM "AssistantTurn"`)
	if err != nil {
		return err
	}
	defer rows.Close()
	var workspaces []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return err
		}
		workspaces = append(workspaces, id)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for _, workspaceID := range workspaces {
		if err := ensureWorkspaceFullPromptNumbers(ctx, db, workspaceID, true); err != nil {
			return err
		}
		numbers, err := readWorkspaceNumbers(ctx, db, workspaceID)
		if err != nil {
			return err
		}
		changes := map[string]numberChange{}
		for _, number := range numbers {
			var old *int
			if number.legacy.Valid {
				value := int(number.legacy.Int64)
				old = &value
			}
			changes[number.assetID] = numberChange{old: old, new: number.number}
		}
		if err := migrateFullPromptNumberSnapshots(ctx, db, workspaceID, changes); err != nil {
			return err
		}
	}
	return nil
}

func adoptLegacyFullPromptNumbers(ctx context.Context, db execer) error {
	legacy, err := readWorkspaceNumbers(ctx, db, legacyWorkspace)
	if err != nil || len(legacy) == 0 {
		return err
	}
	if err := ensureWorkspaceFullPromptNumbers(ctx, db, localWorkspace, true); err != nil {
		return err
	}
	local, err := readWorkspaceNumbers(ctx, db, localWorkspace)
	if err != nil {
		return err
	}
	localNumbers := map[string]int{}
	for _, number := range local {
		localNumbers[number.assetID] = number.number
	}
	changes := map[string]numberChange{}
	for _, number := range legacy {
		next, ok := localNumbers[number.assetID]
		if !ok {
			continue
		}
		old := number.number
		changes[number.assetID] = numberChange{old: &old, new: next}
	}
	return migrateFullPromptNumberSnapshots(ctx, db, localWorkspace, changes)
}
