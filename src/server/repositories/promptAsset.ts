import { OFFICIAL_WORKSPACE_ID, requireWorkspaceId } from '@server/infrastructure/workspace/workspaceContext';
import { randomUUID } from 'node:crypto';
import { db } from './access';
import type { PromptAssetStatus, PromptAssetType, UsageEventType } from '@shared/domain/prompts/promptAsset';

export interface RegistryRow {
  id: string;
  assetType: PromptAssetType;
  sourceAssetId: string;
  status: PromptAssetStatus;
  version: number;
  provenance: string;
  sourceRef: string | null;
  qualityScore: number | null;
  confidence: number | null;
  publishedAt: string | null;
  disabledReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FullPromptSourceMotherRow {
  registryId: string;
  id: string;
  title: string | null;
  groupIndex: number | null;
  albumName: string | null;
  available: number;
}

export interface UsageEventRow {
  id: string;
  assetId: string;
  batchId: string;
  productId: string | null;
  taskId: string | null;
  eventType: UsageEventType;
  createdAt: string;
  metadata: string;
}

const assetTables = {
  scene: 'SceneAsset', outfit: 'OutfitAsset', action: 'ActionAsset',
  persona: 'PersonaAsset', full_prompt: 'FullPromptAsset',
} as const;

export function listAssetsForRegistryBackfill(assetType: PromptAssetType) {
  return db.$queryRawUnsafe<Array<{ id: string; provenance: string | null }>>(
    `SELECT "id", "provenance" FROM "${assetTables[assetType]}" WHERE "workspaceId" IN (?, ?)`,
    requireWorkspaceId(), OFFICIAL_WORKSPACE_ID,
  ).catch(() => []);
}

export function listCoverageAssets(assetType: 'scene' | 'outfit' | 'action' | 'persona') {
  return db.$queryRawUnsafe<Array<{ id: string; tags: string | null; shotType: string | null; productCategoryIds: string | null }>>(
    `SELECT "id", "tags", ${assetType === 'action' ? '"shotType"' : 'NULL as "shotType"'}, "productCategoryIds" FROM "${assetTables[assetType]}" WHERE "workspaceId" IN (?, ?)`,
    requireWorkspaceId(), OFFICIAL_WORKSPACE_ID,
  ).catch(() => []);
}

function nowIso() {
  return new Date().toISOString();
}

export async function getRegistry(assetType: string, sourceAssetId: string): Promise<RegistryRow | null> {
  const rows = await db.$queryRawUnsafe<RegistryRow[]>(
    'SELECT * FROM "PromptAssetRegistry" WHERE "workspaceId" = ? AND "assetType" = ? AND "sourceAssetId" = ? LIMIT 1',
    requireWorkspaceId(),
    assetType,
    sourceAssetId,
  ).catch(() => []);
  return rows[0] || null;
}

export async function listRegistryByType(assetType: string, sourceAssetIds?: string[]): Promise<RegistryRow[]> {
  if (sourceAssetIds && sourceAssetIds.length > 0) {
    const placeholders = sourceAssetIds.map(() => '?').join(', ');
    return db.$queryRawUnsafe<RegistryRow[]>(
      `SELECT * FROM "PromptAssetRegistry" WHERE "workspaceId" = ? AND "assetType" = ? AND "sourceAssetId" IN (${placeholders})`,
      requireWorkspaceId(),
      assetType,
      ...sourceAssetIds,
    ).catch(() => []);
  }
  return db.$queryRawUnsafe<RegistryRow[]>(
    'SELECT * FROM "PromptAssetRegistry" WHERE "workspaceId" = ? AND "assetType" = ?',
    requireWorkspaceId(),
    assetType,
  ).catch(() => []);
}

export async function listFullPromptSourceMothers(registryIds: string[]): Promise<FullPromptSourceMotherRow[]> {
  if (registryIds.length === 0) return [];
  const placeholders = registryIds.map(() => '?').join(', ');
  return db.$queryRawUnsafe<FullPromptSourceMotherRow[]>(
    `SELECT registry."id" AS "registryId", registry."sourceAssetId" AS "id",
      parent."title" AS "title", parent."groupIndex" AS "groupIndex",
      parent."albumName" AS "albumName",
      CASE WHEN parent."id" IS NULL THEN 0 ELSE 1 END AS "available"
     FROM "PromptAssetRegistry" AS registry
     LEFT JOIN "FullPromptAsset" AS parent
       ON parent."id" = registry."sourceAssetId" AND parent."workspaceId" IN (?, ?)
     WHERE registry."workspaceId" = ? AND registry."assetType" = 'full_prompt'
       AND registry."id" IN (${placeholders})`,
    requireWorkspaceId(), OFFICIAL_WORKSPACE_ID, requireWorkspaceId(), ...registryIds,
  );
}

export async function listPublishedSourceIds(assetType: string): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<Array<{ sourceAssetId: string }>>(
    'SELECT "sourceAssetId" FROM "PromptAssetRegistry" WHERE "workspaceId" = ? AND "assetType" = ? AND "status" = ?',
    requireWorkspaceId(),
    assetType,
    'published',
  ).catch(() => []);
  return rows.map((row) => row.sourceAssetId);
}

