import { Hono } from 'hono';
import { expect, it } from 'vitest';
import catalog from '../catalog';
import { snapshotFixture } from '@beike/contracts/workshopWorkspace';

const app = new Hono();
app.route('/api/catalog', catalog);

it('exposes workshop workspace, reviews and source-check on the frontend URLs', async () => {
  const workspace = await app.request('/api/catalog/workshop-workspace?mode=original');
  expect(workspace.status).not.toBe(404);
  const reviews = await app.request('/api/catalog/assets/reviews');
  expect(reviews.status).not.toBe(404);
  const sourceCheck = await app.request('/api/catalog/assets/source-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls: [] }),
  });
  expect(sourceCheck.status).not.toBe(404);
});

it('rejects an invalid workshop mode through the mounted route', async () => {
  const response = await app.request('/api/catalog/workshop-workspace?mode=invalid');
  expect(response.status).toBe(400);
});

it('accepts a well-formed workspace snapshot schema from the shared fixture', () => {
  expect(snapshotFixture().mode).toBe('original');
});
