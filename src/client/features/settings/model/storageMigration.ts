export interface MigrationProgress { total: number; migrated: number; failed: number; }
interface MigrationPage extends MigrationProgress { hasMore: boolean; nextCursor?: string; }

export async function migrateStoragePages(
  request: (cursor?: string) => Promise<MigrationPage>,
  onProgress: (progress: MigrationProgress) => void,
  shouldStop: () => boolean,
): Promise<MigrationProgress & { stopped: boolean }> {
  const progress: MigrationProgress = { total: 0, migrated: 0, failed: 0 };
  const cursors = new Set<string>();
  let cursor: string | undefined;
  while (!shouldStop()) {
    const page = await request(cursor);
    for (const field of ['total', 'migrated', 'failed'] as const) {
      if (!Number.isSafeInteger(page[field]) || page[field] < 0) throw new Error('迁移接口返回了无效的处理数量');
    }
    if (page.migrated + page.failed > page.total || typeof page.hasMore !== 'boolean') {
      throw new Error('迁移接口返回了无效的处理结果');
    }
    progress.total += page.total;
    progress.migrated += page.migrated;
    progress.failed += page.failed;
    onProgress({ ...progress });
    if (!page.hasMore) return { ...progress, stopped: false };
    if (!page.nextCursor || cursors.has(page.nextCursor)) throw new Error('迁移分页游标异常，已停止后续批次');
    cursor = page.nextCursor;
    cursors.add(cursor);
  }
  return { ...progress, stopped: true };
}
