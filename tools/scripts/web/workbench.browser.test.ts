import { test, expect } from './browser-fixtures';

test('old video link and all four project choices work without submitting generation', async ({ page }) => {
  const frame = page.frameLocator('iframe[title="贝壳云图项目画布"]');
  await page.goto('/?view=video_sales');
  const dialog = page.getByRole('dialog', { name: '新建画布' });
  await expect(dialog.getByText(/电商视频已迁入画布/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(new URL(page.url()).searchParams.has('project')).toBe(false);
  for (const [title, node] of [
    ['商品短片', '商品短片分镜'], ['商品图文', '商品场景绘图提示词'],
    ['商品封面', '封面绘图提示词'], ['空白画布', null],
  ] as const) {
    await page.getByRole('button', { name: '新建画布', exact: true }).click();
    await dialog.getByRole('button', { name: new RegExp('^' + title) }).click();
    await expect(page.getByTitle('贝壳云图项目画布', { exact: true })).toBeVisible();
    if (node) {
      await expect(frame.getByText(node, { exact: true })).toBeVisible();
      await page.reload();
      await expect(frame.getByText(node, { exact: true })).toBeVisible();
    }
    await page.getByRole('button', { name: '返回首页' }).click();
    await page.getByRole('tab', { name: '画布', exact: true }).click();
  }
  await page.getByRole('button', { name: 'W3复刻模板', exact: true }).click();
  await expect(frame.getByTitle('01 上传参考视频', { exact: true })).toBeVisible();
  await expect(frame.getByRole('status', { name: '画布加载中' })).toBeHidden();
  await page.getByRole('button', { name: '一键运行W3复刻' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '01 上传参考视频' })).toBeVisible();
});

test('Agent restores the original turn after disconnect and refresh', async ({ page }) => {
  let original: { turnId: string; threadId: string } | undefined;
  let posts = 0;
  const queries: string[] = [];
  await page.route('**/api/assistant/turn/start', async route => {
    posts++;
    original = route.request().postDataJSON();
    await route.abort('connectionreset');
  });
  await page.route('**/api/assistant/turns/*/snapshot', async route => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2);
    queries.push(id || '');
    if (!original || id !== original.turnId) return route.abort();
    await route.fulfill({ json: { success: true, snapshot: {
      id, threadId: original.threadId, status: 'completed',
      items: [{ id: 'fixture-result', kind: 'agentMessage', status: 'done', content: '已恢复原任务结果' }],
    } } });
  });
  await page.goto('/');
  await page.getByRole('textbox', { name: '提示词' }).fill('断线验收：读取原回执');
  await page.getByRole('button', { name: '发送给 Agent 助手' }).click();
  const result = page.getByText('已恢复原任务结果', { exact: true });
  await expect(result).toBeVisible();
  await page.reload();
  await expect(result).toBeVisible();
  expect(posts).toBe(1);
  expect(queries).toEqual([original?.turnId]);
});
