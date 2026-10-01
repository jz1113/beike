import type { Prisma } from '@prisma/client';
import { isFixedLocalWorkspace, LEGACY_WORKSPACE_ID, LOCAL_WORKSPACE_ID } from '../workspace/workspaceContext';
import { adoptLegacyFullPromptNumbers } from './workspaceFullPromptNumbers';

type Database = Pick<Prisma.TransactionClient, '$executeRawUnsafe' | '$queryRawUnsafe'>;

export const WORKSPACE_TABLES = [
  'Product',
  'ImageTask',
  'PromptRecord',
  'StyleRecipe',
  'AssistantThread',
  'AssistantTurn',
  'AssistantTurnItem',
  'SceneAsset',
  'OutfitAsset',
  'ActionAsset',
  'PersonaAsset',
  'FullPromptAsset',
  'AssetProductCategory',
  'PromptAlbum',
  'WorkshopWorkspace',
  'WorkshopBatch',
  'WorkshopBatchState',
  'DeconstructReview',
  'PromptAssetRegistry',
  'PromptAssetCategoryLink',
  'PromptAssetUsageEvent',
  'WorkshopOutputReview',
  'WorkshopPipelineRun',
] as const;

const DROP_INDEXES = [
  'Product_platform_itemId_key',
  'ImageTask_taskId_key',
  'PromptAlbum_sourceKey_key',
  'PromptAssetRegistry_assetType_sourceAssetId_key',
  'PromptAssetCategoryLink_assetId_categoryId_scope_key',
];

const CREATE_INDEXES = [
  'CREATE INDEX IF NOT EXISTS "Product_workspaceId_idx" ON "Product"("workspaceId")',
  'CREATE UNIQUE INDEX IF NOT EXISTS "Product_workspaceId_platform_itemId_key" ON "Product"("workspaceId", "platform", "itemId")',
  'CREATE INDEX IF NOT EXISTS "ImageTask_workspaceId_idx" ON "ImageTask"("workspaceId")',
  'CREATE UNIQUE INDEX IF NOT EXISTS "ImageTask_workspaceId_taskId_key" ON "ImageTask"("workspaceId", "taskId")',
  'CREATE INDEX IF NOT EXISTS "PromptRecord_workspaceId_idx" ON "PromptRecord"("workspaceId")',
  'CREATE INDEX IF NOT EXISTS "StyleRecipe_workspaceId_idx" ON "StyleRecipe"("workspaceId")',
  'CREATE INDEX IF NOT EXISTS "AssistantThread_workspaceId_idx" ON "AssistantThread"("workspaceId")',
  'CREATE INDEX IF NOT EXISTS "AssistantTurn_workspaceId_idx" ON "AssistantTurn"("workspaceId")',
  'CREATE INDEX IF NOT EXISTS "AssistantTurnItem_workspaceId_idx" ON "AssistantTurnItem"("workspaceId")',
  'CREATE INDEX IF NOT EXISTS "SceneAsset_workspaceId_idx" ON "SceneAsset"("workspaceId")',
  'CREATE INDEX IF NOT EXISTS "OutfitAsset_workspaceId_idx" ON "OutfitAsset"("workspaceId")',
  'CREATE INDEX IF NOT EXISTS "ActionAsset_workspaceId_idx" ON "ActionAsset"("workspaceId")',
  'CREATE INDEX IF NOT EXISTS "PersonaAsset_workspaceId_idx" ON "PersonaAsset"("workspaceId")',
  'CREATE INDEX IF NOT EXISTS "FullPromptAsset_workspaceId_idx" ON "FullPromptAsset"("workspaceId")',
  'CREATE INDEX IF NOT EXISTS "AssetProductCategory_workspaceId_idx" ON "AssetProductCategory"("workspaceId")',
  'CREATE INDEX IF NOT EXISTS "PromptAlbum_workspaceId_idx" ON "PromptAlbum"("workspaceId")',
  'CREATE UNIQUE INDEX IF NOT EXISTS "PromptAlbum_workspaceId_sourceKey_key" ON "PromptAlbum"("workspaceId", "sourceKey")',
  'CREATE INDEX IF NOT EXISTS "WorkshopWorkspace_workspaceId_idx" ON "WorkshopWorkspace"("workspaceId")',
  'CREATE INDEX IF NOT EXISTS "WorkshopBatch_workspaceId_idx" ON "WorkshopBatch"("workspaceId")',
  'CREATE UNIQUE INDEX IF NOT EXISTS "WorkshopBatchState_workspaceId_key" ON "WorkshopBatchState"("workspaceId")',
  'CREATE INDEX IF NOT EXISTS "DeconstructReview_workspaceId_idx" ON "DeconstructReview"("workspaceId")',
  'CREATE INDEX IF NOT EXISTS "PromptAssetRegistry_workspaceId_idx" ON "PromptAssetRegistry"("workspaceId")',
  'CREATE UNIQUE INDEX IF NOT EXISTS "PromptAssetRegistry_workspaceId_assetType_sourceAssetId_key" ON "PromptAssetRegistry"("workspaceId", "assetType", "sourceAssetId")',
  'CREATE UNIQUE INDEX IF NOT EXISTS "PromptAssetCategoryLink_workspaceId_assetId_categoryId_scope_key" ON "PromptAssetCategoryLink"("workspaceId", "assetId", "categoryId", "scope")',
  'CREATE INDEX IF NOT EXISTS "PromptAssetUsageEvent_workspaceId_idx" ON "PromptAssetUsageEvent"("workspaceId")',
  'CREATE INDEX IF NOT EXISTS "WorkshopOutputReview_workspaceId_idx" ON "WorkshopOutputReview"("workspaceId")',
  'CREATE INDEX IF NOT EXISTS "WorkshopPipelineRun_workspaceId_idx" ON "WorkshopPipelineRun"("workspaceId")',
];

