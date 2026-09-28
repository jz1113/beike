import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { getWorkspaceId, requireWorkspaceId } from '@server/infrastructure/workspace/workspaceContext';

export const MEDIA_REVIEW_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type MediaReviewRecord = {
  url: string;
  source: { assetType: string; ids: string[] };
  state: string;
  queuedAt: string;
};

function reviewRoot(): string {
  return path.join(process.env.AZHUO_DATA_DIR || path.resolve('.local'), 'media-review');
}

function reviewDir(): string {
  return path.join(reviewRoot(), requireWorkspaceId());
}

/** Legacy canvas references are client-side: absence from SQL is not proof of non-use. */
export async function queueMediaReview(urls: string[], source: { assetType: string; ids: string[] }) {
  const dir = reviewDir();
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  for (const url of new Set(urls)) {
    if (typeof url !== 'string' || url.startsWith('data:') || url.startsWith('blob:')) continue;
    const key = createHash('sha256').update(url).digest('hex');
    const record: MediaReviewRecord = {
      url,
      source,
      state: 'retained-reference-check-required',
      queuedAt: new Date().toISOString(),
    };
    await fs.writeFile(path.join(dir, `${key}.json`), JSON.stringify(record), { mode: 0o600 });
  }
}

export async function listMediaReviews(): Promise<MediaReviewRecord[]> {
  const dir = reviewDir();
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  const items: MediaReviewRecord[] = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    try {
      const raw = JSON.parse(await fs.readFile(path.join(dir, name), 'utf8')) as MediaReviewRecord;
      if (raw?.url) items.push(raw);
    } catch {
      /* ignore unreadable review files */
    }
  }
  return items.sort((a, b) => String(a.queuedAt).localeCompare(String(b.queuedAt)));
}

async function reviewDirs(): Promise<string[]> {
  const current = getWorkspaceId();
  if (current) return [path.join(reviewRoot(), current)];
  const root = reviewRoot();
  const names = await fs.readdir(root).catch(() => [] as string[]);
  const dirs = [root];
  for (const name of names) dirs.push(path.join(root, name));
  return dirs;
}

export async function purgeExpiredMediaReviews(now = Date.now()): Promise<number> {
  let purged = 0;
  for (const dir of await reviewDirs()) {
    const names = await fs.readdir(dir).catch(() => [] as string[]);
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      const file = path.join(dir, name);
      try {
        const raw = JSON.parse(await fs.readFile(file, 'utf8')) as MediaReviewRecord;
        const queuedAt = Date.parse(raw.queuedAt);
        if (!Number.isFinite(queuedAt) || now - queuedAt >= MEDIA_REVIEW_TTL_MS) {
          await fs.unlink(file);
          purged += 1;
        }
      } catch {
        /* ignore unreadable review files */
      }
    }
  }
  return purged;
}
