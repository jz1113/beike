import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveStorageRoot, resolveStoredMediaPath, isWorkspaceStorageRel } from '../storage/storagePaths';

import { getWorkspaceId } from '../workspace/workspaceContext';

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.avi', '.mkv']);

export function assertSafeVideoPath(urlOrPath: string): string {
  const raw = urlOrPath.trim();
  if (!raw || /[\x00-\x1f]/.test(raw)) throw new Error('无效的视频路径');
  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw);
    if (url.username || url.password) throw new Error('视频地址不得包含账号或密码');
    return raw;
  }
  if (raw.startsWith('/storage/')) {
    const relative = raw.slice('/storage/'.length);
    const workspaceId = getWorkspaceId();
    if (workspaceId && !isWorkspaceStorageRel(relative, workspaceId)) throw new Error('视频不属于当前工作区');
    const file = resolveStoredMediaPath(relative);
    if (!file || !VIDEO_EXTS.has(path.extname(file).toLowerCase())) throw new Error('视频文件不存在或格式无效');
    return file;
  }
  // A bare filename may refer to Downloads; relative directory traversal is never accepted.
  if (!path.isAbsolute(raw) && (path.basename(raw) !== raw || raw.includes('\\') || raw === '.' || raw === '..')) throw new Error('视频路径不在允许的目录内');
  const candidate = path.isAbsolute(raw) ? raw : path.join(process.env.HOME || os.homedir(), 'Downloads', raw);
  if (!VIDEO_EXTS.has(path.extname(candidate).toLowerCase())) throw new Error('无效的视频路径');
  const roots = [resolveStorageRoot(), path.join(process.env.HOME || os.homedir(), 'Downloads'), os.tmpdir()];
  const canonical = fs.existsSync(candidate) ? fs.realpathSync(candidate) : path.resolve(candidate);
  const allowed = roots.some((root) => {
    const resolved = fs.existsSync(root) ? fs.realpathSync(root) : path.resolve(root);
    return canonical.startsWith(resolved + path.sep);
  });
  const storageRoot = resolveStorageRoot();
  const canonicalStorageRoot = fs.existsSync(storageRoot) ? fs.realpathSync(storageRoot) : path.resolve(storageRoot);
  const workspaceId = getWorkspaceId();
  if (workspaceId && canonical.startsWith(canonicalStorageRoot + path.sep) && !isWorkspaceStorageRel(path.relative(canonicalStorageRoot, canonical), workspaceId)) throw new Error('视频不属于当前工作区');
  if (!allowed) throw new Error('视频路径不在允许的目录内');
  return canonical;
}