export const workspaceIsolationSql = 'workspace-isolation-v1';

async function tableExists(db: Database, name: string): Promise<boolean> {
  const rows = await db.$queryRawUnsafe<Array<{ name: string }>>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    name,
  );
  return rows.length > 0;
}

async function hasColumn(db: Database, table: string, column: string): Promise<boolean> {
  const cols = await db.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("${table}")`);
  return cols.some((c) => c.name === column);
}

async function rebuildPromptImportSource(db: Database): Promise<void> {
  if (!(await tableExists(db, 'PromptImportSource'))) return;
  if (await hasColumn(db, 'PromptImportSource', 'workspaceId')) {
    const info = await db.$queryRawUnsafe<Array<{ pk: number; name: string }>>('PRAGMA table_info("PromptImportSource")');
    const workspacePk = info.some((c) => c.name === 'workspaceId' && c.pk > 0);
    if (workspacePk) return;
  }
  await db.$executeRawUnsafe(`CREATE TABLE "PromptImportSource_new" (
    "workspaceId" TEXT NOT NULL DEFAULT 'legacy',
    "sourceKey" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "albumName" TEXT NOT NULL DEFAULT '',
    "albumId" TEXT,
    "updatedAt" TEXT NOT NULL,
    PRIMARY KEY ("workspaceId", "sourceKey")
  )`);
  if (await hasColumn(db, 'PromptImportSource', 'workspaceId')) {
    await db.$executeRawUnsafe(`INSERT OR IGNORE INTO "PromptImportSource_new" ("workspaceId", "sourceKey", "requestId", "state", "albumName", "albumId", "updatedAt")
      SELECT "workspaceId", "sourceKey", "requestId", "state", "albumName", "albumId", "updatedAt" FROM "PromptImportSource"`);
  } else {
    await db.$executeRawUnsafe(`INSERT OR IGNORE INTO "PromptImportSource_new" ("workspaceId", "sourceKey", "requestId", "state", "albumName", "albumId", "updatedAt")
      SELECT 'legacy', "sourceKey", "requestId", "state", "albumName", "albumId", "updatedAt" FROM "PromptImportSource"`);
  }
  await db.$executeRawUnsafe('DROP TABLE "PromptImportSource"');
  await db.$executeRawUnsafe('ALTER TABLE "PromptImportSource_new" RENAME TO "PromptImportSource"');
}

export async function applyWorkspaceIsolation(db: Database): Promise<void> {
  for (const table of WORKSPACE_TABLES) {
    if (!(await tableExists(db, table))) continue;
    if (await hasColumn(db, table, 'workspaceId')) continue;
    await db.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'legacy'`);
  }
  await rebuildPromptImportSource(db);
  for (const index of DROP_INDEXES) {
    await db.$executeRawUnsafe(`DROP INDEX IF EXISTS "${index}"`);
  }
  for (const sql of CREATE_INDEXES) {
    await db.$executeRawUnsafe(sql);
  }
}

export async function adoptLegacyWorkspaceRows(db: Database): Promise<void> {
  if (!isFixedLocalWorkspace()) return;
  for (const table of WORKSPACE_TABLES) {
    if (!(await tableExists(db, table))) continue;
    if (!(await hasColumn(db, table, 'workspaceId'))) continue;
    await db.$executeRawUnsafe(
      `UPDATE "${table}" SET "workspaceId" = ? WHERE "workspaceId" = ?`,
      LOCAL_WORKSPACE_ID,
      LEGACY_WORKSPACE_ID,
    );
  }
  if (await tableExists(db, 'PromptImportSource') && await hasColumn(db, 'PromptImportSource', 'workspaceId')) {
    await db.$executeRawUnsafe(
      `UPDATE "PromptImportSource" SET "workspaceId" = ? WHERE "workspaceId" = ?`,
      LOCAL_WORKSPACE_ID,
      LEGACY_WORKSPACE_ID,
    );
  }
  if (await tableExists(db, 'FullPromptLibraryNumber')) await adoptLegacyFullPromptNumbers(db);
}
