import type { PosterItem } from './posterTypes';

/**
 * Keeps every valid parsed record when a user imports one or more batches.
 * Generation concurrency is configured separately and must not discard rows.
 */
export function mergePosterItems(existing: PosterItem[], imported: PosterItem[]): PosterItem[] {
  return [...existing, ...imported];
}
