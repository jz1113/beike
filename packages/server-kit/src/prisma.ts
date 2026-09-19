import { PrismaClient } from '@prisma/client';
export type { PrismaClient };
import { migrateDatabase } from './database/migrations';

// 若 DATABASE_URL 未设置，优先尝试加载环境变量文件并兜底至本地开发库
if (!process.env.DATABASE_URL) {
  try {
    if (typeof (process as any).loadEnvFile === 'function') {
      (process as any).loadEnvFile();
    }
  } catch {
    /* ignore */
  }
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'file:./dev.db';
  }
}

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

// 初始化 SQLite 高性能 WAL 模式、NORMAL 同步与 5 秒 busy 超时；表结构只由 desktopMigrations 演进
async function prepareDatabase(): Promise<void> {
  await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000;');
  await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
  await prisma.$queryRawUnsafe('PRAGMA synchronous = NORMAL;');
  await prisma.$queryRawUnsafe('PRAGMA wal_autocheckpoint = 1000;');
  await prisma.$queryRawUnsafe('PRAGMA cache_size = -64000;'); // 限制内存页缓存不超过 64MB
  await migrateDatabase(prisma);
  await prisma.imageTask.count();
}

let initialization: Promise<void> | undefined;
/** Called explicitly before accepting requests; importing helpers never races schema initialization. */
export function initializeDatabase(): Promise<void> {
  return initialization ??= prepareDatabase();
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * 显式截断与压缩 SQLite WAL 预写日志文件，回收磁盘占用与内存映射
 */
export async function checkpointDatabase(): Promise<{ busy: number; log: number; checkpointed: number } | null> {
  try {
    const result = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      'PRAGMA wal_checkpoint(TRUNCATE);'
    );
    const row = result?.[0];
    if (!row) return null;
    return {
      busy: Number(row.busy ?? 0),
      log: Number(row.log ?? 0),
      checkpointed: Number(row.checkpointed ?? 0),
    };
  } catch (err) {
    console.warn('[Prisma] checkpointDatabase failed:', err);
    return null;
  }
}