type RegistryWrite = {
  assetType: string;
  sourceAssetId: string;
  status: PromptAssetStatus;
  provenance?: string;
  sourceRef?: string | null;
  version?: number;
};

async function insertRegistryIfMissing(input: RegistryWrite): Promise<boolean> {
  const id = `reg_${randomUUID().replace(/-/g, '')}`;
  const createdAt = nowIso();
  const inserted = await db.$executeRawUnsafe(
    'INSERT INTO "PromptAssetRegistry" ("id", "workspaceId", "assetType", "sourceAssetId", "status", "version", "provenance", "sourceRef", "qualityScore", "confidence", "publishedAt", "disabledReason", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT ("workspaceId", "assetType", "sourceAssetId") DO NOTHING',
    id,
    requireWorkspaceId(),
    input.assetType,
    input.sourceAssetId,
    input.status,
    input.version ?? 1,
    input.provenance || 'manual',
    input.sourceRef || null,
    null,
    null,
    input.status === 'published' ? createdAt : null,
    null,
    createdAt,
    createdAt,
  );
  return inserted > 0;
}

async function requireRegistry(input: RegistryWrite): Promise<RegistryRow> {
  const row = await getRegistry(input.assetType, input.sourceAssetId);
  if (!row) throw new Error(`Prompt asset registry entry missing: ${input.assetType}/${input.sourceAssetId}`);
  return row;
}

export async function ensureRegistryExists(input: RegistryWrite): Promise<RegistryRow> {
  const existing = await getRegistry(input.assetType, input.sourceAssetId);
  if (existing) return existing;
  await insertRegistryIfMissing(input);
  return requireRegistry(input);
}

export async function upsertRegistry(input: RegistryWrite): Promise<RegistryRow> {
  if (await insertRegistryIfMissing(input)) return requireRegistry(input);
  const updatedAt = nowIso();
  await db.$executeRawUnsafe(
    'UPDATE "PromptAssetRegistry" SET "status" = ?, "provenance" = COALESCE(?, "provenance"), "sourceRef" = COALESCE(?, "sourceRef"), "version" = COALESCE(?, "version"), "publishedAt" = CASE WHEN ? = \'published\' THEN COALESCE("publishedAt", ?) ELSE "publishedAt" END, "disabledReason" = CASE WHEN ? = \'disabled\' THEN "disabledReason" ELSE NULL END, "updatedAt" = ? WHERE "workspaceId" = ? AND "assetType" = ? AND "sourceAssetId" = ?',
    input.status,
    input.provenance ?? null,
    input.sourceRef ?? null,
    input.version ?? null,
    input.status,
    updatedAt,
    input.status,
    updatedAt,
    requireWorkspaceId(),
    input.assetType,
    input.sourceAssetId,
  );
  return requireRegistry(input);
}

