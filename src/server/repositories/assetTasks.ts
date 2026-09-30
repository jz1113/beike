import { db } from './access';
import type { Prisma } from '@prisma/client';
import { requireWorkspaceId } from '@server/infrastructure/workspace/workspaceContext';

const productSummary = { id: true, title: true, picUrl: true, platform: true } as const;

function selectedWhere(ids: string[], urls: string[]): Prisma.ImageTaskWhereInput {
  const OR: Prisma.ImageTaskWhereInput[] = [];
  if (ids.length) OR.push({ id: { in: ids } }, { taskId: { in: ids } });
  if (urls.length) OR.push({ resultUrl: { in: urls } });
  return { OR };
}

function compactDatabase() {
  void db.$executeRawUnsafe('VACUUM;').catch(() => {});
}

export const assetTaskRepository = {
  findDetail: (id: string) => db.imageTask.findFirst({
    where: { OR: [{ id }, { taskId: id }] },
    include: { product: { select: productSummary } },
  }),
  async list(filters: { productId: string | null; status: string | null; search: string | null; page: number; pageSize: number }) {
    const { productId, status, search, page, pageSize } = filters;
    const where: Prisma.ImageTaskWhereInput = {};
    if (productId) where.productId = productId;
    if (status && status !== 'all') where.status = status;
    if (search) where.prompt = { contains: search };
    const [total, tasks] = await Promise.all([
      db.imageTask.count({ where }),
      db.imageTask.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, include: { product: { select: productSummary } } }),
    ]);
    return { total, tasks };
  },
  async removeRecords(selection: { all?: boolean; failed?: boolean; ids?: string[]; urls?: string[] }) {
    const workspaceId = requireWorkspaceId();
    const filter: Prisma.ImageTaskWhereInput = selection.all ? {} : selection.failed ? { status: 'FAILURE' } : selectedWhere(selection.ids || [], selection.urls || []);
    const removed = await db.$transaction(async tx => {
      const records = await tx.imageTask.findMany({ where: { AND: [filter, { workspaceId }] }, select: { id: true, resultUrl: true } });
      if (!records.length) return { records, count: 0, referenced: [] as string[] };
      const { count } = await tx.imageTask.deleteMany({ where: { workspaceId, id: { in: records.map(record => record.id) } } });
      const urls = records.map(record => record.resultUrl).filter((url): url is string => Boolean(url));
      const remaining = urls.length ? await tx.imageTask.findMany({ where: { workspaceId, resultUrl: { in: urls } }, select: { resultUrl: true } }) : [];
      return { records, count, referenced: remaining.map(record => record.resultUrl).filter((url): url is string => Boolean(url)) };
    });
    if (removed.count > 5) compactDatabase();
    return removed;
  },
};
