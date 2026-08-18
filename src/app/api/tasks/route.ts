import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/tasks
 * 获取所有历史生图任务列表 (支持按商品、状态、关键词筛选)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get('productId');
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    const where: any = {};
    if (productId) where.productId = productId;
    if (status && status !== 'all') where.status = status;
    if (search) {
      where.prompt = { contains: search };
    }

    const tasks = await prisma.imageTask.findMany({
      where,
      orderBy: { createdAt: 'desc' },
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
    });

    return NextResponse.json({
      success: true,
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
    console.error('获取历史生图任务失败 (使用本地状态兜底):', error);
    return NextResponse.json({ success: true, tasks: [], warning: error.message });
  }
}

/**
 * DELETE /api/tasks
 * 删除指定的生图历史记录 (支持单 ID、逗号分隔 ID、JSON 批量 IDs、或一键清理全部失败/卡顿任务)
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const idsParam = searchParams.get('ids');
    const clearFailed = searchParams.get('clearFailed') === 'true';
    const clearAll = searchParams.get('clearAll') === 'true';

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
      console.log(`[DELETE /api/tasks] 成功清理 ${deleteResult.count} 条失败/卡顿任务`);
      return NextResponse.json({ success: true, count: deleteResult.count });
    }

    // 2. 如果请求清理全部
    if (clearAll) {
      const deleteResult = await prisma.imageTask.deleteMany({});
      console.log(`[DELETE /api/tasks] 成功清空所有生图记录 (${deleteResult.count} 条)`);
      return NextResponse.json({ success: true, count: deleteResult.count });
    }

    // 3. 收集所有待删除的目标 ID 与 URL
    let targetIds: string[] = [];
    let targetUrls: string[] = [];

    const urlParam = searchParams.get('url');
    const urlsParam = searchParams.get('urls');

    if (id) targetIds.push(id);
    if (idsParam) targetIds.push(...idsParam.split(',').map(s => s.trim()).filter(Boolean));
    if (urlParam) targetUrls.push(urlParam);
    if (urlsParam) targetUrls.push(...urlsParam.split(',').map(s => s.trim()).filter(Boolean));

    // 尝试从 JSON Body 中读取批量 IDs 与 URLs
    try {
      const body = await req.json().catch(() => null);
      if (body?.ids && Array.isArray(body.ids)) {
        targetIds.push(...body.ids);
      }
      if (body?.id) {
        targetIds.push(body.id);
      }
      if (body?.urls && Array.isArray(body.urls)) {
        targetUrls.push(...body.urls);
      }
      if (body?.url) {
        targetUrls.push(body.url);
      }
      if (body?.clearFailed) {
        const delFailed = await prisma.imageTask.deleteMany({
          where: {
            OR: [
              { status: 'FAILURE' },
              { status: 'IN_PROGRESS', resultUrl: null }
            ]
          }
        });
        await prisma.$executeRawUnsafe('VACUUM;').catch(() => {});
        return NextResponse.json({ success: true, count: delFailed.count });
      }
    } catch {}

    targetIds = Array.from(new Set(targetIds.map(s => String(s).trim()).filter(Boolean)));
    targetUrls = Array.from(new Set(targetUrls.map(s => String(s).trim()).filter(Boolean)));

    if (targetIds.length === 0 && targetUrls.length === 0) {
      return NextResponse.json({ success: false, error: '缺少待删除的任务 ID 或 URL' }, { status: 400 });
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

    // 🌟 立即释放本地 SQLite 磁盘存储空间
    await prisma.$executeRawUnsafe('VACUUM;').catch(() => {});

    console.log(`[DELETE /api/tasks] 成功从数据库物理删除 ${deleteResult.count} 条记录 (IDs: ${targetIds.length}, URLs: ${targetUrls.length})，已完成磁盘空间清理`);
    return NextResponse.json({ success: true, count: deleteResult.count });
  } catch (error: any) {
    console.error('删除生图任务失败:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
