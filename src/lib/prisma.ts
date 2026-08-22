import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

// 初始化 SQLite 高性能 WAL 模式和 5 秒 busy 超时
if (!globalForPrisma.prisma) {
  prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;').catch(() => {});
  prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000;').catch(() => {});
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
