import fs from 'node:fs';
import path from 'node:path';

/** Only managed regular files below the real storage root can be removed. */
export function resolveDeletableStoragePath(root: string, url: string): string | null {
  if (!url.startsWith('/storage/azhuo/')) return null;
  let relative: string;
  try { relative = decodeURIComponent(url.slice('/storage/'.length)); } catch { return null; }
  if (relative.includes('\\') || relative.includes('\0') || relative.includes('%')) return null;
  if (relative.split('/').some(segment => !segment || segment === '.' || segment === '..')) return null;
  try {
    const realRoot = fs.realpathSync(root);
    const target = path.resolve(realRoot, relative);
    const within = path.relative(realRoot, target);
    if (!within || within.startsWith('..') || path.isAbsolute(within)) return null;
    // Reject symlinks anywhere in the relative path, including the leaf.
    let current = realRoot;
    for (const segment of relative.split('/')) {
      current = path.join(current, segment);
      if (fs.lstatSync(current).isSymbolicLink()) return null;
    }
    return fs.lstatSync(target).isFile() ? target : null;
  } catch { return null; }
}
