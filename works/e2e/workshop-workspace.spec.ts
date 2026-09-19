import { test, expect } from '@playwright/test';

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:3000';
const DEV_TOKEN = process.env.LOCAL_ACCESS_TOKEN || process.env.VITE_APP_ACCESS_TOKEN || 'azhuo-local-dev';
const apiHeaders = { 'x-app-token': DEV_TOKEN, 'Content-Type': 'application/json' };

test('workshop input survives a full browser reload using the local API', async ({ page }) => {
  let generationRequests = 0;
  page.on('request', request => {
    if (request.method() === 'POST' && /\/api\/generate\/(image|analyze|copywriting)/.test(request.url())) generationRequests++;
  });
  await page.goto('/');
  await page.getByText('种草工坊', { exact: true }).click();
  const input = page.getByPlaceholder(/输入商品链接或纯数字 SKU/);
  await expect(input).toBeVisible();
  await expect(page.getByRole('status')).toContainText(/工作区已就绪|已恢复工作区|工作区已保存/, { timeout: 15_000 });
  const value = `https://item.jd.com/${Date.now()}.html`;
  await input.fill(value);
  await expect(page.getByRole('status')).toHaveText('工作区已保存', { timeout: 20_000 });
  await page.reload();
  // Current view may restore directly; otherwise enter from home.
  const homeEntry = page.getByText('种草工坊', { exact: true });
  if (await homeEntry.isVisible()) await homeEntry.click();
  await expect(input).toHaveValue(value);
  expect(generationRequests).toBe(0);
  const endpoint = `${API_BASE}/api/catalog/workshop-workspace?mode=original`;
  const stored = await (await page.request.get(endpoint, { headers: apiHeaders })).json();
  expect(stored.snapshot.batchInputText).toBe(value);
  const stale = await page.request.put(endpoint, { headers: apiHeaders, data: { revision: 0, snapshot: stored.snapshot } });
  expect(stale.status()).toBe(409);
  const wrongMode = await page.request.put(endpoint, { headers: apiHeaders, data: { revision: stored.revision, snapshot: { ...stored.snapshot, mode: 'replication' } } });
  expect(wrongMode.status()).toBe(400);
  expect((await (await page.request.get(endpoint, { headers: apiHeaders })).json()).revision).toBe(stored.revision);
});
