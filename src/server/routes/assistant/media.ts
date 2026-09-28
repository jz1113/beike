import { readResponseBodyLimited } from '../../core/readBodyLimited';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { resolveStorageRoot } from '../system/local-media';
import { toWorkspaceStorageKey } from '@server/infrastructure/storage/storagePaths';

export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export function attachmentExpiry(relativePath: string): number | undefined {
  const match = /(?:^|\/)assistant-attachments\/(\d{13})-[a-f0-9-]+\.jpg$/.exec(relativePath);
  return match ? Number(match[1]) : undefined;
}
export async function cleanupAssistantMedia(now = Date.now()) {
  const root = resolveStorageRoot();
  const names = await fs.readdir(root).catch(() => [] as string[]);
  const directories = [
    path.join(root, 'assistant-attachments'),
    ...names.map((name) => path.join(root, name, 'assistant-attachments')),
  ];
  await Promise.all(directories.map(async (directory) => {
    const files = await fs.readdir(directory).catch(() => [] as string[]);
    await Promise.all(files.map(async (name) => {
      const expiry = attachmentExpiry(`assistant-attachments/${name}`);
      if (expiry && expiry <= now) await fs.unlink(path.join(directory, name)).catch(() => {});
    }));
  }));
}
export async function POST(req: Request): Promise<Response> {
  try {
    const read = await readResponseBodyLimited(new Response(req.body, { headers: req.headers }), 6_000_000);
    if (!read.ok) return Response.json({ error: '附件大小超过上限' }, { status: 413 });
    const jpeg = await sharp(read.buffer, { limitInputPixels: 40_000_000 }).rotate().flatten({ background: '#fff' }).resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
    const expiresAt = Date.now() + RETENTION_MS;
    const relative = toWorkspaceStorageKey(`assistant-attachments/${expiresAt}-${randomUUID()}.jpg`);
    const target = path.join(resolveStorageRoot(), relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, jpeg, { flag: 'wx', mode: 0o600 });
    return Response.json({ success: true, url: `/storage/${relative}`, expiresAt });
  } catch {
    return Response.json({ error: '图片保存失败，请重新载入后重试' }, { status: 400 });
  }
}
