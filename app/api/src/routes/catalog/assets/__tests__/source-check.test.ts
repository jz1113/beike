import { beforeAll, expect, it, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { prisma, initializeDatabase } from '@beike/server-kit/prisma';
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), convert: vi.fn() }));
vi.mock('@beike/server-kit/apiaScraper', () => ({ resolveShortUrlRedirect: mocks.resolve }));
vi.mock('../deconstruct/visionCall', () => ({ convertImagesInBatches: mocks.convert }));
vi.mock('@beike/server-kit/imageConverter', () => ({ createCompactThumbnailDataUrl: async (url: string) => url, createCompactSourceImagesJson: async (urls: string[]) => JSON.stringify(urls) }));
import { releaseIncompleteSource } from '../source-check';
import catalog from '../../../mounts/catalog';
beforeAll(async () => { await initializeDatabase(); });
const app = new Hono();
app.route('/api/catalog', catalog);
const note = () => randomBytes(12).toString('hex');
const request = (path: string, body: unknown) => app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const check = (body: unknown) => request('/api/catalog/assets/source-check', body);
const submit = (body: unknown) => request('/api/catalog/assets/deconstruct', body);
const review = (body: unknown) => request('/api/catalog/assets/reviews', body);
const historical = () => app.request('/api/catalog/assets/source-check');
it('resolves a short link and a signed long link to the same existing note', async () => {
  const id = note(); const url = `https://www.xiaohongshu.com/explore/${id}?xsec_token=private`;
  await prisma.$executeRaw`INSERT INTO "PromptImportSource" ("sourceKey", "requestId", "state", "albumName", "updatedAt") VALUES (${`xhs:${id}`}, ${randomUUID()}, 'approved', 'existing album', 'now')`;
  mocks.resolve.mockResolvedValue(url);
  const response = await check({ urls: [url, 'https://xhslink.com/a/alias'] });
  const { data } = await response.json();
  expect(data).toHaveLength(2);
  expect(data.every((row: { state: string; sourceKey: string }) => row.state === 'approved' && row.sourceKey === `xhs:${id}`)).toBe(true);
});
it('allows only one concurrent analysis and releases a known failed attempt', async () => {
  const id = note();
  let release!: () => void; let entered!: () => void;
  const entry = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  mocks.convert.mockImplementationOnce(async () => { entered(); await gate; return []; });
  const body = { sourceUrl: `https://www.xiaohongshu.com/explore/${id}`, imageUrls: ['test'], model: 'gpt-4o', customBaseUrl: 'https://example.com', customApiKey: 'test', reviewRequestId: randomUUID() };
  const first = submit(body);
  await entry;
  const second = await submit({ ...body, reviewRequestId: randomUUID() });
  expect(second.status).toBe(409);
  release();
  expect((await first).status).toBe(400);
  const rows = await prisma.$queryRaw<unknown[]>`SELECT * FROM "PromptImportSource" WHERE "sourceKey" = ${`xhs:${id}`}`;
  expect(rows).toHaveLength(0);
});
it('approval saves a source once and records its existing album for future checks', async () => {
  const id = note(); const reviewId = randomUUID(); const albumName = randomUUID();
  const payload = JSON.stringify({ sourceKey: `xhs:${id}`, sourceRequestId: reviewId, albumName, parsedResult: {}, perImageResults: [{ image_index: 1, title: 'test', reverse_prompt_zh: 'test prompt' }], imageUrls: ['test:'+id], isSingleImage: true, category: 'general' });
  await prisma.$executeRaw`INSERT INTO "PromptImportSource" ("sourceKey", "requestId", "state", "albumName", "updatedAt") VALUES (${`xhs:${id}`}, ${reviewId}, 'pending', ${albumName}, 'now')`;
  await prisma.$executeRaw`INSERT INTO "DeconstructReview" ("id", "albumName", "payload", "status", "createdAt") VALUES (${reviewId}, ${albumName}, ${payload}, 'pending', 'now')`;
  expect((await review({ id: reviewId, action: 'approve' })).status).toBe(200);
  expect((await review({ id: reviewId, action: 'approve' })).status).toBe(200);
  expect(await prisma.fullPromptAsset.count({ where: { albumName } })).toBe(1);
  const response = await check({ urls: [`https://www.xiaohongshu.com/explore/${id}`] });
  expect((await response.json()).data[0]).toMatchObject({ state: 'approved', albumId: expect.any(String) });
});

