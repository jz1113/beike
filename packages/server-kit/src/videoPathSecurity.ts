import os from 'node:os';
import path from 'node:path';
import { resolveStorageRoot } from './storagePaths';

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.avi', '.mkv']);

export function assertSafeVideoPath(urlOrPath: string): string {
  if (urlOrPath.includes('\0')) throw new Error('无效的视频路径');
  const raw = urlOrPath.trim();
  if (!raw) throw new Error('无效的视频路径');
  if (!path.isAbsolute(raw)) return raw;
  const resolved = path.resolve(raw);
  const roots = [
    path.resolve(resolveStorageRoot()),
    path.resolve(process.env.HOME || os.homedir(), 'Downloads'),
    path.resolve(os.tmpdir()),
  ];
  const allowed = roots.some((root) => resolved === root || resolved.startsWith(root + path.sep));
  if (!allowed) throw new Error('视频路径不在允许的目录内');
  if (!VIDEO_EXTS.has(path.extname(resolved).toLowerCase())) throw new Error('无效的视频路径');
  return raw;
}
