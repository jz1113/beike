import { test, expect } from '@playwright/test';

test('existing material and production draft survive reload without generation requests', async ({ page }) => {
  let generations = 0;
  page.on('request', request => {
    if (request.method() === 'POST' && /\/api\/generate\//.test(request.url())) generations++;
  });
  await page.goto('/');
  await page.getByText('新建项目', { exact: true }).click();
  await expect(page.getByRole('button', { name: '素材与分镜', exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: '素材与分镜', exact: true }).click();
  const modal = page.getByRole('dialog', { name: '素材与分镜', exact: true });
  await modal.getByLabel('批量提交已有素材').setInputFiles({
    name: '商品.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'),
  });
  await expect(modal.getByRole('status')).toContainText('已保存 1/1');
  const source = '开盒 | 2 | 桌面商品近景 | 缓慢打开盒盖';
  await modal.getByLabel('制作方案原文').fill(source);
  await modal.getByRole('button', { name: '提取分镜草稿' }).click();
  await modal.getByLabel('分镜1已有关键帧').selectOption({ label: '商品' });
  await modal.getByRole('button', { name: '创建分镜节点' }).click();
  await expect(modal.getByRole('status')).toContainText('已创建 2 个节点');
  await expect(modal.getByLabel('分镜1标题')).toBeDisabled();
  await page.screenshot({ path: '/tmp/beike-canvas-production.png', fullPage: true });
  await page.getByRole('button', { name: '关闭素材与分镜' }).click();
  await page.reload();
  const entry = page.getByRole('button', { name: '素材与分镜', exact: true });
  await expect(entry.or(page.getByText('商品', { exact: true }).first())).toBeVisible();
  if (!(await entry.isVisible())) await page.getByText('商品', { exact: true }).first().click();
  await entry.click();
  await expect(modal.getByLabel('制作方案原文')).toHaveValue(source);
  await expect(modal.getByLabel('分镜1标题')).toBeDisabled();
  await expect(modal.getByLabel('分镜1已有关键帧')).toContainText('商品');
  await modal.getByRole('button', { name: '创建分镜节点' }).click();
  await expect(modal.getByRole('status')).toContainText('没有待创建');
  expect(generations).toBe(0);
});
