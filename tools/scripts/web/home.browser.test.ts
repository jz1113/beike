import { test, expect } from './browser-fixtures';

// Exercise the rendered composer: pure state helpers do not catch mount effects overwriting it.
test('home video recreation preserves example parameters on the first click and after remount', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('beike_prompt_bar_preferences_v1', JSON.stringify({
      video: { aspect: '16:9', resolution: '480P', customDurationSec: 5 },
    }));
  });
  await page.goto('/');
  const applyVideo = async () => {
    await page.getByRole('tab', { name: '视频', exact: true }).click();
    await page.getByRole('button', { name: '穿搭开箱 · 连衣裙瞬间换装', exact: true }).click();
    await page.getByRole('button', { name: '做同款', exact: true }).click();
    await expect(page.getByRole('button', { name: '全能参考 · 9:16 · 720P · 10秒' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('让想法，动起来');
  };
  await applyVideo();
  await page.getByRole('button', { name: '画布', exact: true }).click();
  await page.getByRole('button', { name: '创作', exact: true }).click();
  await applyVideo();
});

test('home image recreation restores the configured model route, ratio and resolution', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('beike_modality_models_v1_image', JSON.stringify([
      { id: 'home-image-route', name: '首页测试图片模型', modelId: 'gpt-image-2', modality: 'image' },
    ]));
    localStorage.setItem('beike_prompt_bar_preferences_v1', JSON.stringify({
      image: { aspect: '9:16', resolution: '1K' },
    }));
  });
  await page.goto('/');
  await page.getByRole('button', { name: '山野都会 · 春季艾草面包', exact: true }).click();
  await page.getByRole('button', { name: '做同款', exact: true }).click();
  await expect(page.getByRole('button', { name: /2:3 · 4K/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'gpt-image-2 GPT Image 2', exact: true })).toHaveAttribute('title', '当前模型：gpt-image-2');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('把灵感，变成画面');
  await page.getByRole('button', { name: '画布', exact: true }).click();
  await page.getByRole('button', { name: '创作', exact: true }).click();
  await page.getByRole('button', { name: 'Agent模式', exact: true }).click();
  await page.getByRole('button', { name: '图片生成', exact: true }).click();
  await expect(page.getByRole('button', { name: /2:3 · 4K/ })).toBeVisible();
});

test('home initializes saved image and video preferences before switching creation modes', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('beike_prompt_bar_preferences_v1', JSON.stringify({
      image: { aspect: '3:2', resolution: '1K' },
      video: { aspect: '9:16', resolution: '1080P', customDurationSec: 8 },
    }));
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Agent模式', exact: true }).click();
  await page.getByRole('button', { name: '图片生成', exact: true }).click();
  await expect(page.getByRole('button', { name: /3:2 · 1K/ })).toBeVisible();
  await page.getByRole('button', { name: '图片生成', exact: true }).click();
  await page.getByRole('button', { name: '视频生成', exact: true }).click();
  await expect(page.getByRole('button', { name: '全能参考 · 9:16 · 1080P · 8秒' })).toBeVisible();
});

test('home warns when an example model is unavailable without selecting an invalid model', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '山野都会 · 春季艾草面包', exact: true }).click();
  await page.getByRole('button', { name: '做同款', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '案例模型 gpt-image-2 当前不可用' })).toBeVisible();
  await expect(page.getByRole('button', { name: '未配置模型', exact: true })).toBeVisible();
});

