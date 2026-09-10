import { test, expect } from '@playwright/test';

test('large prompt library keeps DOM bounded and searches/selects the full collection', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const fullPrompts = Array.from({ length: 731 }, (_, index) => ({
    id: `virtual-asset-${index}`, title: `测试资产 ${index}`, code: `R-${index}`,
    promptPreview: `提示词预览 ${index}`, tags: '', isFavorite: false,
  }));
  await page.route('**/api/catalog/assets/library?type=all&slim=1', (route) => route.fulfill({
    json: { success: true, fullPrompts, scenes: [], actions: [], outfits: [], personas: [] },
  }));
  await page.goto('/');
  await page.getByText('种草工坊', { exact: true }).click();
  await page.getByRole('button', { name: '提示词资产库', exact: true }).click();
  const cards = page.locator('[data-asset-grid] h3');
  await expect(cards.first()).toHaveText('测试资产 0');
  expect(await cards.count()).toBeLessThan(40);

  // The repositioned workshop button must not cover the category controls.
  const home = await page.getByTitle('原创种草工坊 · 点击返回首页').boundingBox();
  const category = await page.getByRole('button', { name: '完整提示词', exact: true }).boundingBox();
  expect(category!.y + category!.height).toBeLessThanOrEqual(home!.y);

  await page.locator('[data-asset-scroll]').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(cards.last()).toHaveText('测试资产 730');
  expect(await cards.count()).toBeLessThan(40);

  await page.getByText('批量管理', { exact: true }).click();
  await page.getByText('全选全部', { exact: true }).click();
  await expect(page.getByText(/已选中/)).toContainText('731 / 731');
  await page.getByText('退出管理', { exact: true }).click();

  const search = page.getByPlaceholder('搜索资产标题、特征、提示词...');
  await search.fill('测试资产 730');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveText('测试资产 730');
  await search.fill('不存在的资产');
  await expect(page.getByText('暂无相关提示词资产')).toBeVisible();
  await search.fill('');
  await expect(cards.first()).toHaveText('测试资产 0');

  await page.setViewportSize({ width: 800, height: 900 });
  await expect.poll(() => page.locator('[data-asset-grid] > [data-index]').first().evaluate(
    (element) => getComputedStyle(element).gridTemplateColumns.split(' ').length,
  )).toBe(2);
  expect(await cards.count()).toBeLessThan(40);
});
