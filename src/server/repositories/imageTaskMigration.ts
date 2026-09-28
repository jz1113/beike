import { db } from './access';

export const imageTaskMigrationRepository = {
  findPage: (cursor: string | undefined, limit: number) => db.imageTask.findMany({
    where: { status: 'SUCCESS', resultUrl: { not: null }, ...(cursor ? { id: { gt: cursor } } : {}) },
    orderBy: { id: 'asc' },
    take: limit + 1,
  }),
  updateResultUrl: (id: string, resultUrl: string) => db.imageTask.update({ where: { id }, data: { resultUrl } }),
};
