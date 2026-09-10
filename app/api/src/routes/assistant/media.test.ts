import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { POST, cleanupAssistantMedia, RETENTION_MS } from './media';
import { GET } from '../system/local-media';
let directory: string;
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'assistant-media-test-'));
  vi.stubEnv('AZHUO_CACHE_DIR', directory);
});
afterEach(async () => { vi.useRealTimers(); vi.unstubAllEnvs(); await fs.rm(directory, { recursive: true, force: true }); });
describe('assistant image retention', () => {
  it('persists a real image across requests, keeps it after two days, expires after seven', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: 'red' } }).png().toBuffer();
    const response = await POST(new Request('http://localhost/api/assistant/media', { method: 'POST', body: png }));
    const { url, expiresAt } = await response.json();
    expect(response.status).toBe(200);
    expect(expiresAt).toBe(now + RETENTION_MS);
    vi.mocked(Date.now).mockReturnValue(now + 2 * 86400000);
    await cleanupAssistantMedia();
    const saved = await GET(new Request(`http://localhost${url}`));
    expect(saved.status).toBe(200);
    expect(saved.headers.get('cache-control')).toBe('private, no-store');
    expect((await sharp(Buffer.from(await saved.arrayBuffer())).metadata()).format).toBe('jpeg');
    vi.mocked(Date.now).mockReturnValue(expiresAt);
    expect((await GET(new Request(`http://localhost${url}`))).status).toBe(410);
    vi.restoreAllMocks();
  });
  it('cleans only expired chat attachments and preserves unrelated files', async () => {
    await fs.mkdir(path.join(directory, 'assistant-attachments'));
    const expired = '1700000000000-abcdef.jpg';
    const current = `${Date.now() + RETENTION_MS}-abcdef.jpg`;
    for (const name of [expired, current, 'unrelated.jpg']) await fs.writeFile(path.join(directory, 'assistant-attachments', name), 'test');
    await cleanupAssistantMedia();
    expect((await fs.readdir(path.join(directory, 'assistant-attachments'))).sort()).toEqual([current, 'unrelated.jpg'].sort());
  });
  it('rejects invalid image bytes without saving a broken attachment', async () => {
    expect((await POST(new Request('http://localhost/api/assistant/media', { method: 'POST', body: 'broken' }))).status).toBe(400);
  });
});
