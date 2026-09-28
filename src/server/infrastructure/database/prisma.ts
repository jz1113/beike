import { PrismaClient } from '@prisma/client';
export type { PrismaClient };
import { migrateDatabase } from './migrations';
import { extendPrismaWithWorkspace } from '../workspace/workspaceScope';

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

const globalForPrisma = global as unknown as { unscopedPrisma?: PrismaClient; prisma?: PrismaClient };

function createClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const unscopedPrisma = globalForPrisma.unscopedPrisma || createClient();
export const prisma = globalForPrisma.prisma || extendPrismaWithWorkspace(createClient());

// 初始化 SQLite 高性能 WAL 模式、NORMAL 同步与 5 秒 busy 超时；表结构只由 desktopMigrations 演进
async function prepareDatabase(): Promise<void> {
  await unscopedPrisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000;');
  await unscopedPrisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
  await unscopedPrisma.$queryRawUnsafe('PRAGMA synchronous = NORMAL;');
  await unscopedPrisma.$queryRawUnsafe('PRAGMA wal_autocheckpoint = 1000;');
  await unscopedPrisma.$queryRawUnsafe('PRAGMA cache_size = -64000;'); // 限制内存页缓存不超过 64MB
  await migrateDatabase(unscopedPrisma);
  await unscopedPrisma.imageTask.count();
}

let initialization: Promise<void> | undefined;
/** Called explicitly before accepting requests; importing helpers never races schema initialization. */
export function initializeDatabase(): Promise<void> {
  return initialization ??= prepareDatabase();
}

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.unscopedPrisma = unscopedPrisma;
  globalForPrisma.prisma = prisma;
}

/**
 * 显式截断与压缩 SQLite WAL 预写日志文件，回收磁盘占用与内存映射
 */
export async function checkpointDatabase(): Promise<{ busy: number; log: number; checkpointed: number } | null> {
  try {
    const result = await unscopedPrisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
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
