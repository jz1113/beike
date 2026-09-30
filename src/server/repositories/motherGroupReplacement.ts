import { requireWorkspaceId } from '@server/infrastructure/workspace/workspaceContext';
import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { db } from './access';

export interface MotherReplacementRow {
  motherAssetId: string;
  reviewId: string;
  createdAt: string;
}

export class MotherReplacementReviewConflict extends Error {
  constructor() {
    super('候选审核状态已变化，换图未提交');
    this.name = 'MotherReplacementReviewConflict';
  }
}

export async function findMotherReplacement(motherAssetId: string): Promise<MotherReplacementRow | null> {
  const rows = await db.$queryRawUnsafe<MotherReplacementRow[]>(
    'SELECT "motherAssetId", "reviewId", "createdAt" FROM "FullPromptImageReplacement" WHERE "workspaceId" = ? AND "motherAssetId" = ? LIMIT 1',
    requireWorkspaceId(), motherAssetId,
  );
  return rows[0] || null;
}

export async function listMotherReplacementIds(motherAssetIds: string[]): Promise<Set<string>> {
  if (motherAssetIds.length === 0) return new Set();
  const ids = [...new Set(motherAssetIds)];
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.$queryRawUnsafe<Array<{ motherAssetId: string }>>(
    `SELECT "motherAssetId" FROM "FullPromptImageReplacement" WHERE "workspaceId" = ? AND "motherAssetId" IN (${placeholders})`,
    requireWorkspaceId(), ...ids,
  );
  return new Set(rows.map(row => row.motherAssetId));
}

export function deleteMotherReplacements(tx: Prisma.TransactionClient, motherAssetIds?: string[]) {
  const workspaceId = requireWorkspaceId();
  if (!motherAssetIds) {
    return tx.$executeRawUnsafe('DELETE FROM "FullPromptImageReplacement" WHERE "workspaceId" = ?', workspaceId);
  }
  if (motherAssetIds.length === 0) return Promise.resolve(0);
  const placeholders = motherAssetIds.map(() => '?').join(', ');
  return tx.$executeRawUnsafe(
    `DELETE FROM "FullPromptImageReplacement" WHERE "workspaceId" = ? AND "motherAssetId" IN (${placeholders})`,
    workspaceId, ...motherAssetIds,
  );
}

export async function findReplaceableMother(motherAssetId: string) {
  return db.fullPromptAsset.findFirst({
    where: { id: motherAssetId, workspaceId: requireWorkspaceId() },
  });
}

/** The unique motherAssetId makes an approved replacement a one-time transition. */
export async function commitMotherReplacement(input: {
  motherAssetId: string;
  reviewId: string;
  generatedImageUrls: string[];
  update: {
    sourceImages: string; coverUrl: string; sourceImageIndex: number;
    sourceImageIndices: string; reversePromptZh: string; shotPromptsJson: string;
    contentSummary: string; architectureSummary: string; sceneSummary: string;
    personaSummary: string; outfitSummary: string; actionSummary: string;
  };
}): Promise<boolean> {
  const workspaceId = requireWorkspaceId();
  return db.$transaction(async tx => {
    const mother = await tx.fullPromptAsset.findFirst({ where: { id: input.motherAssetId, workspaceId } });
    if (!mother) return false;
    const fingerprint = (value: string | null) => createHash('sha256').update(value || '').digest('hex');
    // Keep only verification fingerprints. Do not make a second copy of the
    // scraped image data in the replacement ledger or JSON backups.
    const original = {
      sourceImageIndex: mother.sourceImageIndex, sourceImageIndices: mother.sourceImageIndices,
      priorCoverHash: fingerprint(mother.coverUrl),
      priorSourceImagesHash: fingerprint(mother.sourceImages),
      priorPromptHash: fingerprint(mother.reversePromptZh),
    };
    const inserted = await tx.$executeRawUnsafe(
      'INSERT OR IGNORE INTO "FullPromptImageReplacement" ("motherAssetId", "workspaceId", "reviewId", "sourceSnapshotJson", "generatedImagesJson", "createdAt") VALUES (?, ?, ?, ?, ?, ?)',
      input.motherAssetId, workspaceId, input.reviewId, JSON.stringify(original),
      JSON.stringify(input.generatedImageUrls), new Date().toISOString(),
    );
    if (inserted !== 1) return false;
    const updated = await tx.fullPromptAsset.updateMany({
      where: { id: input.motherAssetId, workspaceId }, data: input.update,
    });
    if (updated.count !== 1) throw new Error('母组已变化，换图未提交');
    const reviewed = await tx.$executeRawUnsafe(
      'UPDATE "DeconstructReview" SET "status" = ? WHERE "workspaceId" = ? AND "id" = ? AND "status" = ?',
      'approved', workspaceId, input.reviewId, 'pending',
    );
    if (reviewed !== 1) throw new MotherReplacementReviewConflict();
    return true;
  });
}
