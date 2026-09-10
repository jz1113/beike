import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

/** Legacy canvas references are client-side: absence from SQL is not proof of non-use. */
export async function queueMediaReview(urls: string[], source: { assetType: string; ids: string[] }) {
  const dir = path.join(process.env.AZHUO_DATA_DIR || path.resolve('.local'), 'media-review');
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  for (const url of new Set(urls)) {
    if (typeof url !== 'string' || url.startsWith('data:') || url.startsWith('blob:')) continue;
    const key = createHash('sha256').update(url).digest('hex');
    await fs.writeFile(path.join(dir, `${key}.json`), JSON.stringify({ url, source, state: 'retained-reference-check-required', queuedAt: new Date().toISOString() }), { mode: 0o600 });
  }
}
