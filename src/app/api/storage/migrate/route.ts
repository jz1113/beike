import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveStorageConfig, uploadRemoteMediaToStorage, isAlreadyPermanentUrl, StorageConfig } from '@/lib/storage';

/**
 * POST /api/storage/migrate
 * 一键批量迁移存量历史任务至云端对象存储
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const customConfig: StorageConfig | undefined = body?.config;

    const config = resolveStorageConfig(customConfig);
    if (!config) {
      return NextResponse.json({
        success: false,
        error: '未配置有效的对象存储凭证，请先在设置中填写并开启存储配置'
      }, { status: 400 });
    }

    // 1. 查询所有已成功且带有结果链接的任务
    const tasks = await prisma.imageTask.findMany({
      where: {
        status: 'SUCCESS',
        resultUrl: { not: null }
      },
      orderBy: { createdAt: 'desc' }
    });

    // 2. 筛选出尚未持久化到当前对象存储的记录
    const needMigrate = tasks.filter(t => t.resultUrl && !isAlreadyPermanentUrl(t.resultUrl, config.publicDomain));

    console.log(`[对象存储-批量迁移] 扫描到 ${tasks.length} 条记录，其中 ${needMigrate.length} 条需要转存`);

    if (needMigrate.length === 0) {
      return NextResponse.json({
        success: true,
        message: '当前所有历史任务均为永久链接，无需迁移！',
        total: tasks.length,
        migrated: 0,
        failed: 0
      });
    }

    let migratedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // 3. 逐个迁移并更新数据库
    for (const task of needMigrate) {
      if (!task.resultUrl) continue;
      try {
        const isVideo = task.mediaType === 'video' || task.resultUrl.includes('.mp4');
        const permanentUrl = await uploadRemoteMediaToStorage(task.resultUrl, {
          keyPrefix: isVideo ? 'videos' : 'images',
          customConfig: config
        });

        if (permanentUrl) {
          await prisma.imageTask.update({
            where: { id: task.id },
            data: { resultUrl: permanentUrl }
          });
          migratedCount++;
        }
      } catch (err: any) {
        failedCount++;
        errors.push(`任务 ${task.taskId || task.id} 迁移失败: ${err.message}`);
        console.warn(`[对象存储-批量迁移] 任务 ${task.id} 转存失败:`, err.message);
      }
    }

    return NextResponse.json({
      success: true,
      message: `🎉 批量迁移完成！成功转存 ${migratedCount} 条，失败 ${failedCount} 条`,
      total: tasks.length,
      needMigrate: needMigrate.length,
      migrated: migratedCount,
      failed: failedCount,
      errors: errors.slice(0, 10)
    });
  } catch (error: any) {
    console.error('[对象存储-批量迁移] 异常:', error);
    return NextResponse.json({
      success: false,
      error: error.message || '批量迁移执行失败'
    }, { status: 500 });
  }
}
