import { jsonResponse } from '../../adapters/http';
import { prisma } from '@/lib/prisma';
import { isAdminAuthorized, unauthorizedJson } from '@/lib/apiAuth';

/**
 * GET /api/assets/tasks
 * 获取历史生图任务列表（分页）
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get('productId');
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get('pageSize') || '100', 10) || 100));

    const where: any = {};
    if (productId) where.productId = productId;
    if (status && status !== 'all') where.status = status;
    if (search) {
      where.prompt = { contains: search };
    }

    const [total, tasks] = await Promise.all([
      prisma.imageTask.count({ where }),
      prisma.imageTask.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          product: {
            select: {
              id: true,
              title: true,
              picUrl: true,
              platform: true
            }
          }
        }
      })
    ]);

    return jsonResponse({
      success: true,
      page,
      pageSize,
      total,
      tasks: tasks.map(t => ({
        id: t.id,
        taskId: t.taskId,
        prompt: t.prompt,
        model: t.model,
        mediaType: t.mediaType,
        size: t.size,
        quality: t.quality,
        status: t.status,
        resultUrl: t.resultUrl,
        failReason: t.failReason,
        createdAt: t.createdAt,
        product: t.product
      }))
    });
  } catch (error: any) {
    console.error('获取历史生图任务失败:', error);
    return jsonResponse({ success: false, error: error.message || '获取任务失败' }, 500);
  }
}

/**
 * DELETE /api/assets/tasks
 * 删除指定的生图历史记录 (支持单 ID、逗号分隔 ID、JSON 批量 IDs、或一键清理全部失败/卡顿任务)
 */
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const body = await req.json().catch(() => null);

    const id = searchParams.get('id');
    const idsParam = searchParams.get('ids');
    const urlParam = searchParams.get('url');
    const urlsParam = searchParams.get('urls');
    const clearFailed = searchParams.get('clearFailed') === 'true' || body?.clearFailed === true;
    const clearAll = searchParams.get('clearAll') === 'true' || body?.clearAll === true;

    // 1. 如果请求一键清理所有失败/卡顿记录
    if (clearFailed) {
      const deleteResult = await prisma.imageTask.deleteMany({
        where: {
          OR: [
            { status: 'FAILURE' },
            { status: 'IN_PROGRESS', resultUrl: null }
          ]
        }
      });
      // 异步整理磁盘空间
      prisma.$executeRawUnsafe('VACUUM;').catch(() => {});
      console.log(`[DELETE /api/assets/tasks] 成功清理 ${deleteResult.count} 条失败/卡顿任务`);
      return jsonResponse({ success: true, count: deleteResult.count });
    }

    // 2. 如果请求清理全部（需管理员令牌）
    if (clearAll) {
      if (!isAdminAuthorized(req)) {
        return unauthorizedJson('clearAll requires admin token');
      }
      const deleteResult = await prisma.imageTask.deleteMany({});
      prisma.$executeRawUnsafe('VACUUM;').catch(() => {});
      console.log(`[DELETE /api/assets/tasks] 成功清空所有生图记录 (${deleteResult.count} 条)`);
      return jsonResponse({ success: true, count: deleteResult.count });
    }

    // 3. 收集所有待删除的目标 ID 与 URL
    let targetIds: string[] = [];
    let targetUrls: string[] = [];

    if (id) targetIds.push(id);
    if (idsParam) targetIds.push(...idsParam.split(',').map(s => s.trim()).filter(Boolean));
    if (body?.id) targetIds.push(String(body.id));
    if (body?.ids && Array.isArray(body.ids)) targetIds.push(...body.ids.map(String));

    if (urlParam) targetUrls.push(urlParam);
    if (urlsParam) targetUrls.push(...urlsParam.split(',').map(s => s.trim()).filter(Boolean));
    if (body?.url) targetUrls.push(String(body.url));
    if (body?.urls && Array.isArray(body.urls)) targetUrls.push(...body.urls.map(String));

    targetIds = Array.from(new Set(targetIds.map(s => s.trim()).filter(Boolean)));
    targetUrls = Array.from(new Set(targetUrls.map(s => s.trim()).filter(Boolean)));

    if (targetIds.length === 0 && targetUrls.length === 0) {
      return jsonResponse({ success: false, error: '缺少待删除的任务 ID 或 URL' }, 400);
    }

    // 🌟 多维精准删库：同时匹配 cuid 主键 id、taskId 业务标识、或生成出图 resultUrl
    const orConditions: any[] = [];
    if (targetIds.length > 0) {
      orConditions.push({ id: { in: targetIds } });
      orConditions.push({ taskId: { in: targetIds } });
    }
    if (targetUrls.length > 0) {
      orConditions.push({ resultUrl: { in: targetUrls } });
    }

    const deleteResult = await prisma.imageTask.deleteMany({
      where: {
        OR: orConditions
      }
    });

    if (deleteResult.count > 5) {
      prisma.$executeRawUnsafe('VACUUM;').catch(() => {});
    }

    console.log(`[DELETE /api/assets/tasks] 成功从数据库物理删除 ${deleteResult.count} 条记录 (IDs: ${targetIds.length}, URLs: ${targetUrls.length})`);
    return jsonResponse({ success: true, count: deleteResult.count });
  } catch (error: any) {
    console.error('删除生图任务失败:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}
