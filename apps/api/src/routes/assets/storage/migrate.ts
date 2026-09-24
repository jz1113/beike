import { jsonResponse } from '../../../core/http';
import { readJsonBody } from '../../../core/validate';
import { db } from '../../../repositories/access';
import { resolveStorageConfig, uploadRemoteMediaToStorage, isAlreadyPermanentUrl, StorageConfig } from '@beike/server-kit/storage';
import { formatUserError } from '@beike/domain/upstreamErrors';
import { isAdminAuthorized, unauthorizedJson } from '@beike/server-kit/apiAuth';
import { getRequestId } from '../../../core/requestId';
import { recordAuditEvent } from '../../../services/agentTelemetry';

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  if (!isAdminAuthorized(req)) {
    recordAuditEvent({ operation: 'storage.migrate', requestId, success: false, reason: 'unauthorized' });
    return unauthorizedJson('需要管理员权限');
  }
  try {
    const body = await readJsonBody(req, {});
    const customConfig: StorageConfig | undefined = body?.config;
    const limit = Math.min(500, Math.max(1, Number(body?.limit) || 100));
    const cursor = typeof body?.cursor === 'string' && body.cursor ? body.cursor : undefined;
    const config = resolveStorageConfig(customConfig);
    if (!config) {
      recordAuditEvent({ operation: 'storage.migrate', requestId, success: false, reason: 'missing-storage-config' });
      return jsonResponse({ success: false, error: '未配置有效的对象存储凭证，请先在设置中填写并开启存储配置' }, 400);
    }
    if (!config.persistResults) {
      recordAuditEvent({ operation: 'storage.migrate', requestId, success: false, reason: 'persist-results-disabled' });
      return jsonResponse({ success: false, error: '未开启成品上传。开启后才会把历史文件转存到对象存储。' }, 400);
    }

    const tasks = await db.imageTask.findMany({
      where: { status: 'SUCCESS', resultUrl: { not: null }, ...(cursor ? { id: { gt: cursor } } : {}) },
      orderBy: { id: 'asc' },
      take: limit + 1,
    });
    const hasMore = tasks.length > limit;
    const page = hasMore ? tasks.slice(0, limit) : tasks;
    const needMigrate = page.filter(t => t.resultUrl && !isAlreadyPermanentUrl(t.resultUrl, config.publicDomain));
    console.log(`[对象存储-批量迁移] 扫描到 ${page.length} 条记录，其中 ${needMigrate.length} 条需要转存`);

    let migratedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];
    for (const task of needMigrate) {
      if (!task.resultUrl) continue;
      try {
        const isVideo = task.mediaType === 'video' || task.mediaType === 'depth-video' || task.resultUrl.includes('.mp4');
        const permanentUrl = await uploadRemoteMediaToStorage(task.resultUrl, {
          category: isVideo ? 'generated/videos' : 'generated/images',
          customConfig: config,
        });
        if (permanentUrl) {
          await db.imageTask.update({ where: { id: task.id }, data: { resultUrl: permanentUrl } });
          migratedCount++;
        }
      } catch (err: unknown) {
        failedCount++;
        errors.push(`任务 ${task.taskId || task.id} 迁移失败: ${formatUserError(err)}`);
        console.warn(`[对象存储-批量迁移] 任务 ${task.id} 转存失败:`, err instanceof Error ? err.message : err);
      }
    }

    recordAuditEvent({ operation: 'storage.migrate', requestId, success: failedCount === 0 });
    return jsonResponse({
      success: true,
      message: needMigrate.length === 0 && !hasMore
        ? '当前所有历史任务均为永久链接，无需迁移！'
        : `🎉 批量迁移完成！成功转存 ${migratedCount} 条，失败 ${failedCount} 条`,
      total: page.length,
      needMigrate: needMigrate.length,
      migrated: migratedCount,
      failed: failedCount,
      hasMore,
      nextCursor: hasMore ? page[page.length - 1]?.id : undefined,
      errors: errors.slice(0, 10),
    });
  } catch (error: unknown) {
    console.error('[对象存储-批量迁移] 异常:', error);
    recordAuditEvent({ operation: 'storage.migrate', requestId, success: false, reason: 'exception' });
    return jsonResponse({ success: false, error: formatUserError(error, '批量迁移执行失败') }, 500);
  }
}
