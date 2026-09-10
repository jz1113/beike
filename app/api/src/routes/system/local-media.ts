import fs from 'node:fs';
import path from 'node:path';

import { resolveStorageRoot, safeResolveWithinRoot, resolveStoredMediaPath } from '@beike/server-kit/storagePaths';
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

  const root = resolveStorageRoot();
  const safePath = safeResolveWithinRoot(root, rel);
  const absPath = safePath && (resolveStoredMediaPath(rel) || safePath);
  if (!absPath) {
    return new Response('Forbidden', { status: 403 });
  }

  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
    return new Response('Not Found', { status: 404 });
  }

  const expiryMatch = /^assistant-attachments\/(\d{13})-[a-f0-9-]+\.jpg$/.exec(rel);
  if (expiryMatch && Number(expiryMatch[1]) <= Date.now()) {
    fs.unlinkSync(absPath);
    return new Response('附件已超过 7 天保存期限', { status: 410 });
  }
  const data = fs.readFileSync(absPath);
  return new Response(data, {
    status: 200,
    headers: {
      'Content-Type': guessContentType(absPath),
      'Cache-Control': expiryMatch ? 'private, no-store' : 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
