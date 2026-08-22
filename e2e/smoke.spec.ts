import { test, expect } from '@playwright/test';

test('health and UI shell load', async ({ page }) => {
  const health = await page.request.get('http://127.0.0.1:3000/api/health');
  expect(health.ok()).toBeTruthy();

  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();
});
