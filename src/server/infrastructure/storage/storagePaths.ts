import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { isFixedLocalWorkspace, LOCAL_WORKSPACE_ID, requireWorkspaceId } from '../workspace/workspaceContext';

/**
 * 解析 storage 根目录。所有访问必须限制在此根下，realpath 后再校验前缀，
 * 防止符号链接与 `..` 路径遍历。
 */
export function resolveStorageRoot(): string {
  const cacheDir = process.env.AZHUO_CACHE_DIR?.trim();
  if (cacheDir) return cacheDir;

  const dataDir = process.env.AZHUO_DATA_DIR?.trim();
  if (dataDir) return path.join(dataDir, 'storage');

  const raw = process.env.DATABASE_URL?.trim();
  if (raw?.startsWith('file:')) {
    const dbPath = raw.slice('file:'.length).replace(/^\/\//, '');
    const abs = path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);
    return path.join(path.dirname(abs), 'storage');
  }

  // 测试环境统一使用系统临时目录，避免污染源码工程目录
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    return path.join(os.tmpdir(), 'beike-workbench', 'storage');
  }

  // 默认优先使用桌面应用数据目录，杜绝在工作目录下生成 app_data
  const defaultAppSupport = path.join(
    process.env.HOME || process.env.USERPROFILE || os.homedir(),
    'Library/Application Support/com.azhuo.workbench',
    'storage'
  );
  if (fs.existsSync(path.dirname(defaultAppSupport))) {
    return defaultAppSupport;
  }

  return path.join(os.tmpdir(), 'beike-workbench', 'storage');
}

/**
 * 安全检查：在 root 下解析相对路径，禁止 `..`、绝对路径、Windows 盘符
 * 与 URL 中可能的双斜杠编码。返回最终安全路径或 null（非法）。
 */
export function safeResolveWithinRoot(root: string, rel: string): string | null {
  if (!rel) return null;
  if (rel.includes('../..')) return null;
  // 禁止绝对路径 / Windows 盘符
  if (path.isAbsolute(rel)) return null;
  if (/^[a-zA-Z]:[\\/]/.test(rel)) return null;
  // 禁止空字节与控制字符
  if (Array.from(rel).some((char) => char.charCodeAt(0) < 32)) return null;

  const abs = path.join(root, rel);
  // 规范化：realpath（仅在文件存在时可用，缺失时仅做字符串规范化）
  let normalized: string;
  try {
    normalized = fs.realpathSync(abs);
  } catch {
    // 文件不存在：仍返回 abs 让上层检查 exists；规范化交给 path.normalize
    normalized = path.resolve(abs);
  }
  // 二次校验：realpath 后的绝对路径必须在 root 下（防止符号链接逃逸）
  const realRoot = (() => {
    try {
      return fs.realpathSync(root);
    } catch {
      return path.resolve(root);
    }
  })();
  if (!normalized.startsWith(realRoot + path.sep) && normalized !== realRoot) {
    return null;
  }
  return normalized;
}

/** Historical local fallback is read-only; new media always uses the configured root. */
export function resolveStoredMediaPath(relative: string): string | null {
  const roots = [resolveStorageRoot(), path.resolve(process.cwd(), '.azhuo_storage')];
  for (const root of new Set(roots)) {
    const candidate = safeResolveWithinRoot(root, relative);
    if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}


export function toWorkspaceStorageKey(relKey: string, workspaceId = requireWorkspaceId()): string {
  const prefix = workspaceId;
  const clean = relKey.replace(/^\/+/, '');
  if (clean === prefix || clean.startsWith(`${prefix}/`)) return clean;
  return `${prefix}/${clean}`;
}

export function isWorkspaceStorageRel(rel: string, workspaceId: string): boolean {
  const clean = rel.replace(/^\/+/, '');
  if (clean === workspaceId || clean.startsWith(`${workspaceId}/`)) return true;
  if (isFixedLocalWorkspace() && workspaceId === LOCAL_WORKSPACE_ID) {
    const first = clean.split('/')[0] || '';
    if (/^[a-f0-9]{64}$/.test(first) || first === 'official' || first === 'legacy') return false;
    return true;
  }
  return false;
}