test('mobile conversations can reopen history, create a chat and close with focus restored', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const task = { id: 'agent-task-mobile', mediaType: 'agent', status: 'success', prompt: '手机历史消息', createdAt: Date.now() };
    localStorage.setItem('drawing_sessions', JSON.stringify([
      { id: 'mobile-chat', title: '手机已有对话', createdAt: Date.now(), tasks: [task] },
    ]));
  });
  await page.goto('/');
  const trigger = page.getByRole('button', { name: '对话', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '创作对话', exact: true });
  await expect(dialog.getByRole('button', { name: '手机已有对话', exact: true })).toBeVisible();
  const more = dialog.getByRole('button', { name: '手机已有对话更多操作', exact: true });
  await more.click();
  const actions = page.getByRole('dialog', { name: '对话操作', exact: true });
  await expect(actions.getByRole('button', { name: '置顶', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(actions).toBeHidden();
  await expect(dialog).toBeVisible();
  await expect(more).toBeFocused();
  await more.click();
  await actions.getByRole('button', { name: '重命名', exact: true }).click();
  const titleInput = dialog.getByRole('textbox', { name: '对话名称' });
  await titleInput.fill('不会保存的名称');
  await titleInput.press('Escape');
  await expect(titleInput).toBeHidden();
  await expect(dialog.getByRole('button', { name: '手机已有对话', exact: true })).toBeVisible();
  await expect(more).toBeFocused();
  await more.click();
  await actions.getByRole('button', { name: '删除', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: '确认删除「手机已有对话」', exact: true });
  await expect(confirmation).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(confirmation.getByRole('button', { name: '取消', exact: true }).last()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(confirmation).toBeHidden();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.getByRole('textbox', { name: '提示词' }).fill('首页未发送草稿');
  await trigger.click();
  await dialog.getByRole('button', { name: '手机已有对话', exact: true }).click();
  await expect(dialog).toBeHidden();
  const generatePanel = page.locator('[data-view-panel="generate"]');
  await expect(generatePanel).toBeVisible();
  await expect(generatePanel.getByRole('textbox', { name: '提示词' })).toHaveText('');
  await trigger.click();
  await dialog.getByRole('button', { name: '新建对话', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('手机历史消息', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: '创作', exact: true }).click();
  await expect(page.locator('.focus-container')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a document finishing after a new empty chat cannot enter the new draft', async ({ page }) => {
  let startExtraction!: () => void;
  let releaseExtraction!: () => void;
  const extraction = new Promise<void>(resolve => { startExtraction = resolve; });
  const release = new Promise<void>(resolve => { releaseExtraction = resolve; });
  await page.route('**/api/assistant/extract-document', async route => {
    startExtraction();
    await release;
    await route.fulfill({ json: { success: true, text: '旧草稿正文' } });
  });
  await page.goto('/');
  const composer = page.locator('[data-prompt-composer]:visible');
  await composer.locator('input[type="file"]').first().setInputFiles({
    name: '旧草稿.pdf', mimeType: 'application/pdf', buffer: Buffer.from('document fixture'),
  });
  await extraction;
  try {
    await expect(composer.getByRole('status')).toContainText('正在读取参考素材');
    await page.getByRole('button', { name: '新建对话', exact: true }).click({ timeout: 5000 });
    await expect(page.locator('[data-prompt-composer]:visible').getByText('正在读取参考素材…')).toHaveCount(0);
  } finally {
    releaseExtraction();
  }
  await expect(page.locator('[data-prompt-composer]:visible')).not.toContainText('旧草稿');
});

test('the home Agent sends the extracted document body', async ({ page }) => {
  await page.route('**/api/assistant/extract-document', route => route.fulfill({
    json: { success: true, text: '这是文档正文，不是文件名。' },
  }));
  await page.route('**/api/assistant/turn/start', route => route.fulfill({
    status: 400, json: { error: '测试已捕获请求' },
  }));
  await page.goto('/');
  const composer = page.locator('[data-prompt-composer]:visible');
  await composer.locator('input[type="file"]').first().setInputFiles({
    name: '创作要求.pdf', mimeType: 'application/pdf', buffer: Buffer.from('document fixture'),
  });
  await composer.getByRole('textbox', { name: '提示词' }).fill('请总结');
  const sent = page.waitForRequest('**/api/assistant/turn/start');
  await composer.getByRole('button', { name: '发送给 Agent 助手' }).click();
  expect((await sent).postDataJSON().messages.at(-1)).toMatchObject({
    content: '请总结',
    attachments: [{ type: 'document', name: '创作要求.pdf', extractedText: '这是文档正文，不是文件名。' }],
  });
});

test('a published text-only video clones without attaching its finished output', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('beike.homePublished', JSON.stringify([{ id: 'published-review', title: '发布参数回归', category: 'video', tag: '我的生成', prompt: '城市延时摄影', image: '/storage/local/browser-test/source.mp4', video: '/storage/local/browser-test/source.mp4', publishedKind: 'media', mediaType: 'video', model: 'doubao-seedance-2.0-mini', quality: '720P', aspectRatio: '9:16', videoDuration: 10, referenceImages: [], generateAudio: false }]));
  });
  await page.goto('/');
  await page.getByRole('tab', { name: '视频', exact: true }).click();
  await page.getByRole('button', { name: '发布参数回归', exact: true }).press('Enter');
  await page.getByRole('button', { name: '做同款', exact: true }).click();
  await expect(page.getByRole('button', { name: '全能参考 · 9:16 · 720P · 10秒' })).toBeVisible();
  await expect(page.locator('[data-prompt-composer]:visible [contenteditable="true"]')).toContainText('城市延时摄影');
  await expect(page.locator('[data-prompt-composer]:visible video')).toHaveCount(0);
});

test('canvas home shows why a recreation is unavailable in the open preview', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('beike.homePublished', JSON.stringify([{
      id: 'published-audio-reference',
      title: '含音频参考的作品',
      category: 'video',
      tag: '我的生成',
      prompt: '按音乐节奏剪辑',
      image: '/storage/local/browser-test/source.mp4',
      video: '/storage/local/browser-test/source.mp4',
      publishedKind: 'media',
      referenceAudioUrls: ['/audio.wav'],
    }]));
  });
  await page.goto('/');
  await page.getByRole('button', { name: '画布', exact: true }).click();
  await page.getByRole('button', { name: '含音频参考的作品', exact: true }).press('Enter');
  const preview = page.getByRole('dialog', { name: '含音频参考的作品' });
  await preview.getByRole('button', { name: '做同款', exact: true }).click();
  await expect(preview.getByRole('status')).toContainText('此作品包含参考音频');
  await preview.getByRole('button', { name: '用作参考素材', exact: true }).click();
  await expect(preview).toBeHidden();
  await expect(page.locator('[data-prompt-composer]:visible [contenteditable="true"]')).toBeFocused();
});

