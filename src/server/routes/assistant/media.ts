import { readResponseBodyLimited } from '../../core/readBodyLimited';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { resolveStorageRoot, toWorkspaceStorageKey } from '@server/infrastructure/storage/storagePaths';

export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export function attachmentExpiry(relativePath: string): number | undefined {
  const match = /(?:^|\/)assistant-attachments\/(\d{13})-[a-f0-9-]+\.(?:jpg|mp4|mov|webm)$/.exec(relativePath);
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
    const mime = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const video = ['video/mp4', 'video/quicktime', 'video/webm'].includes(mime);
    if (mime.startsWith('video/') && !video) return Response.json({ error: '目前支持 MP4、MOV 和 WebM 视频' }, { status: 415 });
    const read = await readResponseBodyLimited(new Response(req.body, { headers: req.headers }), video ? 100_000_000 : 6_000_000, req.signal);
    if (!read.ok) return Response.json({ error: '附件大小超过上限' }, { status: 413 });
    let extension = 'jpg';
    let media = read.buffer;
    if (video) {
      const webm = mime === 'video/webm';
      const validHeader = webm
        ? media.length >= 4 && media.readUInt32BE(0) === 0x1a45dfa3
        : media.length >= 12 && ['ftyp', 'moov', 'mdat', 'wide'].includes(media.toString('ascii', 4, 8));
      if (!validHeader) return Response.json({ error: '视频内容与文件格式不匹配' }, { status: 400 });
      extension = webm ? 'webm' : mime === 'video/quicktime' ? 'mov' : 'mp4';
    } else {
      media = await sharp(media, { limitInputPixels: 40_000_000 }).rotate().flatten({ background: '#fff' }).resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).timeout({ seconds: 30 }).toBuffer();
    }
    const expiresAt = Date.now() + RETENTION_MS;
    req.signal.throwIfAborted();
    const relative = toWorkspaceStorageKey(`assistant-attachments/${expiresAt}-${randomUUID()}.${extension}`);
    const target = path.join(resolveStorageRoot(), relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, media, { flag: 'wx', mode: 0o600 });
    return Response.json({ success: true, url: `/storage/${relative}`, expiresAt });
  } catch {
    return Response.json({ error: '附件保存失败，请重新载入后重试' }, { status: 400 });
  }
}
