import { open, unlink } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';

import { resolveStorageRoot, safeResolveWithinRoot, resolveStoredMediaPath, isWorkspaceStorageRel } from '@beike/server-kit/storagePaths';
import { requireWorkspaceId } from '@beike/server-kit/workspaceContext';
import { listImageTaskWorkspaceIdsByResultUrl } from '../../repositories/system';
export { resolveStorageRoot } from '@beike/server-kit/storagePaths';

function guessContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

/** Only a single byte range is supported; malformed or unsatisfiable ranges return 416. */
function parseRange(value: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
  if (!match || (!match[1] && !match[2]) || size === 0) return null;
  const first = match[1] ? Number(match[1]) : null;
  const last = match[2] ? Number(match[2]) : null;
  if ((first !== null && !Number.isSafeInteger(first)) || (last !== null && !Number.isSafeInteger(last))) return null;
  if (first === null) {
    if (!last) return null;
    return { start: Math.max(0, size - last), end: size - 1 };
  }
  if (first >= size || (last !== null && last < first)) return null;
  return { start: first, end: Math.min(last ?? size - 1, size - 1) };
}

/**
 * GET /storage/*
 * 本地持久化媒体文件（与 persistDataUrlToStorage 返回的 /storage/... 路径对应）
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  // 安全：URL decode 二次处理（部分中间件只 decode 一次）
  let rel = url.pathname.replace(/^\/storage\/?/, '');
  try {
    rel = decodeURIComponent(decodeURIComponent(rel));
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const workspaceId = requireWorkspaceId();
  if (!isWorkspaceStorageRel(rel, workspaceId)) {
    // Old generated media was saved without a workspace prefix. Only its owning
    // workspace may read the exact URL already recorded on an image task.
    const legacyGeneratedMedia = /^generated\/(images|videos)\/local\/[a-f0-9]{64}\.(png|jpg|jpeg|webp|gif|avif|mp4|webm|mov)$/i.test(rel);
    if (!legacyGeneratedMedia) return new Response('Forbidden', { status: 403 });
    const owners = await listImageTaskWorkspaceIdsByResultUrl(`/storage/${rel}`);
    if (!owners.includes(workspaceId)) {
      // Some older browser-only generation tasks never reached ImageTask. Their
      // SHA-256 media URLs are opaque capabilities; keep them readable while
      // refusing URLs that are recorded as belonging to another workspace.
      if (owners.length > 0) return new Response('Forbidden', { status: 403 });
    }
  }
  const root = resolveStorageRoot();
  const safePath = safeResolveWithinRoot(root, rel);
  const absPath = safePath && (resolveStoredMediaPath(rel) || safePath);
  if (!absPath) {
    return new Response('Forbidden', { status: 403 });
  }

  let file;
  try {
    file = await open(absPath, 'r');
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code || '')) {
      return new Response('Not Found', { status: 404 });
    }
    throw error;
  }
  let streaming = false;
  try {
    const stat = await file.stat();
    if (!stat.isFile()) return new Response('Not Found', { status: 404 });
    const expiryMatch = /(?:^|\/)assistant-attachments\/(\d{13})-[a-f0-9-]+\.jpg$/.exec(rel);
    if (expiryMatch && Number(expiryMatch[1]) <= Date.now()) {
      await unlink(absPath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
      return new Response('附件已超过 7 天保存期限', { status: 410 });
    }
    const headers = new Headers({
      'Content-Type': guessContentType(absPath),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Accept-Ranges': 'bytes',
    });
    // No entity validator is issued, so If-Range cannot be matched: send the
    // complete representation instead. Range applies only to GET, not HEAD.
    const rangeHeader = req.method === 'GET' && !req.headers.has('if-range') ? req.headers.get('range') : null;
    const range = rangeHeader === null ? undefined : parseRange(rangeHeader, stat.size);
    if (range === null) {
      headers.set('Content-Range', `bytes */${stat.size}`);
      headers.set('Content-Length', '0');
      return new Response(null, { status: 416, headers });
    }
    const length = range ? range.end - range.start + 1 : stat.size;
    headers.set('Content-Length', String(length));
    if (range) headers.set('Content-Range', `bytes ${range.start}-${range.end}/${stat.size}`);
    const status = range ? 206 : 200;
    if (req.method === 'HEAD' || length === 0) return new Response(null, { status, headers });
    // autoClose and Readable.toWeb propagate completion/cancellation to the FD.
    const stream = file.createReadStream({ ...range, autoClose: true });
    const response = new Response(Readable.toWeb(stream, {
      strategy: { highWaterMark: 64 * 1024, size: (chunk: Uint8Array) => chunk.byteLength },
    }) as ReadableStream<Uint8Array>, { status, headers });
    streaming = true;
    return response;
  } finally {
    if (!streaming) await file.close();
  }
}
