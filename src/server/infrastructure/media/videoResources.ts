import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { resolveStorageRoot, resolveStoredMediaPath, toWorkspaceStorageKey, isWorkspaceStorageRel } from '../storage/storagePaths';
import { assertSafeVideoPath } from './videoPathSecurity';
import { fetchSafeRemoteBytes } from '../network/safeRemoteFetch';
import { isPrivateIp } from '../network/safeUrl';

import { getWorkspaceId } from '../workspace/workspaceContext';

const MAX_VIDEO_BYTES = 100_000_000;

/** Only persisted image media can become inline local image content. */
export function localUrlToDataUrl(input: string): string {
  if (/^data:image\/(?:jpeg|png|webp|gif);base64,/i.test(input)) return input.length <= 7_000_000 ? input : '';
  if (/^https?:\/\//i.test(input)) {
    try {
      const url = new URL(input);
      if (url.username || url.password || isPrivateIp(url.hostname) || /^(?:localhost|metadata)(?:\.|$)/i.test(url.hostname) || /\.(?:local|internal)$/i.test(url.hostname)) return '';
      return url.href;
    } catch { return ''; }
  }
  if (!input.startsWith('/storage/')) return '';
  const relative = input.slice('/storage/'.length);
  const workspaceId = getWorkspaceId();
  if (workspaceId && !isWorkspaceStorageRel(relative, workspaceId)) return '';
  const file = resolveStoredMediaPath(relative);
  if (!file || fs.statSync(file).size > 5_000_000) return '';
  const ext = path.extname(file).toLowerCase();
  const mime = new Map([['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.png', 'image/png'], ['.webp', 'image/webp'], ['.gif', 'image/gif']]).get(ext);
  if (!mime) return '';
  const data = fs.readFileSync(file);
  const valid = data.length >= 12 && (data[0] === 0xff && data[1] === 0xd8 || data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || data.toString('ascii', 0, 3) === 'GIF' || data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP');
  return valid ? `data:${mime};base64,${data.toString('base64')}` : '';
}

export async function resolveLocalVideoPath(input: string, signal?: AbortSignal): Promise<{ localPath: string; isTemp: boolean }> {
  signal?.throwIfAborted();
  const safe = assertSafeVideoPath(input);
  if (!/^https?:\/\//i.test(safe)) {
    if (!fs.existsSync(safe) || !fs.statSync(safe).isFile()) throw new Error('视频文件不存在，请重新上传');
    if (fs.statSync(safe).size > MAX_VIDEO_BYTES) throw new Error('视频超过 100MB 大小限制');
    return { localPath: safe, isTemp: false };
  }
  const directory = path.join(resolveStorageRoot(), toWorkspaceStorageKey('cache/video_downloads'));
  fs.mkdirSync(directory, { recursive: true });
  const localFile = path.join(directory, `vid_${createHash('sha256').update(safe).digest('hex')}.mp4`);
  // Validate before using a cache entry as well; URLs may change DNS targets.
  const { assertSafeRemoteUrl } = await import('../network/safeUrl');
  await assertSafeRemoteUrl(safe);
  if (fs.existsSync(localFile) && fs.statSync(localFile).size > 1024 && fs.statSync(localFile).size <= MAX_VIDEO_BYTES) return { localPath: localFile, isTemp: false };
  const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000);
  const { response, buffer } = await fetchSafeRemoteBytes(safe, { signal: requestSignal }, MAX_VIDEO_BYTES);
  if (!response.ok) throw new Error(`下载远程视频失败（HTTP ${response.status}）`);
  if (!buffer.length) throw new Error('远程视频内容为空');
  const temporary = `${localFile}.${randomUUID()}.tmp`;
  try { fs.writeFileSync(temporary, buffer, { mode: 0o600 }); fs.renameSync(temporary, localFile); }
  finally { fs.rmSync(temporary, { force: true }); }
  return { localPath: localFile, isTemp: false };
}