export async function updateRegistryStatus(id: string, patch: {
  status: PromptAssetStatus;
  version?: number;
  disabledReason?: string | null;
  qualityScore?: number | null;
  confidence?: number | null;
}): Promise<void> {
  const updatedAt = nowIso();
  await db.$executeRawUnsafe(
    'UPDATE "PromptAssetRegistry" SET "status" = ?, "version" = COALESCE(?, "version"), "disabledReason" = ?, "qualityScore" = COALESCE(?, "qualityScore"), "confidence" = COALESCE(?, "confidence"), "publishedAt" = CASE WHEN ? = \'published\' THEN COALESCE("publishedAt", ?) ELSE "publishedAt" END, "updatedAt" = ? WHERE "workspaceId" = ? AND "id" = ?',
    patch.status,
    patch.version ?? null,
    patch.disabledReason ?? null,
    patch.qualityScore ?? null,
    patch.confidence ?? null,
    patch.status,
    updatedAt,
    updatedAt,
    requireWorkspaceId(),
    id,
  );
}

export async function insertUsageEvent(input: {
  assetId: string;
  batchId: string;
  productId?: string | null;
  taskId?: string | null;
  eventType: UsageEventType;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.$executeRawUnsafe(
    'INSERT INTO "PromptAssetUsageEvent" ("id", "workspaceId", "assetId", "batchId", "productId", "taskId", "eventType", "createdAt", "metadata") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    `uev_${randomUUID().replace(/-/g, '')}`,
    requireWorkspaceId(),
    input.assetId,
    input.batchId,
    input.productId || null,
    input.taskId || null,
    input.eventType,
    nowIso(),
    JSON.stringify(input.metadata || {}),
  ).catch(() => 0);
}

export async function listUsageEvents(assetId: string): Promise<UsageEventRow[]> {
  return db.$queryRawUnsafe<UsageEventRow[]>(
    'SELECT * FROM "PromptAssetUsageEvent" WHERE "workspaceId" = ? AND "assetId" = ? ORDER BY "createdAt" DESC LIMIT 500',
    requireWorkspaceId(),
    assetId,
  ).catch(() => []);
}

export async function insertOutputReview(input: {
  batchId: string;
  productId: string;
  taskId: string;
  decision: string;
  productFidelityScore?: number | null;
  compositionScore?: number | null;
  aestheticScore?: number | null;
  consistencyScore?: number | null;
  reasonCodes?: string[];
  note?: string | null;
}): Promise<void> {
  await db.$executeRawUnsafe(
    'INSERT INTO "WorkshopOutputReview" ("id", "workspaceId", "batchId", "productId", "taskId", "decision", "productFidelityScore", "compositionScore", "aestheticScore", "consistencyScore", "reasonCodesJson", "note", "createdAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    `wor_${randomUUID().replace(/-/g, '')}`,
    requireWorkspaceId(),
    input.batchId,
    input.productId,
    input.taskId,
    input.decision,
    input.productFidelityScore ?? null,
    input.compositionScore ?? null,
    input.aestheticScore ?? null,
    input.consistencyScore ?? null,
    JSON.stringify(input.reasonCodes || []),
    input.note || null,
    nowIso(),
  );
}

export async function listCategoryLinks(assetIds: string[]) {
  if (assetIds.length === 0) return [];
  const placeholders = assetIds.map(() => '?').join(', ');
  return db.$queryRawUnsafe<Array<{ assetId: string; categoryId: string; scope: string }>>(
    `SELECT "assetId", "categoryId", "scope" FROM "PromptAssetCategoryLink" WHERE "workspaceId" = ? AND "assetId" IN (${placeholders})`,
    requireWorkspaceId(),
    ...assetIds,
  ).catch(() => []);
}

export async function replaceCategoryLinks(assetId: string, categoryIds: string[], scope = 'suitable') {
  await db.$executeRawUnsafe('DELETE FROM "PromptAssetCategoryLink" WHERE "workspaceId" = ? AND "assetId" = ? AND "scope" = ?', requireWorkspaceId(), assetId, scope).catch(() => 0);
  for (const categoryId of categoryIds) {
    await db.$executeRawUnsafe(
      'INSERT INTO "PromptAssetCategoryLink" ("id", "workspaceId", "assetId", "categoryId", "scope") VALUES (?, ?, ?, ?, ?)',
      `clk_${randomUUID().replace(/-/g, '')}`,
      requireWorkspaceId(),
      assetId,
      categoryId,
      scope,
    ).catch(() => 0);
  }
}
