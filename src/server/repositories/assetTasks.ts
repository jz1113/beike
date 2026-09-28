import { db } from './access';
import type { Prisma } from '@prisma/client';

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
  async deleteFailed() {
    const result = await db.imageTask.deleteMany({ where: { status: 'FAILURE' } });
    compactDatabase();
    return result.count;
  },
  async findAllResultUrls() {
    const tasks = await db.imageTask.findMany({ select: { resultUrl: true } });
    return tasks.map((task) => task.resultUrl).filter((url): url is string => Boolean(url));
  },
  async deleteAll() {
    const result = await db.imageTask.deleteMany({});
    compactDatabase();
    return result.count;
  },
  async findResultUrls(ids: string[], urls: string[]) {
    const tasks = await db.imageTask.findMany({ where: selectedWhere(ids, urls), select: { resultUrl: true } });
    return tasks.map((task) => task.resultUrl).filter((url): url is string => Boolean(url));
  },
  async deleteSelected(ids: string[], urls: string[]) {
    const result = await db.imageTask.deleteMany({ where: selectedWhere(ids, urls) });
    if (result.count > 5) compactDatabase();
    return result.count;
  },
};
