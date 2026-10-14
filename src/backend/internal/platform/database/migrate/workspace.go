package migrate

import "context"

var workspaceTables = []string{
	"Product", "ImageTask", "PromptRecord", "StyleRecipe", "AssistantThread", "AssistantTurn", "AssistantTurnItem",
	"SceneAsset", "OutfitAsset", "ActionAsset", "PersonaAsset", "FullPromptAsset", "AssetProductCategory", "PromptAlbum",
	"WorkshopWorkspace", "WorkshopBatch", "WorkshopBatchState", "DeconstructReview", "PromptAssetRegistry",
	"PromptAssetCategoryLink", "PromptAssetUsageEvent", "WorkshopOutputReview", "WorkshopPipelineRun",
}

var dropWorkspaceIndexes = []string{
	"Product_platform_itemId_key", "ImageTask_taskId_key", "PromptAlbum_sourceKey_key",
	"PromptAssetRegistry_assetType_sourceAssetId_key", "PromptAssetCategoryLink_assetId_categoryId_scope_key",
}

var createWorkspaceIndexes = []string{
	`CREATE INDEX IF NOT EXISTS "Product_workspaceId_idx" ON "Product"("workspaceId")`,
	`CREATE UNIQUE INDEX IF NOT EXISTS "Product_workspaceId_platform_itemId_key" ON "Product"("workspaceId", "platform", "itemId")`,
	`CREATE INDEX IF NOT EXISTS "ImageTask_workspaceId_idx" ON "ImageTask"("workspaceId")`,
	`CREATE UNIQUE INDEX IF NOT EXISTS "ImageTask_workspaceId_taskId_key" ON "ImageTask"("workspaceId", "taskId")`,
	`CREATE INDEX IF NOT EXISTS "PromptRecord_workspaceId_idx" ON "PromptRecord"("workspaceId")`,
	`CREATE INDEX IF NOT EXISTS "StyleRecipe_workspaceId_idx" ON "StyleRecipe"("workspaceId")`,
	`CREATE INDEX IF NOT EXISTS "AssistantThread_workspaceId_idx" ON "AssistantThread"("workspaceId")`,
	`CREATE INDEX IF NOT EXISTS "AssistantTurn_workspaceId_idx" ON "AssistantTurn"("workspaceId")`,
	`CREATE INDEX IF NOT EXISTS "AssistantTurnItem_workspaceId_idx" ON "AssistantTurnItem"("workspaceId")`,
	`CREATE INDEX IF NOT EXISTS "SceneAsset_workspaceId_idx" ON "SceneAsset"("workspaceId")`,
	`CREATE INDEX IF NOT EXISTS "OutfitAsset_workspaceId_idx" ON "OutfitAsset"("workspaceId")`,
	`CREATE INDEX IF NOT EXISTS "ActionAsset_workspaceId_idx" ON "ActionAsset"("workspaceId")`,
	`CREATE INDEX IF NOT EXISTS "PersonaAsset_workspaceId_idx" ON "PersonaAsset"("workspaceId")`,
	`CREATE INDEX IF NOT EXISTS "FullPromptAsset_workspaceId_idx" ON "FullPromptAsset"("workspaceId")`,
	`CREATE INDEX IF NOT EXISTS "AssetProductCategory_workspaceId_idx" ON "AssetProductCategory"("workspaceId")`,
	`CREATE INDEX IF NOT EXISTS "PromptAlbum_workspaceId_idx" ON "PromptAlbum"("workspaceId")`,
	`CREATE UNIQUE INDEX IF NOT EXISTS "PromptAlbum_workspaceId_sourceKey_key" ON "PromptAlbum"("workspaceId", "sourceKey")`,
	`CREATE INDEX IF NOT EXISTS "WorkshopWorkspace_workspaceId_idx" ON "WorkshopWorkspace"("workspaceId")`,
	`CREATE INDEX IF NOT EXISTS "WorkshopBatch_workspaceId_idx" ON "WorkshopBatch"("workspaceId")`,
	`CREATE UNIQUE INDEX IF NOT EXISTS "WorkshopBatchState_workspaceId_key" ON "WorkshopBatchState"("workspaceId")`,
	`CREATE INDEX IF NOT EXISTS "DeconstructReview_workspaceId_idx" ON "DeconstructReview"("workspaceId")`,
	`CREATE INDEX IF NOT EXISTS "PromptAssetRegistry_workspaceId_idx" ON "PromptAssetRegistry"("workspaceId")`,
	`CREATE UNIQUE INDEX IF NOT EXISTS "PromptAssetRegistry_workspaceId_assetType_sourceAssetId_key" ON "PromptAssetRegistry"("workspaceId", "assetType", "sourceAssetId")`,
	`CREATE UNIQUE INDEX IF NOT EXISTS "PromptAssetCategoryLink_workspaceId_assetId_categoryId_scope_key" ON "PromptAssetCategoryLink"("workspaceId", "assetId", "categoryId", "scope")`,
	`CREATE INDEX IF NOT EXISTS "PromptAssetUsageEvent_workspaceId_idx" ON "PromptAssetUsageEvent"("workspaceId")`,
	`CREATE INDEX IF NOT EXISTS "WorkshopOutputReview_workspaceId_idx" ON "WorkshopOutputReview"("workspaceId")`,
	`CREATE INDEX IF NOT EXISTS "WorkshopPipelineRun_workspaceId_idx" ON "WorkshopPipelineRun"("workspaceId")`,
}