test('the home preview prevents generation shortcuts from submitting a background draft', async ({ page }) => {
  await page.goto('/');
  const composer = page.getByRole('textbox', { name: '提示词' });
  await composer.fill('弹窗背后的草稿');
  await page.getByRole('button', { name: '山野都会 · 春季艾草面包', exact: true }).click();
  const preview = page.getByRole('dialog');
  await expect(preview).toBeVisible();
  await page.keyboard.press('Control+Enter');
  await expect(preview).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(composer).toHaveText('弹窗背后的草稿');
});

test('home shows published edits in the open preview and dismisses an unpublished work', async ({ page, context }) => {
  const item = {
    id: 'published-across-tabs', title: '跨标签页作品', image: '/app_logo.png',
    category: 'photo', tag: '我的生成', prompt: '原始提示词', publishedKind: 'media',
  };
  await page.addInitScript(item => localStorage.setItem('beike.homePublished', JSON.stringify([item])), item);
  await page.goto('/');
  await page.getByRole('button', { name: item.title, exact: true }).click();
  await expect(page.getByRole('dialog', { name: item.title, exact: true })).toBeVisible();

  const otherTab = await context.newPage();
  await otherTab.goto('/');
  await otherTab.evaluate(item => {
    localStorage.setItem('beike.homePublished', JSON.stringify([{ ...item, title: '跨标签页新标题', prompt: '修改后的提示词' }]));
  }, item);
  const updated = page.getByRole('dialog', { name: '跨标签页新标题', exact: true });
  await expect(updated).toContainText('修改后的提示词');
  await otherTab.evaluate(() => localStorage.removeItem('beike.homePublished'));
  await expect(updated).toBeHidden();
  await expect(page.getByRole('button', { name: '跨标签页新标题', exact: true })).toHaveCount(0);
  await expect(page.getByRole('searchbox', { name: '搜索作品' })).toBeFocused();
  await otherTab.close();
});

test('home separates opening a broken work from retrying its media', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('beike.homePublished', JSON.stringify([{
    id: 'published-image-retry', title: '暂不可用的作品', image: '/browser-retry.png',
    category: 'photo', tag: '我的生成', prompt: '仍可读取的作品提示词', publishedKind: 'media',
  }])));
  let broken = true;
  await page.route('**/browser-retry.png', route => broken
    ? route.fulfill({ status: 404 })
    : route.fulfill({ path: 'src/client/public/app_logo.png' }));
  await page.goto('/');
  const retry = page.getByRole('button', { name: '重新加载', exact: true });
  await expect(retry).toBeVisible();
  const work = page.getByRole('button', { name: '暂不可用的作品', exact: true });
  await work.click();
  const preview = page.getByRole('dialog', { name: '暂不可用的作品' });
  await expect(preview).toContainText('仍可读取的作品提示词');
  await preview.getByRole('button', { name: '关闭作品预览' }).click();
  await expect(work).toBeFocused();
  broken = false;
  await retry.click();
  await expect(preview).toBeHidden();
  await expect(retry).toHaveCount(0);
  await expect.poll(() => page.locator('img[src="/browser-retry.png"]').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
});

test('home loads more works with the keyboard and focuses the first added card', async ({ page }) => {
  await page.goto('/');
  const cards = page.locator('[data-work-preview]');
  const more = page.getByRole('button', { name: '加载更多作品' });
  await expect(more).toBeAttached();
  const initialCount = await cards.count();
  expect(initialCount).toBeGreaterThan(0);
  await more.evaluate(button => button.focus({ preventScroll: true }));
  await page.keyboard.press('Enter');
  await expect(cards.nth(initialCount)).toBeFocused();
});
