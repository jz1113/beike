import { randomUUID } from 'node:crypto';
import { db } from './access';
import { requireWorkspaceId } from '@server/infrastructure/workspace/workspaceContext';
import type { PromptGroupCandidate } from '@shared/domain/workshop/workshopPipeline';

type GroupScene = PromptGroupCandidate & { sceneSummary?: string | null };
type RecentGroup = { assetId: string; albumName: string | null; sceneSummary: string | null; shotPromptsJson: string | null };

function sceneText(group: Pick<GroupScene, 'sceneSummary' | 'shotPromptsJson'>): string {
  if (group.sceneSummary?.trim()) return group.sceneSummary;
  try {
    const shots = JSON.parse(group.shotPromptsJson || '[]') as Array<{ scene?: unknown }>;
    return shots.map(shot => typeof shot.scene === 'string' ? shot.scene : '').find(Boolean) || '';
  } catch { return ''; }
}

function sceneSignature(scene: string): Set<string> {
  const normalized = scene.replace(/真实|自然|画面|场景|背景|商品|手机|光线|氛围/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '').slice(0, 100);
  const pairs = new Set<string>();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    pairs.add(normalized.slice(index, index + 2));
  }
  return pairs;
}

function similarScene(left: Set<string>, right: Set<string>): boolean {
  if (left.size < 4 || right.size < 4) return false;
  const common = [...left].filter(pair => right.has(pair)).length;
  return common / Math.min(left.size, right.size) >= 0.65 && common / (left.size + right.size - common) >= 0.4;
}

function recentSimilarity(candidate: GroupScene, recent: RecentGroup, candidateScene: Set<string>, recentScene: Set<string>): number {
  if (candidate.id === recent.assetId) return 3;
  if (candidate.albumName?.trim() && candidate.albumName === recent.albumName) return 3;
  return similarScene(candidateScene, recentScene) ? 1 : 0;
}

export async function reservePromptGroupRecord<T extends PromptGroupCandidate>(
  candidates: T[], eventType: string, batchId?: string, productId?: string, analysisRunId?: string,
): Promise<T> {
  const workspaceId = requireWorkspaceId();
  const metadata = analysisRunId ? JSON.stringify({ analysisRunId }) : '{}';
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(async tx => {
        if (batchId && batchId !== 'draft' && productId) {
          const previous = analysisRunId
            ? await tx.$queryRaw<Array<{ assetId: string }>>`
                SELECT "assetId" FROM "PromptAssetUsageEvent"
                WHERE "workspaceId" = ${workspaceId} AND "eventType" = ${eventType}
                  AND "batchId" = ${batchId} AND "productId" = ${productId}
                  AND "metadata" = ${metadata}
                ORDER BY "createdAt" DESC LIMIT 1`
            : await tx.$queryRaw<Array<{ assetId: string }>>`
                SELECT "assetId" FROM "PromptAssetUsageEvent"
                WHERE "workspaceId" = ${workspaceId} AND "eventType" = ${eventType}
                  AND "batchId" = ${batchId} AND "productId" = ${productId}
                ORDER BY "createdAt" DESC LIMIT 1`;
          const reserved = candidates.find(candidate => candidate.id === previous[0]?.assetId);
          if (reserved) return reserved;
        }
        const history = await tx.$queryRaw<Array<{ assetId: string; usageCount: bigint | number; lastUsed: string }>>`
          SELECT "assetId", COUNT(*) AS "usageCount", MAX("createdAt") AS "lastUsed" FROM "PromptAssetUsageEvent"
          WHERE "workspaceId" = ${workspaceId} AND "eventType" = ${eventType} GROUP BY "assetId"`;
        // A candidate stays out for the next N-1 eligible reservations, even
        // when older usage counts are uneven or the eligible pool has changed.
        const recentCandidateIds = candidates.length > 1
          ? await tx.promptAssetUsageEvent.findMany({
              where: { workspaceId, eventType, assetId: { in: candidates.map(candidate => candidate.id) } },
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take: candidates.length - 1,
              select: { assetId: true },
            })
          : [];
        const recentlyUsed = new Set(recentCandidateIds.map(entry => entry.assetId));
        const available = candidates.filter(candidate => !recentlyUsed.has(candidate.id));
        const recent = await tx.$queryRaw<RecentGroup[]>`
          SELECT usage."assetId", groupAsset."albumName", groupAsset."sceneSummary", groupAsset."shotPromptsJson"
          FROM "PromptAssetUsageEvent" AS usage
          LEFT JOIN "FullPromptAsset" AS groupAsset
            ON groupAsset."id" = usage."assetId" AND groupAsset."workspaceId" = usage."workspaceId"
          WHERE usage."workspaceId" = ${workspaceId} AND usage."eventType" = ${eventType}
          ORDER BY usage."createdAt" DESC, usage."id" DESC LIMIT 3`;
        const usage = new Map(history.map(entry => [entry.assetId, {
          count: Number(entry.usageCount), lastUsed: new Date(entry.lastUsed).getTime() || 0,
        }]));
        const minimumCount = Math.min(...available.map(candidate => usage.get(candidate.id)?.count || 0));
        const recentScenes = recent.map(group => sceneSignature(sceneText(group)));
        const ranked = available.map((candidate, index) => {
          const scene = sceneSignature(sceneText(candidate));
          const penalty = recent.reduce((sum, group, recentIndex) =>
            sum + recentSimilarity(candidate, group, scene, recentScenes[recentIndex]) * (3 - recentIndex), 0);
          return { candidate, index, count: usage.get(candidate.id)?.count || 0,
            lastUsed: usage.get(candidate.id)?.lastUsed || 0, penalty };
        });
        const chosen = ranked.filter(entry => entry.count === minimumCount)
          .sort((a, b) => a.penalty - b.penalty || a.lastUsed - b.lastUsed || a.index - b.index)[0].candidate;
        const timestamp = new Date(Math.max(Date.now(), ...history.map(entry => new Date(entry.lastUsed).getTime() + 1 || 0))).toISOString();
        await tx.$executeRaw`INSERT INTO "PromptAssetUsageEvent" ("id", "workspaceId", "assetId", "batchId", "productId", "eventType", "createdAt", "metadata")
          VALUES (${randomUUID()}, ${workspaceId}, ${chosen.id}, ${batchId || 'group-rotation'}, ${productId || null}, ${eventType}, ${timestamp}, ${metadata})`;
        return chosen;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt >= 4 || !/P2034|SQLITE_BUSY|database is locked|write conflict/i.test(message + String((error as { code?: string }).code))) throw error;
      await new Promise(resolve => setTimeout(resolve, 30 * (attempt + 1)));
    }
  }
}
