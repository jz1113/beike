import { db } from '../../../repositories/access';
import { readJsonBody, safeErrorMessage } from '../../../core/validate';
import { resolveShortUrlRedirect } from '@beike/server-kit/apiaScraper';
import { mapWithConcurrency } from '@beike/domain/asyncPool';
import { xhsSourceKey } from '@beike/domain/xhsSource';
import { jsonResponse } from '../../../core/http';
import { AppError } from '../../../core/errors';

export type SourceRecord = { sourceKey: string; requestId: string; state: string; albumName: string; albumId: string | null; updatedAt: string };
export const SOURCE_LEASE_MS = 5 * 60 * 1000;

/** Release only unfinished work; a committed review or saved album is never discarded. */
export async function releaseIncompleteSource(key: string, requestId: string, staleBefore?: string) {
  await db.$transaction(async tx => {
    const rows = await tx.$queryRaw<SourceRecord[]>`SELECT * FROM "PromptImportSource" WHERE "sourceKey" = ${key} AND "requestId" = ${requestId}`;
    const row = rows[0];
    if (!row || row.state !== 'processing' || (staleBefore && row.updatedAt > staleBefore)) return;
    const reviews = await tx.$queryRaw<{ status: string }[]>`SELECT "status" FROM "DeconstructReview" WHERE "id" = ${requestId}`;
    if (reviews[0]) {
      await tx.$executeRaw`UPDATE "PromptImportSource" SET "state" = ${reviews[0].status} WHERE "sourceKey" = ${key} AND "requestId" = ${requestId}`;
    } else if (row.albumId && await tx.fullPromptAsset.count({ where: { albumId: row.albumId } })) {
      await tx.$executeRaw`UPDATE "PromptImportSource" SET "state" = 'approved' WHERE "sourceKey" = ${key} AND "requestId" = ${requestId}`;
    } else {
      await tx.$executeRaw`DELETE FROM "PromptImportSource" WHERE "sourceKey" = ${key} AND "requestId" = ${requestId} AND "state" = 'processing'`;
    }
  });
}

export async function claimProcessingSource(key: string, requestId: string, albumName = '') {
  const existing = await findImportSource(key);
  if (existing && ['processing', 'pending', 'approved'].includes(existing.state)) {
    throw new AppError('该笔记正在分析或已入库，请勿重复提交', 409);
  }
  try {
    await db.$executeRaw`INSERT INTO "PromptImportSource" ("sourceKey", "requestId", "state", "albumName", "updatedAt") VALUES (${key}, ${requestId}, 'processing', ${albumName}, ${new Date().toISOString()})`;
  } catch {
    throw new AppError('该笔记正在分析或已入库，请勿重复提交', 409);
  }
}
export async function findImportSource(key: string): Promise<SourceRecord | undefined> {
  const rows = await db.$queryRaw<SourceRecord[]>`SELECT * FROM "PromptImportSource" WHERE "sourceKey" = ${key}`;
  const record = rows[0];
  if (record?.state === 'approved' && record.albumId && !(await db.fullPromptAsset.count({ where: { albumId: record.albumId } }))) {
    // The user deleted the saved assets; a future import may legitimately recreate them.
    await db.$executeRaw`DELETE FROM "PromptImportSource" WHERE "sourceKey" = ${key} AND "requestId" = ${record.requestId} AND "state" = 'approved'`;
    return undefined;
  }
  if (record && record.state !== 'approved') {
    const reviews = await db.$queryRaw<{ status: string }[]>`SELECT "status" FROM "DeconstructReview" WHERE "id" = ${record.requestId}`;
    if (reviews[0]) return { ...record, state: reviews[0].status };
  }
  if (record?.state === 'processing' && Date.parse(record.updatedAt) <= Date.now() - SOURCE_LEASE_MS) {
    await releaseIncompleteSource(key, record.requestId, new Date(Date.now() - SOURCE_LEASE_MS).toISOString());
    const refreshed = await db.$queryRaw<SourceRecord[]>`SELECT * FROM "PromptImportSource" WHERE "sourceKey" = ${key}`;
    return refreshed[0];
  }
  return record;
}
export async function POST(req: Request) {
  const body = await readJsonBody(req, null) as { urls?: unknown } | null;
  if (!Array.isArray(body?.urls) || body.urls.length > 200 || body.urls.some((url: unknown) => typeof url !== 'string' || url.length > 8000)) return jsonResponse({ error: '每次最多查重 200 条链接' }, 400);
  const results: Array<{ url: string; resolvedUrl?: string; sourceKey?: string; state: string; albumName?: string; albumId?: string | null; reason?: string }> = [];
  await mapWithConcurrency(body.urls as string[], 4, async url => {
    let resolvedUrl = url;
    try {
      if (!xhsSourceKey(url)) {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol) || (parsed.hostname !== 'xhslink.com' && !parsed.hostname.endsWith('.xhslink.com'))) throw new Error('只支持小红书笔记链接');
        resolvedUrl = await resolveShortUrlRedirect(url);
      }
      const key = xhsSourceKey(resolvedUrl);
      if (!key) throw new Error('短链接未能识别笔记，请复制笔记的完整链接后重试');
      const existing = await findImportSource(key);
      results.push({ url, resolvedUrl, sourceKey: key, state: existing?.state || 'new', albumName: existing?.albumName, albumId: existing?.albumId });
    } catch (error) { results.push({ url, state: 'error', reason: safeErrorMessage(error, '查重失败') }); }
  });
  return jsonResponse({ success: true, data: results });
}

/** Historical data did not retain note IDs. Offer exact-image candidate groups for manual review only. */
export async function GET() {
  const rows = await db.$queryRaw<{ albumIds: string }[]>`SELECT GROUP_CONCAT(DISTINCT "albumId") AS "albumIds" FROM "FullPromptAsset" WHERE "albumId" IS NOT NULL AND "sourceImages" IS NOT NULL AND LENGTH("sourceImages") > 2 GROUP BY "sourceImages" HAVING COUNT(DISTINCT "albumId") > 1 LIMIT 50`;
  const groups = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const ids = row.albumIds.split(',').sort();
    const key = ids.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    const albums = await db.promptAlbum.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    if (albums.length > 1) groups.push(albums);
  }
  return jsonResponse({ success: true, data: groups });
}