const (
	localWorkspace    = "local"
	legacyWorkspace   = "legacy"
	officialWorkspace = "official"
)

func applyWorkspaceIsolation(ctx context.Context, db execer) error {
	for _, table := range workspaceTables {
		exists, err := tableExists(ctx, db, table)
		if err != nil {
			return err
		}
		if !exists {
			continue
		}
		present, err := hasColumn(ctx, db, table, "workspaceId")
		if err != nil {
			return err
		}
		if present {
			continue
		}
		if err := exec(ctx, db, `ALTER TABLE `+ident(table)+` ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'legacy'`); err != nil {
			return err
		}
	}
	if err := rebuildPromptImportSource(ctx, db); err != nil {
		return err
	}
	for _, index := range dropWorkspaceIndexes {
		if err := exec(ctx, db, `DROP INDEX IF EXISTS `+ident(index)); err != nil {
			return err
		}
	}
	for _, statement := range createWorkspaceIndexes {
		if err := exec(ctx, db, statement); err != nil {
			return err
		}
	}
	return nil
}

func rebuildPromptImportSource(ctx context.Context, db execer) error {
	exists, err := tableExists(ctx, db, "PromptImportSource")
	if err != nil || !exists {
		return err
	}
	present, err := hasColumn(ctx, db, "PromptImportSource", "workspaceId")
	if err != nil {
		return err
	}
	if present {
		rows, err := db.QueryContext(ctx, `PRAGMA table_info("PromptImportSource")`)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var cid, notNull, pk int
			var name string
			var typ, dflt sqlNull
			if err := rows.Scan(&cid, &name, &typ, &notNull, &dflt, &pk); err != nil {
				return err
			}
			if name == "workspaceId" && pk > 0 {
				return nil
			}
		}
		if err := rows.Err(); err != nil {
			return err
		}
	}
	if err := exec(ctx, db, `CREATE TABLE "PromptImportSource_new" (
		"workspaceId" TEXT NOT NULL DEFAULT 'legacy',
		"sourceKey" TEXT NOT NULL,
		"requestId" TEXT NOT NULL,
		"state" TEXT NOT NULL,
		"albumName" TEXT NOT NULL DEFAULT '',
		"albumId" TEXT,
		"updatedAt" TEXT NOT NULL,
		PRIMARY KEY ("workspaceId", "sourceKey")
	)`); err != nil {
		return err
	}
	if present {
		err = exec(ctx, db, `INSERT OR IGNORE INTO "PromptImportSource_new" ("workspaceId", "sourceKey", "requestId", "state", "albumName", "albumId", "updatedAt")
			SELECT "workspaceId", "sourceKey", "requestId", "state", "albumName", "albumId", "updatedAt" FROM "PromptImportSource"`)
	} else {
		err = exec(ctx, db, `INSERT OR IGNORE INTO "PromptImportSource_new" ("workspaceId", "sourceKey", "requestId", "state", "albumName", "albumId", "updatedAt")
			SELECT 'legacy', "sourceKey", "requestId", "state", "albumName", "albumId", "updatedAt" FROM "PromptImportSource"`)
	}
	if err != nil {
		return err
	}
	if err := exec(ctx, db, `DROP TABLE "PromptImportSource"`); err != nil {
		return err
	}
	return exec(ctx, db, `ALTER TABLE "PromptImportSource_new" RENAME TO "PromptImportSource"`)
}

func AdoptLegacyWorkspaceRows(ctx context.Context, db execer) error {
	for _, table := range workspaceTables {
		exists, err := tableExists(ctx, db, table)
		if err != nil {
			return err
		}
		if !exists {
			continue
		}
		present, err := hasColumn(ctx, db, table, "workspaceId")
		if err != nil || !present {
			continue
		}
		if err := exec(ctx, db, `UPDATE `+ident(table)+` SET "workspaceId" = ? WHERE "workspaceId" = ?`, localWorkspace, legacyWorkspace); err != nil {
			return err
		}
	}
	exists, err := tableExists(ctx, db, "PromptImportSource")
	if err != nil {
		return err
	}
	if exists {
		present, err := hasColumn(ctx, db, "PromptImportSource", "workspaceId")
		if err != nil {
			return err
		}
		if present {
			if err := exec(ctx, db, `UPDATE "PromptImportSource" SET "workspaceId" = ? WHERE "workspaceId" = ?`, localWorkspace, legacyWorkspace); err != nil {
				return err
			}
		}
	}
	numbers, err := tableExists(ctx, db, "FullPromptLibraryNumber")
	if err != nil || !numbers {
		return err
	}
	return adoptLegacyFullPromptNumbers(ctx, db)
}
