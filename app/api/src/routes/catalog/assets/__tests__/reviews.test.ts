import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { prisma } from '@beike/server-kit/prisma';
import catalog from '../../../mounts/catalog';
vi.mock('@beike/server-kit/imageConverter', () => ({
  createCompactThumbnailDataUrl: async (url: string) => url,
  createCompactSourceImagesJson: async (urls: string[]) => JSON.stringify(urls),
}));
const app = new Hono();
app.route('/api/catalog', catalog);
it('keeps drafts out of library, supports restore, approves once and preserves review results', async () => {
  const id = randomUUID();
  const albumName = randomUUID();
  const payload = JSON.stringify({ albumName, parsedResult: {}, perImageResults: [{image_index:1, title:'review test', reverse_prompt_zh:'review prompt'}], imageUrls:['review-image:'+id], isSingleImage:true, category:'general', productCategoryId:null });
  await prisma.$executeRaw`INSERT INTO "DeconstructReview" (id, albumName, payload, status, createdAt) VALUES (${id}, ${albumName}, ${payload}, 'pending', ${new Date().toISOString()})`;
  expect(await prisma.fullPromptAsset.count({where:{albumName}})).toBe(0);
  const act = (action: string) => app.request('/api/catalog/assets/reviews', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id,action})});
  expect((await act('reject')).status).toBe(200);
  expect((await act('approve')).status).toBe(409);
  expect((await act('restore')).status).toBe(200);
  expect((await act('approve')).status).toBe(200);
  expect((await act('approve')).status).toBe(200);
  expect(await prisma.fullPromptAsset.count({where:{albumName}})).toBe(1);
  const pending = await (await app.request('/api/catalog/assets/reviews')).json();
  expect(pending.data.some((r:{id:string}) => r.id === id)).toBe(false);
});
