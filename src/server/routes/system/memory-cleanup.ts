import { jsonResponse } from '../../core/http';
import { clearSharpCache } from '@server/infrastructure/media/imageConverter';
import { checkpointSqliteWal } from '../../repositories/databaseMaintenance';

/**
 * POST /api/system/memory-cleanup
 * 主动执行服务端全链路内存与缓存释放：
 * 1. 清空 Sharp / libvips 底层 C++ 像素缓存与文件句柄池；
 * 2. 截断 SQLite WAL 预写日志文件（wal_checkpoint(TRUNCATE)）；
 * 3. 若处于 --expose-gc 模式，触发 Node.js V8 核心垃圾回收；
 * 4. 返回详细的释放前后统计指标。
 */
export async function POST() {
  try {
    const beforeMem = process.memoryUsage();

    // 1. 释放 Sharp 底层原生 C++ 内存
    clearSharpCache();

    // 2. 截断 SQLite WAL 预写日志
    const walResult = await checkpointSqliteWal();

    // 3. 触发 V8 垃圾回收
    const hasGc = typeof (global as unknown as { gc?: () => void }).gc === 'function';
    if (hasGc) {
      (global as unknown as { gc: () => void }).gc();
    }

    const afterMem = process.memoryUsage();
    const freedBytes = Math.max(0, beforeMem.rss - afterMem.rss);

    return jsonResponse({
      success: true,
      before: {
        rss: beforeMem.rss,
        heapUsed: beforeMem.heapUsed,
        heapTotal: beforeMem.heapTotal,
        external: beforeMem.external,
      },
      after: {
        rss: afterMem.rss,
        heapUsed: afterMem.heapUsed,
        heapTotal: afterMem.heapTotal,
        external: afterMem.external,
      },
      freedBytes,
      walResult,
      gcRun: hasGc,
      message: hasGc
        ? `内存与缓存释放成功，当前 RSS 占用 ${Math.round(afterMem.rss / 1024 / 1024)}MB`
        : `缓存与 WAL 已清理，当前 RSS 占用 ${Math.round(afterMem.rss / 1024 / 1024)}MB`,
    });
  } catch (error: any) {
    console.error('[MemoryCleanup] 执行失败:', error);
    return jsonResponse(
      {
        success: false,
        error: error?.message || '执行内存清理失败',
      },
      500,
    );
  }
}
