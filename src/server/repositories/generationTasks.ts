import { db } from './access';
import { requireWorkspaceId } from '@server/infrastructure/workspace/workspaceContext';

export const generationTaskRepository = {
  async findSuccessfulByIdempotencyKey(key: string) {
    const rows = await db.$queryRawUnsafe<Array<{ id: string; resultUrl: string | null }>>(
      'SELECT "id", "resultUrl" FROM "ImageTask" WHERE "workspaceId" = ? AND "idempotencyKey" = ? AND "status" = ? ORDER BY "createdAt" DESC LIMIT 1',
      requireWorkspaceId(), key, 'SUCCESS',
    );
    return rows[0] || null;
  },
  findTaskIdByKey: async (key: string) => (await db.imageTask.findFirst({
    where: { workspaceId: requireWorkspaceId(), idempotencyKey: key },
    orderBy: { createdAt: 'desc' }, select: { taskId: true },
  }))?.taskId || null,
  findStatus: (taskId: string) => db.imageTask.findFirst({
    where: { taskId }, select: { resultUrl: true, status: true, failReason: true },
  }),
  findModel: (taskId: string) => db.imageTask.findFirst({ where: { taskId }, select: { model: true } }),
  findByIdOrTaskId: (id: string) => db.imageTask.findFirst({ where: { OR: [{ id }, { taskId: id }] } }),
  markFailed: (id: string, failReason: string) => db.imageTask.update({ where: { id }, data: { status: 'FAILURE', failReason } }),
  markDepthSuccess: (id: string, resultUrl: string) => db.imageTask.update({ where: { id }, data: { status: 'SUCCESS', resultUrl, failReason: null } }),
  createDepthTask: (id: string, prompt: string, model: string, quality: string) => db.imageTask.create({
    data: { id, taskId: id, prompt, model, mediaType: 'depth-video', quality, status: 'IN_PROGRESS' },
  }),
  updateResultUrlByTaskId: (taskId: string, resultUrl: string) => db.imageTask.updateMany({ where: { taskId }, data: { resultUrl } }),
  updateTerminal: (taskId: string, status: 'SUCCESS' | 'FAILURE', resultUrl: string | null | undefined, failReason: string | null | undefined, mutableStatuses: string[]) => db.imageTask.updateMany({
    where: { taskId, status: { in: mutableStatuses } },
    data: { status, resultUrl: resultUrl || undefined, failReason: status === 'SUCCESS' ? null : failReason || undefined },
  }),
  async createImageTask(input: {
    productId?: string | null; prompt: string; finalTaskId: string; model: string;
    size: string; quality: string; directResultUrl?: string; idempotencyKey?: string | null;
  }) {
    let validProductId: string | null = null;
    if (input.productId) {
      const product = await db.product.findUnique({ where: { id: input.productId } }).catch(() => null);
      if (product) validProductId = input.productId;
    }
    const task = await db.imageTask.create({ data: {
      productId: validProductId, prompt: input.prompt, taskId: input.finalTaskId,
      model: input.model, mediaType: 'image', size: input.size, quality: input.quality,
      status: input.directResultUrl ? 'SUCCESS' : 'IN_PROGRESS', resultUrl: input.directResultUrl || undefined,
    } });
    if (input.idempotencyKey) {
      await db.$executeRawUnsafe(
        'UPDATE "ImageTask" SET "idempotencyKey" = ? WHERE "workspaceId" = ? AND "id" = ?',
        input.idempotencyKey, requireWorkspaceId(), task.id,
      ).catch(() => 0);
    }
    return task;
  },
  async upsertVideoTask(input: { productId?: string | null; prompt: string; taskId: string; model: string; size: string; quality: string }) {
    const product = input.productId ? await db.product.findUnique({ where: { id: input.productId } }).catch(() => null) : null;
    const data = { productId: product ? input.productId : null, prompt: input.prompt, model: input.model, mediaType: 'video', size: input.size, quality: input.quality, status: 'IN_PROGRESS' };
    return db.imageTask.upsert({
      where: { workspaceId_taskId: { workspaceId: requireWorkspaceId(), taskId: input.taskId } },
      update: data,
      create: { ...data, taskId: input.taskId },
    });
  },
};
