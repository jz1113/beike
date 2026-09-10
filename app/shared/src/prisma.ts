import { PrismaClient } from '@prisma/client';

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

// 初始化 SQLite 高性能 WAL 模式、NORMAL 同步与 5 秒 busy 超时，并自愈保障原子资产表存在
async function prepareDatabase(): Promise<void> {
  await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000;');
  await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
  await prisma.$queryRawUnsafe('PRAGMA synchronous = NORMAL;');
  await prisma.$queryRawUnsafe('PRAGMA wal_autocheckpoint = 1000;');
  await prisma.$queryRawUnsafe('PRAGMA cache_size = -64000;'); // 限制内存页缓存不超过 64MB

  // 自动自愈建表保障
  const ensureTablesSql = `
    CREATE TABLE IF NOT EXISTS "SceneAsset" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "title" TEXT NOT NULL,
      "description" TEXT NOT NULL,
      "lighting" TEXT NOT NULL,
      "category" TEXT NOT NULL DEFAULT 'general',
      "spatialType" TEXT NOT NULL DEFAULT 'indoor_room',
      "suitableCategories" TEXT NOT NULL DEFAULT '[]',
      "tags" TEXT NOT NULL DEFAULT '',
      "coverUrl" TEXT,
      "sourceImages" TEXT,
      "usageCount" INTEGER NOT NULL DEFAULT 0,
      "isFavorite" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS "OutfitAsset" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "title" TEXT NOT NULL,
      "top" TEXT NOT NULL,
      "bottom" TEXT NOT NULL,
      "shoes" TEXT,
      "colorPalette" TEXT,
      "category" TEXT NOT NULL DEFAULT 'general',
      "suitableCategories" TEXT NOT NULL DEFAULT '[]',
      "tags" TEXT NOT NULL DEFAULT '',
      "coverUrl" TEXT,
      "usageCount" INTEGER NOT NULL DEFAULT 0,
      "isFavorite" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS "ActionAsset" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "title" TEXT NOT NULL,
      "action" TEXT NOT NULL,
      "shotType" TEXT NOT NULL,
      "spatialType" TEXT NOT NULL DEFAULT 'general',
      "camera" TEXT,
      "suitableAnatomy" TEXT NOT NULL DEFAULT '[]',
      "tags" TEXT NOT NULL DEFAULT '',
      "coverUrl" TEXT,
      "usageCount" INTEGER NOT NULL DEFAULT 0,
      "isFavorite" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS "PersonaAsset" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "description" TEXT NOT NULL,
      "tags" TEXT NOT NULL DEFAULT '',
      "avatarUrl" TEXT,
      "usageCount" INTEGER NOT NULL DEFAULT 0,
      "isFavorite" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;

  // 自动自愈列迁移保障
  const migrations: Array<[string, string, string]> = [
    ['SceneAsset', 'reversePrompt', 'TEXT'],
    ['SceneAsset', 'dimensions', 'TEXT'],
    ['SceneAsset', 'sourceImageIndex', 'INTEGER'],
    ['SceneAsset', 'imageType', 'TEXT'],
    ['SceneAsset', 'provenance', "TEXT NOT NULL DEFAULT 'manual'"],
    ['OutfitAsset', 'reversePrompt', 'TEXT'],
    ['OutfitAsset', 'dimensions', 'TEXT'],
    ['OutfitAsset', 'sourceImageIndex', 'INTEGER'],
    ['OutfitAsset', 'imageType', 'TEXT'],
    ['OutfitAsset', 'provenance', "TEXT NOT NULL DEFAULT 'manual'"],
    ['ActionAsset', 'reversePrompt', 'TEXT'],
    ['ActionAsset', 'dimensions', 'TEXT'],
    ['ActionAsset', 'sourceImageIndex', 'INTEGER'],
    ['ActionAsset', 'imageType', 'TEXT'],
    ['ActionAsset', 'provenance', "TEXT NOT NULL DEFAULT 'manual'"],
    ['ActionAsset', 'sceneId', 'TEXT'],
    ['ActionAsset', 'shotOrder', 'INTEGER NOT NULL DEFAULT 0'],
    ['PersonaAsset', 'reversePrompt', 'TEXT'],
    ['PersonaAsset', 'dimensions', 'TEXT'],
    ['PersonaAsset', 'sourceImageIndex', 'INTEGER'],
    ['PersonaAsset', 'imageType', 'TEXT'],
    ['PersonaAsset', 'provenance', "TEXT NOT NULL DEFAULT 'manual'"],
  ];

  // 自愈迁移表名白名单（防御 $queryRawUnsafe 拼接 SQL）
  const ALLOWED_SELF_HEAL_TABLES = new Set([
    'SceneAsset',
    'OutfitAsset',
    'ActionAsset',
    'PersonaAsset',
  ]);

  const statements = ensureTablesSql.split(';').map(statement => statement.trim()).filter(Boolean);
  for (const statement of statements) await prisma.$executeRawUnsafe(statement);
  for (const [table, column, definition] of migrations) {
    if (!ALLOWED_SELF_HEAL_TABLES.has(table)) continue;
    const info = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("${table}");`);
    if (!info.some(field => field.name === column)) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition};`);
    }
  }
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "ActionAsset_sceneId_idx" ON "ActionAsset"("sceneId");');
  await prisma.imageTask.count();
  await prisma.fullPromptAsset.count();
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

