import { test, expect } from '@playwright/test';

const DEV_TOKEN = process.env.LOCAL_ACCESS_TOKEN || process.env.VITE_APP_ACCESS_TOKEN || 'azhuo-local-dev';
const apiHeaders = { 'x-app-token': DEV_TOKEN };

test.describe('release smoke', () => {
  test('health and UI shell load', async ({ page }) => {
    const health = await page.request.get('http://127.0.0.1:3000/api/health', {
      headers: apiHeaders,
    });
    expect(health.ok()).toBeTruthy();

    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
    // 侧栏：首页 / 生成 / 工坊 / 资产
    await expect(page.getByText(/首页|生成|工坊|资产/).first()).toBeVisible({ timeout: 15_000 });
  });

  test('settings opens from sidebar/chrome', async ({ page }) => {
    await page.goto('/');
    const settingsBtn = page.getByRole('button', { name: /设置|Settings/i }).first();
    if (await settingsBtn.isVisible().catch(() => false)) {
      await settingsBtn.click();
      await expect(page.getByText(/API|接口|Comfly|网关/i).first()).toBeVisible({ timeout: 10_000 });
    }
  });

  test('assistant drawer can open', async ({ page }) => {
    await page.goto('/');
    const assistantBtn = page.getByRole('button', { name: /助手|Assistant|AI/i }).first();
    if (await assistantBtn.isVisible().catch(() => false)) {
      await assistantBtn.click();
      await expect(page.locator('textarea, [contenteditable="true"]').first()).toBeVisible({
        timeout: 10_000,
      });
    }
  });

  test('catalog products API responds', async ({ request }) => {
    const res = await request.get('http://127.0.0.1:3000/api/catalog/products', {
      headers: apiHeaders,
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('success');
  });

  test('generate image route rejects empty body', async ({ request }) => {
    const res = await request.post('http://127.0.0.1:3000/api/generate/image', {
      headers: { 'Content-Type': 'application/json', ...apiHeaders },
      data: {},
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });
});
