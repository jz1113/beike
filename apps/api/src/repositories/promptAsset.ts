import { randomUUID } from 'node:crypto';
import { db } from './access';
import type { PromptAssetStatus, PromptAssetType, UsageEventType } from '@beike/domain/promptAsset';

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

function nowIso() {
  return new Date().toISOString();
}

export async function getRegistry(assetType: string, sourceAssetId: string): Promise<RegistryRow | null> {
  const rows = await db.$queryRawUnsafe<RegistryRow[]>(
    'SELECT * FROM "PromptAssetRegistry" WHERE "assetType" = ? AND "sourceAssetId" = ? LIMIT 1',
    assetType,
    sourceAssetId,
  ).catch(() => []);
  return rows[0] || null;
}

export async function listRegistryByType(assetType: string, sourceAssetIds?: string[]): Promise<RegistryRow[]> {
  if (sourceAssetIds && sourceAssetIds.length > 0) {
    const placeholders = sourceAssetIds.map(() => '?').join(', ');
    return db.$queryRawUnsafe<RegistryRow[]>(
      `SELECT * FROM "PromptAssetRegistry" WHERE "assetType" = ? AND "sourceAssetId" IN (${placeholders})`,
      assetType,
      ...sourceAssetIds,
    ).catch(() => []);
  }
  return db.$queryRawUnsafe<RegistryRow[]>(
    'SELECT * FROM "PromptAssetRegistry" WHERE "assetType" = ?',
    assetType,
  ).catch(() => []);
}

export async function listPublishedSourceIds(assetType: string): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<Array<{ sourceAssetId: string }>>(
    'SELECT "sourceAssetId" FROM "PromptAssetRegistry" WHERE "assetType" = ? AND "status" = ?',
    assetType,
    'published',
  ).catch(() => []);
  return rows.map((row) => row.sourceAssetId);
}

export async function upsertRegistry(input: {
  assetType: string;
  sourceAssetId: string;
  status: PromptAssetStatus;
  provenance?: string;
  sourceRef?: string | null;
  version?: number;
}): Promise<RegistryRow> {
  const existing = await getRegistry(input.assetType, input.sourceAssetId);
  const updatedAt = nowIso();
  if (existing) {
    await db.$executeRawUnsafe(
      'UPDATE "PromptAssetRegistry" SET "status" = ?, "provenance" = ?, "sourceRef" = ?, "version" = ?, "publishedAt" = ?, "disabledReason" = ?, "updatedAt" = ? WHERE "id" = ?',
      input.status,
      input.provenance ?? existing.provenance,
      input.sourceRef ?? existing.sourceRef,
      input.version ?? existing.version,
      input.status === 'published' ? (existing.publishedAt || updatedAt) : existing.publishedAt,
      input.status === 'disabled' ? existing.disabledReason : null,
      updatedAt,
      existing.id,
    );
    return (await getRegistry(input.assetType, input.sourceAssetId))!;
  }
  const id = `reg_${randomUUID().replace(/-/g, '')}`;
  await db.$executeRawUnsafe(
    'INSERT INTO "PromptAssetRegistry" ("id", "assetType", "sourceAssetId", "status", "version", "provenance", "sourceRef", "qualityScore", "confidence", "publishedAt", "disabledReason", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id,
    input.assetType,
    input.sourceAssetId,
    input.status,
    input.version ?? 1,
    input.provenance || 'manual',
    input.sourceRef || null,
    null,
    null,
    input.status === 'published' ? updatedAt : null,
    null,
    updatedAt,
    updatedAt,
  );
  return (await getRegistry(input.assetType, input.sourceAssetId))!;
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
    'UPDATE "PromptAssetRegistry" SET "status" = ?, "version" = COALESCE(?, "version"), "disabledReason" = ?, "qualityScore" = COALESCE(?, "qualityScore"), "confidence" = COALESCE(?, "confidence"), "publishedAt" = CASE WHEN ? = \'published\' THEN COALESCE("publishedAt", ?) ELSE "publishedAt" END, "updatedAt" = ? WHERE "id" = ?',
    patch.status,
    patch.version ?? null,
    patch.disabledReason ?? null,
    patch.qualityScore ?? null,
    patch.confidence ?? null,
    patch.status,
    updatedAt,
    updatedAt,
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
    'INSERT INTO "PromptAssetUsageEvent" ("id", "assetId", "batchId", "productId", "taskId", "eventType", "createdAt", "metadata") VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    `uev_${randomUUID().replace(/-/g, '')}`,
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
    'SELECT * FROM "PromptAssetUsageEvent" WHERE "assetId" = ? ORDER BY "createdAt" DESC LIMIT 500',
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
    'INSERT INTO "WorkshopOutputReview" ("id", "batchId", "productId", "taskId", "decision", "productFidelityScore", "compositionScore", "aestheticScore", "consistencyScore", "reasonCodesJson", "note", "createdAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    `wor_${randomUUID().replace(/-/g, '')}`,
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
    `SELECT "assetId", "categoryId", "scope" FROM "PromptAssetCategoryLink" WHERE "assetId" IN (${placeholders})`,
    ...assetIds,
  ).catch(() => []);
}

export async function replaceCategoryLinks(assetId: string, categoryIds: string[], scope = 'suitable') {
  await db.$executeRawUnsafe('DELETE FROM "PromptAssetCategoryLink" WHERE "assetId" = ? AND "scope" = ?', assetId, scope).catch(() => 0);
  for (const categoryId of categoryIds) {
    await db.$executeRawUnsafe(
      'INSERT INTO "PromptAssetCategoryLink" ("id", "assetId", "categoryId", "scope") VALUES (?, ?, ?, ?)',
      `clk_${randomUUID().replace(/-/g, '')}`,
      assetId,
      categoryId,
      scope,
    ).catch(() => 0);
  }
}
