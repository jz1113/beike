import fs from 'node:fs';
import path from 'node:path';
import { jsonResponse } from '../../core/http';
import { prisma } from '@beike/shared/prisma';
import { clearProxyVideoCache } from './proxy-image';
import { formatUserError } from '@beike/shared/upstreamErrors';

function dirStats(dir: string): { bytes: number; fileCount: number } {
  let bytes = 0;
  let fileCount = 0;
  if (!fs.existsSync(dir)) return { bytes, fileCount };

  const walk = (current: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isFile()) {
        fileCount += 1;
        try {
          bytes += fs.statSync(full).size;
        } catch {
          /* ignore */
        }
      } else if (entry.isDirectory()) {
        walk(full);
      }
    }
  };

  walk(dir);
  return { bytes, fileCount };
}

function resolveSqlitePathFromDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) return '';

  let filePath = raw;
  if (filePath.startsWith('file:')) {
    filePath = filePath.slice('file:'.length);
  }

  if (filePath.startsWith('//')) {
    filePath = filePath.slice(2);
  } else if (filePath.startsWith('/')) {
    // absolute unix path
  } else if (/^[a-zA-Z]:[/\\]/.test(filePath)) {
    // absolute windows path
  } else {
    filePath = path.resolve(process.cwd(), filePath);
  }

  return path.normalize(filePath);
}

function resolveDataDir(): string {
  const fromEnv = process.env.AZHUO_DATA_DIR?.trim();
  if (fromEnv) return fromEnv;

  const dbPath = resolveSqlitePathFromDatabaseUrl();
  if (dbPath) return path.dirname(dbPath);
  return '';
}

function resolveCacheRoot(): string {
  const cacheDir = process.env.AZHUO_CACHE_DIR?.trim();
  if (cacheDir) return cacheDir;
  const dataDir = resolveDataDir();
  if (dataDir) return path.join(dataDir, 'storage');
  return '';
}

function rmDirContents(dir: string) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.lstatSync(full);
    if (stat.isDirectory()) {
      rmDirContents(full);
      fs.rmdirSync(full);
    } else {
      fs.unlinkSync(full);
    }
  }
}

/**
 * GET /api/system/local-storage/stats
 */
export async function GET() {
  try {
    const [
      imageTaskCount,
      productCount,
      sceneCount,
      outfitCount,
      actionCount,
      personaCount,
      styleRecipeCount,
      assistantThreadCount,
      promptRecordCount,
    ] = await Promise.all([
      prisma.imageTask.count().catch(() => 0),
      prisma.product.count().catch(() => 0),
      prisma.sceneAsset.count().catch(() => 0),
      prisma.outfitAsset.count().catch(() => 0),
      prisma.actionAsset.count().catch(() => 0),
      prisma.personaAsset.count().catch(() => 0),
      prisma.styleRecipe.count().catch(() => 0),
      prisma.assistantThread.count().catch(() => 0),
      prisma.promptRecord.count().catch(() => 0),
    ]);

    const dataDir = resolveDataDir();
    const cacheRoot = resolveCacheRoot();
    const dbPath = resolveSqlitePathFromDatabaseUrl() || (dataDir ? path.join(dataDir, 'azhuo.db') : '');
    const storageDir = cacheRoot || (dataDir ? path.join(dataDir, 'storage') : '');
    const derivedDir = storageDir ? path.join(storageDir, 'derived') : '';

    let dbBytes = 0;
    let dbReadable = false;
    if (dbPath && fs.existsSync(dbPath)) {
      dbBytes = fs.statSync(dbPath).size;
      dbReadable = true;
    }

    const storageStats = storageDir ? dirStats(storageDir) : { bytes: 0, fileCount: 0 };
    const derivedStats = derivedDir ? dirStats(derivedDir) : { bytes: 0, fileCount: 0 };

    return jsonResponse({
      success: true,
      imageTaskCount,
      productCount,
      sceneCount,
      outfitCount,
      actionCount,
      personaCount,
      styleRecipeCount,
      assistantThreadCount,
      promptRecordCount,
      promptAssetsTotal: sceneCount + outfitCount + actionCount + personaCount,
      dbBytes,
      dbPath,
      dbReadable,
      storageDirBytes: storageStats.bytes,
      storageFileCount: storageStats.fileCount,
      derivedDirBytes: derivedStats.bytes,
      derivedFileCount: derivedStats.fileCount,
      cacheRoot,
      dataDir,
    });
  } catch (error: any) {
    return jsonResponse({ success: false, error: formatUserError(error, '读取存储统计失败') }, 500);
  }
}

/**
 * POST /api/system/local-storage/clear-derived
 */
export async function POST(_req?: Request) {
  try {
    // 仅清理派生媒体磁盘缓存
    const cacheRoot = resolveCacheRoot();
    const derivedDir = cacheRoot ? path.join(cacheRoot, 'derived') : '';
    const beforeDerived = derivedDir ? dirStats(derivedDir) : { bytes: 0, fileCount: 0 };
    if (derivedDir) {
      fs.mkdirSync(derivedDir, { recursive: true });
      rmDirContents(derivedDir);
    }
    const clearedVideos = clearProxyVideoCache();
    return jsonResponse({
      success: true,
      clearedBytes: beforeDerived.bytes,
      clearedFileCount: beforeDerived.fileCount,
      message: `已清理派生磁盘缓存${clearedVideos ? `（含 ${clearedVideos} 条视频内存缓存）` : ''}`,
    });
  } catch (error: any) {
    return jsonResponse({ success: false, error: formatUserError(error, '清理失败') }, 500);
  }
}
