import { prisma } from '../repositories/db';

export const imageTasks = {
  failOrphanUnsubmitted: () =>
    prisma.imageTask.updateMany({
      where: { status: 'IN_PROGRESS', taskId: null },
      data: {
        status: 'FAILURE',
        failReason: '服务重启，未提交至云端的孤儿任务已自动终止',
      },
    }),
  failStaleSubmitted: (staleBefore: Date) =>
    prisma.imageTask.updateMany({
      where: {
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        taskId: { not: null },
        updatedAt: { lt: staleBefore },
      },
      data: {
        status: 'FAILURE',
        failReason: '任务超过 20 分钟仍未完成，已自动终止',
      },
    }),
};