it('reports historical exact-image groups without deleting or combining assets', async () => {
  const marker = randomUUID();
  const albums = await Promise.all([1, 2].map(i => prisma.promptAlbum.create({ data: { name: `duplicate ${i}`, sourceKey: `${marker}:${i}` } })));
  for (const album of albums) await prisma.fullPromptAsset.create({ data: { title: 'test', reversePromptZh: 'test', albumId: album.id, sourceImages: JSON.stringify([marker]) } });
  const result = await (await historical()).json();
  expect(result.data.some((group: { id: string }[]) => albums.every(album => group.some(row => row.id === album.id)))).toBe(true);
  expect(await prisma.fullPromptAsset.count({ where: { albumId: { in: albums.map(album => album.id) } } })).toBe(2);
});
it('reparsing an approved note updates the existing album instead of creating another one', async () => {
  const id = note(); const requestId = randomUUID();
  const album = await prisma.promptAlbum.create({ data: { name: 'original', sourceKey: randomUUID() } });
  await prisma.fullPromptAsset.create({ data: { title: 'original', reversePromptZh: 'old prompt', albumId: album.id, sourceImageIndex: 1 } });
  await prisma.$executeRaw`INSERT INTO "PromptImportSource" ("sourceKey", "requestId", "state", "albumName", "albumId", "updatedAt") VALUES (${`xhs:${id}`}, ${requestId}, 'pending', 'new title', ${album.id}, 'now')`;
  const payload = JSON.stringify({ sourceKey: `xhs:${id}`, sourceRequestId: requestId, albumName: 'new title', parsedResult: {}, perImageResults: [{ image_index: 1, title: 'new title', reverse_prompt_zh: 'new prompt' }], imageUrls: ['test:'+id], isSingleImage: true, category: 'general' });
  await prisma.$executeRaw`INSERT INTO "DeconstructReview" ("id", "albumName", "payload", "status", "createdAt") VALUES (${requestId}, 'new title', ${payload}, 'pending', 'now')`;
  expect((await review({ id: requestId, action: 'approve' })).status).toBe(200);
  const assets = await prisma.fullPromptAsset.findMany({ where: { albumId: album.id } });
  expect(assets).toHaveLength(1);
  expect(assets[0].reversePromptZh).toBe('new prompt');
});

it('clears abandoned processing records but retains live jobs and successful reviews', async () => {
  const abandoned = note(); const live = note(); const successful = note(); const reviewId = randomUUID();
  const old = new Date(Date.now() - 6 * 60 * 1000).toISOString();
  for (const [id, owner, at] of [[abandoned, randomUUID(), old], [live, randomUUID(), new Date().toISOString()], [successful, reviewId, old]]) {
    await prisma.$executeRaw`INSERT INTO "PromptImportSource" ("sourceKey", "requestId", "state", "albumName", "updatedAt") VALUES (${`xhs:${id}`}, ${owner}, 'processing', 'test', ${at})`;
  }
  await prisma.$executeRaw`INSERT INTO "DeconstructReview" ("id", "albumName", "payload", "status", "createdAt") VALUES (${reviewId}, 'successful review', '{}', 'pending', ${old})`;
  await releaseIncompleteSource(`xhs:${successful}`, reviewId);
  const response = await check({ urls: [abandoned, live, successful].map(id => `https://www.xiaohongshu.com/explore/${id}`) });
  const { data } = await response.json();
  expect(data.find((row: { sourceKey: string }) => row.sourceKey === `xhs:${abandoned}`).state).toBe('new');
  expect(data.find((row: { sourceKey: string }) => row.sourceKey === `xhs:${live}`).state).toBe('processing');
  expect(data.find((row: { sourceKey: string }) => row.sourceKey === `xhs:${successful}`).state).toBe('pending');
});
