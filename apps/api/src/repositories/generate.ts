import { prisma } from './db';

export const imageTasks = {
  failOrphanUnsubmitted: () =>
    prisma.imageTask.updateMany({
      where: { status: 'IN_PROGRESS', taskId: null },
      data: {
        status: 'FAILURE',
        failReason: '服务重启，未提交至云端的孤儿任务已自动终止',
      },
    }),
};
