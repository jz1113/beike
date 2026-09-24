import fs from 'node:fs';
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

  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
    return new Response('Not Found', { status: 404 });
  }

  const expiryMatch = /(?:^|\/)assistant-attachments\/(\d{13})-[a-f0-9-]+\.jpg$/.exec(rel);
  if (expiryMatch && Number(expiryMatch[1]) <= Date.now()) {
    fs.unlinkSync(absPath);
    return new Response('附件已超过 7 天保存期限', { status: 410 });
  }
  const data = fs.readFileSync(absPath);
  return new Response(data, {
    status: 200,
    headers: {
      'Content-Type': guessContentType(absPath),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
