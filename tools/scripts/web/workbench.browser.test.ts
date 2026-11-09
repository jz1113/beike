import { test, expect } from './browser-fixtures';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import type { CanvasQuickNodeType } from '../../../src/client/features/canvas/model/types';

test('canvas home shares the searchable inspiration feed and opens a published canvas workflow', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('beike.homePublished', JSON.stringify([{
      id: 'published-canvas-test', title: '画布展示样例', image: '/app_logo.png',
      category: 'photo', tag: '我的画布', prompt: '流程展示关键词', publishedKind: 'canvas',
      canvasNodes: [{ id: 'node-1', type: 'text', title: '创作流程节点', x: 0, y: 0, width: 240, height: 160 }],
    }]));
  });
  await page.goto('/?view=video_sales');
  await expect(page.getByRole('region', { name: '最近画布' })).toBeVisible();
  const search = page.getByRole('searchbox', { name: '搜索作品' });
  await expect(search).toBeVisible();
  await search.fill('流程展示关键词');
  const card = page.getByRole('button', { name: '画布展示样例' });
  await expect(card).toBeVisible();
  await expect(card.getByText('画布作品')).toBeVisible();
  await card.click();
  await page.getByRole('button', { name: '查看制作流程' }).click();
  await expect(page.getByText('创作流程节点')).toBeVisible();
  await page.getByRole('button', { name: '关闭画布' }).click();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
});

test('publishes, updates and removes a canvas video and its workflow snapshot', async ({ page }) => {
  const id = 'showcase-project';
  await page.addInitScript(id => {
    localStorage.setItem('beike_canvas_projects_store', JSON.stringify({ version: 0, state: { projects: [{
      id, title: '展示项目', createdAt: 1, updatedAt: 2,
      nodes: [
        { id: 'source', type: 'note', title: '创意', content: '原始创意', x: 0, y: 0, width: 260, height: 200, createdAt: 1 },
        { id: 'result', type: 'video', title: '成片', videoUrl: '/storage/local/browser-test/source.mp4', status: 'success', x: 320, y: 0, width: 260, height: 200, createdAt: 2 },
      ], edges: [{ id: 'edge', sourceNodeId: 'source', targetNodeId: 'result' }],
    }] } }));
  }, id);
  await page.goto('/?view=canvas&project=' + id);
  await expect(page.getByRole('status', { name: '画布加载中' })).toBeHidden();
  await page.getByRole('button', { name: '同步到作品流', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: '同步画布作品' });
  await expect(dialog.getByRole('button', { name: '同步到作品流' })).toBeDisabled();
  await dialog.getByLabel('成片视频').selectOption({ label: '成片 · 当前画面' });
  await expect(dialog.getByLabel('预览所选成片')).toBeVisible();
  await dialog.getByLabel('作品标题').fill('我的成片');
  await dialog.getByRole('button', { name: '同步到作品流' }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(page.getByRole('status', { name: '画布加载中' })).toBeHidden();
  await page.getByRole('button', { name: '同步到作品流', exact: true }).click();
  dialog = page.getByRole('dialog', { name: '同步画布作品' });
  await expect(dialog.getByLabel('成片视频')).toHaveValue('result:current');
  await dialog.getByLabel('作品标题').fill('更新后的成片');
  await dialog.getByRole('button', { name: '更新作品' }).click();
  await expect(dialog).toBeHidden();
  const items = await page.evaluate(() => JSON.parse(localStorage.getItem('beike.homePublished') || '[]'));
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ projectId: id, title: '更新后的成片', video: '/storage/local/browser-test/source.mp4' });
  expect(items[0].canvasNodes.find((node: { id: string }) => node.id === 'result').referenceNodeIds).toContain('source');
  await page.getByRole('button', { name: '返回主页' }).click();
  await page.getByRole('searchbox', { name: '搜索作品' }).fill('更新后的成片');
  await page.getByRole('button', { name: '更新后的成片' }).click();
  await expect(page.getByLabel('成片视频')).toBeVisible();
  await page.getByRole('button', { name: '查看制作流程' }).click();
  await expect(page.getByText('原始创意')).toBeVisible();
  await page.getByRole('button', { name: '关闭画布' }).click();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.goto('/?view=canvas&project=' + id);
  await expect(page.getByRole('status', { name: '画布加载中' })).toBeHidden();
  await page.getByRole('button', { name: '同步到作品流', exact: true }).click();
  await page.getByRole('button', { name: '从作品流移除' }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('beike.homePublished') || '[]'))).toEqual([]);
});

test('protects the built-in canvases and permanently removes a user canvas', async ({ page }) => {
  const backupKey = 'beike_canvas_projects_store';
  const userProject = { id: 'ordinary-canvas', title: '待删除画布', createdAt: 1, updatedAt: 1, nodes: [] };
  const otherProject = { ...userProject, id: 'other-canvas', title: '其他画布' };
  await page.addInitScript(({ key, projects }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ state: { projects }, version: 0 }));
  }, { key: backupKey, projects: [
    { ...userProject, id: 'canvas-proj-70fc9c00-d162-423f-b5bf-4d6be5860b0c', title: '电商视频' },
    { ...userProject, id: 'canvas-proj-0ce0a1ff-d832-4e8c-bdbc-4958e0173073', title: '视频复刻' },
    userProject, otherProject,
  ] });
  await page.goto('/?view=assets&tab=canvas');

  const titles = ['封面生成', '电商视频', '电商视频 · 新版', '电商图文'];
  for (const title of titles) {
    const trigger = page.getByRole('button', { name: `${title}的更多选项`, exact: true });
    await trigger.click();
    const menu = page.getByRole('menu', { name: `${title}的操作`, exact: true });
    await expect(menu.getByRole('menuitem', { name: '复制项目' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: '删除' })).toHaveCount(0);
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button', { name: '封面生成的更多选项', exact: true }).click();
  await page.getByRole('menuitem', { name: '复制项目' }).click();
  const copyMenu = page.getByRole('button', { name: '封面生成 副本的更多选项', exact: true });
  await copyMenu.click();
  await expect(page.getByRole('menuitem', { name: '删除' })).toBeVisible();
  await page.keyboard.press('Escape');

  const cacheName = `beike.studio.${userProject.id}.QiaodoumayiAssetCache`;
  await page.evaluate(name => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => { request.result.close(); resolve(); };
    request.onerror = () => reject(request.error);
  }), cacheName);
  await page.getByRole('button', { name: '待删除画布的更多选项', exact: true }).click();
  await page.getByRole('menuitem', { name: '删除' }).click();
  await page.getByRole('button', { name: '删除项目', exact: true }).click();
  await expect(page.getByRole('button', { name: '打开画布：待删除画布' })).toHaveCount(0);
  await expect.poll(() => page.evaluate(async ({ key, id }) => {
    const raw = localStorage.getItem(key);
    const backupIds = raw ? JSON.parse(raw).state.projects.map((project: { id: string }) => project.id) : [];
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('beike-canvas-projects');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const transaction = db.transaction(['projects', 'meta']);
      const project = transaction.objectStore('projects').get(id);
      const manifest = transaction.objectStore('meta').get(key);
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
      });
      return { backupIds, hasRecord: Boolean(project.result), listed: manifest.result?.ids.includes(id) };
    } finally { db.close(); }
  }, { key: backupKey, id: userProject.id })).toEqual({ backupIds: ['canvas-proj-70fc9c00-d162-423f-b5bf-4d6be5860b0c', 'canvas-proj-0ce0a1ff-d832-4e8c-bdbc-4958e0173073', otherProject.id], hasRecord: false, listed: false });

  await expect.poll(() => page.evaluate(async name => (await indexedDB.databases()).some(db => db.name === name), cacheName)).toBe(false);

  await page.reload();
  for (const title of [...titles, '其他画布', '封面生成 副本']) {
    await expect(page.getByRole('button', { name: `打开画布：${title}`, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: '打开画布：待删除画布' })).toHaveCount(0);
});

test('old video link opens the canvas home and creates an empty canvas', async ({ page }) => {
  await page.goto('/?view=video_sales');
  const recent = page.getByRole('region', { name: '最近画布' });
  await expect(recent.getByRole('button', { name: '新建画布', exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.has('project')).toBe(false);
  await recent.getByRole('button', { name: '新建画布', exact: true }).click();
  const viewport = page.getByTestId('canvas-viewport');
  await expect(viewport).toBeVisible();
  await expect(viewport.locator('[data-canvas-node-id]')).toHaveCount(0);


});

test('the built-in video copy canvas extracts local storyboards and generates from the approved prompt', async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 900 });
  let uploads = 0;
  let maskedSheetPath = '';
  const steps: string[] = [];
  const brief = '保留蓝色衣领，成片全程静音。';
  const script = '【全片一致性】同一人物与服装。【声音模式：静音】【全片一致性结束】\n【参考图制作要求】按原片0秒分镜绘制开场。【参考图制作要求结束】\n【视频片段 01｜时长 15 秒】\n开场画面：人物在窗前站立。\n本地时间轴：\n0–5秒：后退。\n5–10秒：转身。\n10–15秒：走近后停稳。\n结束状态：站稳。\n【视频片段结束】';
  await page.addInitScript(() => {
    localStorage.setItem('ai_base_url', 'https://ai.comfly.org');
    localStorage.setItem('ai_api_key', 'fixture-only');
    localStorage.setItem('beike_modality_models_v1_chat', JSON.stringify([
      { id: 'fixture-chat', name: '测试文本模型', modelId: 'gemini-3-flash-preview-thinking-128', modality: 'chat' },
    ]));
  });
  const openingImageUrl = 'https://example.invalid/opening-image.png';
  let openingImageAvailable = false;
  await page.route('**/api/system/proxy-image?*', route => {
    const url = new URL(route.request().url()).searchParams.get('url');
    if (url === openingImageUrl && !openingImageAvailable) return route.fulfill({ status: 403 });
    return route.fulfill({ path: 'src/client/public/app_logo.png' });
  });
  await page.route('**/api/generate/canvas-text', async route => {
    const body = route.request().postDataJSON();
    const analysis = body.beikeStoryboardAnalysis === true;
    steps.push(analysis ? 'analysis' : 'optimize');
    if (analysis) {
      const parts = body.messages[0].content;
      expect(parts.map((part: { type: string }) => part.type)).toEqual(['text', 'video_url', 'image_url', 'image_url', 'image_url', 'image_url']);
      expect(parts.some((part: { image_url?: { url: string } }) => part.image_url &&
        new URL(part.image_url.url, page.url()).pathname === maskedSheetPath)).toBe(true);
      const analysisPrompt = parts.find((part: { type: string }) => part.type === 'text').text;
      expect(analysisPrompt).toContain(brief);
      expect(analysisPrompt).toContain('@图片3');
      expect(analysisPrompt).not.toContain('canvas-node:');
    }
    await route.fulfill({ json: { success: true, operationKey: body.clientTaskId, text: script,
      choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: script } }] } });
  });
  await page.route('**/api/generate/image', async route => {
    steps.push('image');
    expect(route.request().postDataJSON().images).toHaveLength(4);
    await route.fulfill({ json: { success: true, status: 'SUCCESS', resultUrl: openingImageUrl } });
  });
  const resultUrl = '/storage/local/browser-test/timeline.mp4';
  await page.route(/\/api\/generate\/video(?:\?|$)/, async route => {
    expect(route.request().method()).toBe('POST');
    const body = route.request().postDataJSON();
    expect(body).toMatchObject({ ref_mode: 'omni', duration: 15, audio: false, videos: [] });
    expect(body.images).toHaveLength(5);
    steps.push('video');
    await route.fulfill({ json: { success: true, status: 'SUCCESS', resultUrl } });
  });
  await page.route('**/api/assets/storage/upload', async route => {
    expect(route.request().method()).toBe('POST');
    const category = route.request().postData()?.match(/name="category"\r\n\r\n([^\r\n]+)/)?.[1];
    expect(['generated/videos', 'canvas-storyboards', 'videos', 'assets']).toContain(category);
    if (category === 'canvas-storyboards') uploads++;
    await route.continue();
  });
  await page.goto('/?view=assets&tab=canvas');
  await page.getByRole('button', { name: '打开画布：电商视频 · 新版', exact: true }).click();
  const viewport = page.getByTestId('canvas-viewport');
  const prepare = page.getByRole('button', { name: '一键准备深度复刻' });
  const source = viewport.locator('[data-canvas-node-id$="-source"]');
  const videoPath = join(process.env.BEIKE_BROWSER_DATA_DIR!, 'storage/local/browser-test/source.mp4');
  await source.getByLabel('选择素材文件').setInputFiles(videoPath);
  await expect(page.getByText(/已抽取31帧、2页/)).toBeVisible({ timeout: 30_000 });
  expect(uploads).toBe(2);
  await page.reload();
  await expect(source).toHaveAttribute('data-node-kind', 'video');
  const player = source.locator('.simple-video-player');
  const originalVideo = player.locator('video');
  await expect.poll(() => originalVideo.evaluate(video => Number.isFinite(video.duration) ? video.duration : 0)).toBeGreaterThan(15);
  await player.focus();
  await player.hover();
  const progress = player.getByRole('slider', { name: '播放进度' });
  await expect(progress).toBeVisible();
  const track = (await progress.boundingBox())!;
  const hit = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    return { slider: !!element?.closest('[role="slider"]'), node: element?.closest('[data-canvas-node-id]')?.getAttribute('data-canvas-node-id'), element: element?.outerHTML.slice(0, 180), x, y };
  }, { x: track.x + track.width * 0.2, y: track.y + track.height / 2 });
  expect(hit, JSON.stringify(hit)).toMatchObject({ slider: true });
  await page.mouse.move(track.x + track.width * 0.2, track.y + track.height / 2);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width * 0.7, track.y + track.height / 2, { steps: 5 });
  await page.mouse.up();
  const readTime = () => originalVideo.evaluate(video => video.currentTime);
  await expect.poll(readTime).toBeGreaterThan(9);
  await progress.press('Home');
  await expect.poll(readTime, { timeout: 3_000 }).toBeLessThan(0.1);
  await progress.press('ArrowRight');
  await expect.poll(readTime).toBeGreaterThan(0.9);
  for (const index of [1, 2]) {
    await expect(viewport.getByRole('button', { name: `选择连线 source · 分镜图${index}（人脸已处理） → 05 分析原片分镜` })).toHaveCount(1);
  }
  await prepare.click();
  await expect(page.getByRole('alert').filter({ hasText: '商品' })).toBeVisible();
  expect(uploads).toBe(2);
  expect(steps).toEqual([]);
  await page.mouse.move(1400, 650);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(1400, 770, { steps: 6 });
  await page.mouse.up({ button: 'middle' });
  await originalVideo.click({ timeout: 5_000 });
  await source.getByRole('button', { name: '工具', exact: true }).click({ timeout: 5_000 });
  const videoTools = source.locator('[data-input-image-tools-menu]');
  for (const name of ['提取首帧', '提取当前帧', '提取分镜图']) {
    await expect(videoTools.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await expect(videoTools.getByRole('button', { name: '提取首尾帧', exact: true })).toHaveCount(0);
  await expect(source.getByRole('button', { name: '提取视频帧', exact: true })).toHaveCount(0);
  const sheetImage = viewport.getByRole('img', { name: 'source · 分镜图1（人脸已处理）', exact: true });
  await videoTools.getByRole('button', { name: '提取首帧', exact: true }).click();
  const firstFrame = viewport.getByRole('img', { name: 'source-首帧', exact: true });
  await expect(firstFrame).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
  const firstFrameBounds = (await firstFrame.boundingBox())!;
  const sheetBounds = (await sheetImage.boundingBox())!;
  expect(firstFrameBounds.y).toBeGreaterThanOrEqual(sheetBounds.y + sheetBounds.height);
  await sheetImage.locator('xpath=ancestor::div[contains(@class,"canvas-media-surface")][1]').click({ timeout: 5_000 });
  const sheet = sheetImage.locator('xpath=ancestor::*[@data-canvas-node-id][1]');
  const previousSheet = await sheetImage.getAttribute('src');
  await sheet.getByRole('button', { name: '工具', exact: true }).click({ timeout: 5_000 });
  const imageTools = sheet.locator('[data-input-image-tools-menu]');
  const typography = await imageTools.getByRole('button').evaluateAll(buttons => buttons.map(button => {
    const { fontSize, fontWeight, lineHeight } = getComputedStyle(button);
    return [fontSize, fontWeight, lineHeight];
  }));
  expect(new Set(typography.map(value => value.join('|'))).size).toBe(1);
  await imageTools.getByRole('button', { name: '人脸打码' }).click({ timeout: 5_000 });
  const maskDialog = page.getByRole('dialog', { name: '人脸打码' });
  const surface = maskDialog.getByLabel('分镜打码画布');
  await expect(surface).toBeVisible();
  const bounds = (await surface.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.6, bounds.y + bounds.height / 2);
  await page.mouse.up();
  const pixel = await surface.evaluate(element => {
    const canvas = element as HTMLCanvasElement;
    return Array.from(canvas.getContext('2d')!.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data);
  });
  expect(pixel).toEqual([37, 37, 37, 255]);
  await maskDialog.getByRole('button', { name: '保存打码' }).click();
  await expect(maskDialog).toBeHidden();
  await expect(sheetImage).not.toHaveAttribute('src', previousSheet!);
  maskedSheetPath = new URL((await sheetImage.getAttribute('src'))!, page.url()).pathname;
  for (const role of ['product', 'person']) {
    const input = viewport.locator(`[data-canvas-node-id$="-${role}"]`);
    const dataTransfer = await page.evaluateHandle(role => {
      const transfer = new DataTransfer();
      transfer.setData('application/x-beike-library-media', JSON.stringify({
        name: role, kind: 'image', url: new URL('/app_logo.png?' + role, location.origin).href,
      }));
      return transfer;
    }, role);
    await input.getByLabel('选择素材文件').locator('..').dispatchEvent('drop', { dataTransfer });
    await dataTransfer.dispose();
    await expect(input).toHaveAttribute('data-node-kind', 'image');
  }
  const briefEditor = viewport.locator('[data-canvas-node-id$="-brief"]').getByRole('textbox', { name: '文本内容' });
  await briefEditor.dblclick({ timeout: 5_000 });
  await briefEditor.fill(brief, { timeout: 5_000 });
  await viewport.locator('[data-canvas-node-id$="-analysis"]').dispatchEvent('click');
  const orderedReferences = page.getByRole('button', { name: /^引用(?:视频|图片|文本)\d+$/ });
  await expect(orderedReferences).toHaveCount(6);
  expect(await orderedReferences.evaluateAll(items => items.map(item => item.getAttribute('aria-label'))))
    .toEqual(['引用视频1', '引用图片2', '引用图片3', '引用图片4', '引用图片5', '引用文本1']);
  const sourceThumbnail = page.getByRole('button', { name: '引用视频1' }).locator('video');
  await expect.poll(() => sourceThumbnail.evaluate(video => video.videoWidth)).toBeGreaterThan(0);
  await page.getByRole('button', { name: '引用图片3' }).click();

  await prepare.click();
  const approval = page.getByRole('dialog', { name: '确认视频提示词' });
  await expect(approval).toBeVisible({ timeout: 20_000 });
  await approval.getByRole('button', { name: '确认保存07提示词' }).click();
  await expect(page.getByText('提示词已确认，可到 08 手动生成视频。')).toBeVisible();
  expect(steps).toEqual(['analysis', 'image', 'optimize']);
  const opening = viewport.locator('[data-canvas-node-id$="-keyframe"]');
  await expect(opening.getByText('结果图片无法加载')).toBeVisible();
  await expect(opening.getByRole('img', { name: '绘图结果' })).toHaveCount(0);
  await expect(opening.locator('[data-input-image-toolbar]')).toBeHidden();
  openingImageAvailable = true;
  await opening.getByRole('button', { name: '重试加载图片' }).dispatchEvent('click');
  const openingImage = opening.getByRole('img', { name: '绘图结果' });
  await expect.poll(() => openingImage.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  expect(steps).toEqual(['analysis', 'image', 'optimize']);
  const video = viewport.locator('[data-canvas-node-id$="-video"]');
  await video.getByTestId('drawing-preview').click();
  await page.getByRole('button', { name: '开始生成视频' }).click();
  await expect(video.locator('video')).toHaveAttribute('src', new RegExp(resultUrl));
  await expect(viewport.locator('[data-canvas-node-id$="-preview"] video')).toHaveAttribute('src', new RegExp(resultUrl));
  expect(steps).toEqual(['analysis', 'image', 'optimize', 'video']);
  const exportButton = viewport.locator('[data-canvas-node-id$="-save"]').getByRole('button', { name: '一键导出全部素材 (1)' });
  await expect(exportButton).toBeEnabled();
  const downloaded = page.waitForEvent('download', { timeout: 10_000 });
  await exportButton.dispatchEvent('click');
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/\.mp4$/);
  expect(await readFile(await download.path())).toEqual(await readFile(join(process.env.BEIKE_BROWSER_DATA_DIR!, resultUrl)));
  await page.keyboard.press('Escape');

  const compose = viewport.locator('[data-canvas-node-id$="-compose"]');
  await compose.getByTestId('drawing-preview').click({ timeout: 5_000 });
  await page.getByRole('button', { name: '开始生成视频' }).click({ timeout: 5_000 });
  const composed = compose.locator('video');
  await expect(composed).toHaveAttribute('src', /\/storage\/.*\.webm/, { timeout: 25_000 });
  const output = new URL((await composed.getAttribute('src'))!, page.url()).pathname;
  const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0',
    join(process.env.BEIKE_BROWSER_DATA_DIR!, output)], { encoding: 'utf8' });
  expect(probe.trim().split('\n').sort()).toEqual(['audio', 'video']);
  expect(steps).toEqual(['analysis', 'image', 'optimize', 'video']);
  await page.route('**/api/system/depth-env', route => route.fulfill({ json: { depthModelReady: true } }));
  await page.route('**/api/generate/depth-video**', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { success: true, status: 'SUCCESS', resultUrl } });
      return;
    }
    const body = route.request().postData() || '';
    const resolution = body.match(/name="resolution"\r\n\r\n(480p|720p)/)?.[1];
    expect(resolution).toBeDefined();
    expect(body).toContain(`name="quality"\r\n\r\n${resolution === '720p' ? 'high' : 'standard'}`);
    expect(body).toContain('name="style"\r\n\r\nmocap');
    steps.push(`depth-${resolution}`);
    await route.fulfill({ json: { success: true, status: 'IN_PROGRESS', taskId: `depth-${resolution}` } });
  });
  for (const resolution of ['480p', '720p']) {
    await originalVideo.click({ timeout: 5_000 });
    await source.getByRole('button', { name: '工具', exact: true }).click({ timeout: 5_000 });
    await videoTools.getByRole('button', { name: `深度视频 · ${resolution}`, exact: true }).click({ timeout: 5_000 });
    const depthNode = viewport.locator('[data-canvas-node-id]').filter({ hasText: `深度视频 · ${resolution}` });
    await expect(depthNode.locator('video')).toHaveAttribute('src', new RegExp(resultUrl), { timeout: 15_000 });
  }
  expect(steps).toEqual(['analysis', 'image', 'optimize', 'video', 'depth-480p', 'depth-720p']);
  const analysisNode = viewport.locator('[data-canvas-node-id$="-analysis"]');
  await analysisNode.dispatchEvent('click');
  const referenceInput = page.locator('input[accept="image/*,video/*"][multiple]');
  await referenceInput.setInputFiles(videoPath);
  await expect(page.getByText('05逐镜分析只接受01原片，请在01节点替换视频')).toBeVisible();
  await referenceInput.setInputFiles({ name: '持久化参考图.png', mimeType: 'image/png', buffer: await readFile('src/client/public/app_logo.png') });
  const extraReference = page.getByRole('button', { name: '引用图片6' });
  await expect(extraReference.locator('img')).toHaveAttribute('src', /\/storage\//);
  await page.reload();
  await analysisNode.dispatchEvent('click');
  await expect(extraReference.locator('img')).toHaveAttribute('src', /\/storage\//);


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

test('native canvas boots, zooms at the pointer, and opens the node palette', async ({ page }) => {
  await page.goto('/?view=video_sales');
  await page.getByRole('region',{name:'最近画布'}).getByRole('button',{name:'新建画布',exact:true}).click();

  const viewport = page.getByTestId('canvas-viewport');
  await expect(viewport).toBeVisible();
  await expect(page.getByRole('status', { name: '画布加载中' })).toBeVisible();
  await expect(page.getByRole('status', { name: '画布加载中' })).toBeHidden();
  await expect(page.getByRole('complementary', { name: '画布导航' })).toBeVisible();
  await expect(page.locator('iframe[title="贝壳云图项目画布"]')).toHaveCount(0);
  await expect(page.getByRole('button', {name:'返回主页', exact:true})).toHaveCSS('height', '40px');
  await expect(page.getByTestId('canvas-download-entry')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '文本工具', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '个人记忆', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '涂鸦画笔', exact: true })).toHaveCount(0);
  for (const key of ['t', 'b', 'e']) {
    await page.keyboard.press(key);
    await expect(page.getByTestId('canvas-tool-surface')).toHaveCount(0);
  }
  await expect(page.getByRole('button', { name: '本地资料查阅', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', {name:'返回首页', exact:true})).toHaveCount(0);
  await expect(page.getByRole('button', {name:'项目库', exact:true})).toHaveCount(0);


  const pattern = viewport.locator('[data-canvas-world-grid] pattern');
  const bounds = (await viewport.boundingBox())!;
  const anchor = { x: Math.round(bounds.width * 0.68), y: Math.round(bounds.height * 0.36) };
  await expect(pattern).toHaveAttribute('width', '20');
  await page.getByRole('button', { name: '缩放 100%' }).click();
  const slider = page.getByRole('slider', { name: '缩放比例' });
  await expect(slider).toHaveValue('100');
  await page.mouse.move(bounds.x + anchor.x, bounds.y + anchor.y);
  for (const [delta, percent] of [[-100, 105], [-100, 110], [300, 105], [20, 104], [100, 99]]) {
    await page.mouse.wheel(0, delta);
    await expect(page.getByRole('button', { name: `缩放 ${percent}%` })).toBeVisible();
    await expect(slider).toHaveValue(String(percent));
    const transform = await pattern.evaluate(element => ({
      x: Number(element.getAttribute('x')),
      y: Number(element.getAttribute('y')),
      zoom: Number(element.getAttribute('width')) / 20,
    }));
    expect(transform.zoom).toBeCloseTo(percent / 100, 6);
    expect(transform.x).toBeCloseTo((anchor.x * (1 - transform.zoom)) % (20 * transform.zoom));
    expect(transform.y).toBeCloseTo((anchor.y * (1 - transform.zoom)) % (20 * transform.zoom));
  }
  const track = (await slider.boundingBox())!;
  await page.mouse.move(track.x + track.width * 0.45, track.y + track.height / 2);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width * 0.72, track.y + track.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => Number(await slider.inputValue())).toBeGreaterThan(145);
  const draggedPercent = Number(await slider.inputValue());
  await expect(page.getByRole('button', { name: `缩放 ${draggedPercent}%` })).toBeVisible();
  await expect.poll(async () => Number(await pattern.getAttribute('width')) / 20).toBeCloseTo(draggedPercent / 100, 6);
  await slider.press('ArrowLeft');
  await expect(slider).toHaveValue(String(draggedPercent - 1));
  await expect(page.getByRole('button', { name: `缩放 ${draggedPercent - 1}%` })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(slider).toBeHidden();

  await viewport.dblclick({ position: { x: 180, y: 180 } });
  const palette = page.getByRole('dialog', { name: '添加节点' });
  await palette.getByRole('menuitem', { name: '文本' }).click();
  const node = viewport.locator('[data-canvas-node-id]');
  await expect(node).toHaveCount(1);
  await expect(node).toHaveAttribute('data-node-selected', 'true');
  await expect(page.getByTestId('canvas-download-entry')).toHaveCount(0);
  await page.getByRole('button',{name:'更多工具',exact:true}).click();
  await page.getByRole('button',{name:'导出项目',exact:true}).click();
  const exportDialog = page.getByRole('dialog',{name:'导出画布项目'});
  await expect(exportDialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(exportDialog).toBeHidden();
  const toggleMap = page.getByRole('button',{name:'画布小地图'});
  await toggleMap.click();
  await expect(page.getByRole('complementary',{name:'画布导航'})).toHaveCount(0);
  await toggleMap.click();
  await expect(page.getByRole('complementary',{name:'画布导航'})).toBeVisible();
  await page.getByRole('button',{name:'更多工具',exact:true}).click();
  const archiveMenu = page.getByRole('dialog', { name: '更多工具' });
  await expect(archiveMenu.getByRole('button')).toHaveText(['导出项目', '导入与恢复项目']);
  await archiveMenu.getByRole('button', { name: '导入与恢复项目' }).click();
  const importDialog = page.getByRole('dialog', { name: '导入与恢复画布项目' });
  await expect(importDialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(importDialog).toBeHidden();

  const minimap = page.getByRole('img', { name: '点击缩略图定位画布' });
  const map = (await minimap.boundingBox())!;
  const oldOffset = await pattern.getAttribute('x');
  await page.mouse.move(map.x + map.width / 2, map.y + map.height / 2);
  await page.mouse.down();
  await page.mouse.move(map.x + map.width / 2 + 12, map.y + map.height / 2, { steps: 3 });
  await page.mouse.up();
  await expect(pattern).not.toHaveAttribute('x', oldOffset!);
});

test('native canvas connects a selection and supports reverse port dragging', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const project = {
    id: 'connection-fixture', title: '连线测试', createdAt: 1, updatedAt: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [100, 420, 740].map((x, index) => ({
      id: 'connection-' + index, type: 'note', title: '节点 ' + index,
      x, y: 230, width: 180, height: 120, createdAt: 1,
    })),
  };
  await page.addInitScript(value => {
    localStorage.setItem('beike_canvas_projects_store', JSON.stringify({ state: { projects: [value] }, version: 0 }));
  }, project);
  await page.goto('/?view=canvas&project=' + project.id);
  const viewport = page.getByTestId('canvas-viewport');
  const nodes = viewport.locator('[data-canvas-node-id]');
  await expect(nodes).toHaveCount(3);
  const nodeIds = project.nodes.map(node => node.id);
  const ports = (id: string | null, side: string) => viewport.locator(`[data-port-node="${id}"].connector-${side}`);
  const drag = async (from: ReturnType<typeof ports>, to: ReturnType<typeof ports>) => {
    const a = (await from.boundingBox())!;
    const b = (await to.boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
    await page.mouse.up();
  };
  await nodes.nth(0).click({ position: { x: 20, y: 15 } });
  await nodes.nth(1).click({ position: { x: 20, y: 15 }, modifiers: ['Shift'] });
  await drag(ports(nodeIds[1], 'right'), ports(nodeIds[2], 'left'));
  const edges = viewport.locator('[data-connection-edge][role="button"]');
  await expect(edges).toHaveCount(2);
  await drag(ports(nodeIds[1], 'left'), ports(nodeIds[0], 'right'));
  await expect(edges).toHaveCount(3);
  await drag(ports(nodeIds[2], 'right'), ports(nodeIds[0], 'left'));
  await expect(page.getByRole('status').filter({ hasText: '形成循环' })).toBeVisible();
  await expect(edges).toHaveCount(3);
});

test('native canvas timeline matches reference cut and trim positions on the shared 12-second source', async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  const project={id:'timeline-fixture',title:'时间线实测',createdAt:1,updatedAt:1,viewport:{x:0,y:0,zoom:1},nodes:[
    {id:'source',type:'video',videoUrl:'/storage/local/browser-test/timeline.mp4',title:'测试片段',x:100,y:100,width:160,height:90,createdAt:1},
    {id:'timeline',type:'drawing',generationKind:'video',studioSubType:'video-timeline',title:'剪辑时间线',x:160,y:260,width:700,height:220,referenceNodeIds:['source'],createdAt:1,
      timelineClips:[{id:'clip-1',nodeId:'source',url:'/storage/local/browser-test/timeline.mp4',title:'测试片段',duration:12}]},

  ]};
  await page.addInitScript(value=>{
    if (!sessionStorage.getItem('timeline-fixture-seeded')) {
      localStorage.setItem('beike_canvas_projects_store',JSON.stringify({state:{projects:[value]},version:0}));
      sessionStorage.setItem('timeline-fixture-seeded','1');
    }
  },project);
  await page.goto('/?view=canvas&project=timeline-fixture');
  const track=page.getByTestId('timeline-track');
  const clips=page.getByTestId('timeline-clip');
  const time=page.getByLabel('播放头');
  await expect(clips).toHaveCount(1);
  await expect(time).toHaveText('0.000 / 12.000 秒');
  await page.getByLabel('剪辑时间线',{exact:true}).focus();
  const box=(await track.boundingBox())!;
  const scrub=async(seconds:number)=>page.mouse.click(box.x+box.width*seconds/20,box.y+8);
  await scrub(0);
  await page.keyboard.press('c');
  await expect(clips).toHaveCount(1);
  for(let i=0;i<5;i++)await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Control+b');
  await expect(clips).toHaveCount(2);
  await expect(clips.first()).toHaveAttribute('data-out','5');
  await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await page.keyboard.press('q');
  await expect(clips.last()).toHaveAttribute('data-in','7');
  await page.keyboard.press('w');
  await expect(clips.last()).toHaveAttribute('data-out','9');
  await scrub(5.12);
  await expect(time).toHaveText('5.000 / 7.000 秒');
  await page.keyboard.press('n');
  await scrub(5.12);
  await expect(time).not.toHaveText('5.000 / 7.000 秒');
  await expect.poll(()=>page.evaluate(()=>new Promise(resolve=>{
    const request=indexedDB.open('beike-canvas-projects');
    request.onerror=()=>resolve(undefined);
    request.onsuccess=()=>{
      const db=request.result;
      const get=db.transaction('projects').objectStore('projects').get('timeline-fixture');
      get.onsuccess=()=>{resolve(get.result?.nodes.find((node:{id:string})=>node.id==='timeline')?.timelineSnap);db.close();};
      get.onerror=()=>{resolve(undefined);db.close();};
    };
  }))).toBe(false);
  await page.reload();
  await expect(clips.last()).toHaveAttribute('data-in','7');
  await expect(clips.last()).toHaveAttribute('data-out','9');
  await expect(page.getByRole('button',{name:'吸附'})).toHaveAttribute('aria-pressed','false');
  const edge=(await clips.last().getByRole('button',{name:'拖动出点'}).boundingBox())!;
  const currentTrack=(await track.boundingBox())!;
  await page.mouse.move(edge.x+edge.width/2,edge.y+edge.height/2);
  await page.mouse.down();
  await page.mouse.move(edge.x+edge.width/2+currentTrack.width/20,edge.y+edge.height/2,{steps:5});
  await page.mouse.up();
  await expect.poll(async()=>Math.abs(Number(await clips.last().getAttribute('data-out'))-10)).toBeLessThan(0.05);
});

test('native canvas opens the existing media library and replaces a file node in place', async ({page}) => {
  await page.addInitScript(()=>{
    localStorage.setItem('beike.custom_assets',JSON.stringify([{id:'asset-fixture',category:'file',name:'测试素材',mediaKind:'image',mediaUrl:new URL('/app_logo.png',location.origin).href,createdAt:1,updatedAt:1}]));
  });
  await page.route('**/api/system/proxy-image?*',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZuoAAAAASUVORK5CYII=', 'base64')}));
  await page.route('**/api/catalog/assets/library?*',route=>route.fulfill({json:{success:true,assets:[],data:[],total:0}}));
  await page.route('**/api/sales/studio-assets',route=>route.fulfill({json:{success:true,assets:[]}}));
  await page.route('**/api/sales/scripts',route=>route.fulfill({json:{success:true,scripts:[]}}));
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/?view=video_sales');
  await page.getByRole('region',{name:'最近画布'}).getByRole('button',{name:'新建画布',exact:true}).click();
  const viewport=page.getByTestId('canvas-viewport');
  const toolbar = page.getByRole('toolbar', { name: '画布工具' });
  await toolbar.getByRole('button', { name: '素材库', exact: true }).click();
  const toolbarLibrary = page.getByRole('dialog', { name: '画布素材库' });
  await expect(toolbarLibrary).toBeVisible();
  await toolbarLibrary.getByRole('button', { name: '关闭素材库' }).click();
  await expect(toolbarLibrary).toBeHidden();
  await viewport.dblclick({position:{x:180,y:180}});
  await page.getByRole('dialog',{name:'添加节点'}).getByRole('menuitem',{name:/^上传/}).click();
  const node=viewport.locator('[data-canvas-node-id]');
  const id=await node.getAttribute('data-canvas-node-id');
  await node.getByRole('button',{name:'从素材库替换'}).click();
  const library=page.getByRole('dialog',{name:'画布素材库'});
  await library.getByRole('button',{name:/^本机资产/}).click();
  await expect(library.getByText('测试素材',{exact:true})).toBeVisible();
  await library.locator('article').filter({hasText:'测试素材'}).getByRole('button',{name:'使用此素材'}).click();
  await expect(node).toHaveCount(1);
  await expect(node).toHaveAttribute('data-canvas-node-id',id!);
  await expect(node.getByRole('img',{name:'测试素材'})).toBeVisible();
  await expect(library).toBeHidden();
  await node.click();
  await page.mouse.move(0,0);
  await expect(node).toHaveAttribute('data-node-selected','true');
  await expect(page.getByRole('button',{name:'替换参考素材',exact:true})).toBeVisible();
});

test('native canvas runs local nodes against the shared source and preserves table edits', async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  const video = '/storage/local/browser-test/timeline.mp4';
  const sampleImage = '/app_logo.png';
  const project = {
    id:'local-tools-fixture', title:'本地节点实测', createdAt:1, updatedAt:1, viewport:{x:0,y:0,zoom:0.65},
    nodes:[
      {id:'source', type:'video', title:'测试片段', videoUrl:video, x:170,y:75,width:130,height:80,createdAt:1},
      {id:'image-a', type:'image', title:'原图', imageUrl:sampleImage, x:350,y:75,width:100,height:80,createdAt:1},
      {id:'image-b', type:'image', title:'补图', imageUrl:sampleImage, x:500,y:75,width:100,height:80,createdAt:1},
      {id:'frame', type:'note', studioSubType:'video-input', title:'视频抽帧', referenceNodeIds:['source'], x:150,y:235,width:360,height:400,createdAt:1},
      {id:'sequence', type:'note', studioSubType:'shot-breakdown', title:'逐帧拉片', referenceNodeIds:['source'], x:580,y:235,width:400,height:380,createdAt:1},
      {id:'tile', type:'note', studioSubType:'image-tile', title:'图片平铺', referenceNodeIds:['image-a','image-b'], x:1030,y:235,width:360,height:280,createdAt:1},
      {id:'table', type:'note', studioSubType:'table-editor-node', title:'表格编辑', x:590,y:770,width:520,height:310,createdAt:1},
    ],
  };
  await page.addInitScript(value => {
    if (sessionStorage.getItem('local-tools-seeded')) return;
    localStorage.setItem('beike_canvas_projects_store', JSON.stringify({state:{projects:[value]},version:0}));
    sessionStorage.setItem('local-tools-seeded','1');
  }, project);
  await page.goto('/?view=canvas&project=local-tools-fixture');
  const frame = page.getByRole('region',{name:'视频抽帧'});
  await frame.getByLabel('时间（秒）').fill('5');
  await frame.getByRole('button',{name:'抽取画面'}).click();
  await expect(frame.getByRole('img',{name:'图像输出'})).toHaveAttribute('src', /^data:image\/jpeg/);

  const tile = page.getByRole('region',{name:'图片平铺'});
  await tile.getByRole('button',{name:'生成拼图'}).click();
  await expect(tile.getByRole('img',{name:'图像输出'})).toHaveAttribute('src', /^data:image\/png/);


  const sequence = page.getByRole('region',{name:'逐帧拉片'});
  await sequence.getByLabel('帧数').fill('2');
  await sequence.getByRole('button',{name:'输出画面'}).click();
  await expect(sequence.getByRole('status')).toHaveText('已输出 2 张画面');

  const table = page.getByRole('region',{name:'表格编辑'});
  await table.getByText('结构化分镜与清单表').click();
  await table.getByRole('button',{name:'添加行'}).click();
  await table.getByRole('button',{name:'添加列'}).click();
  const cell = table.getByRole('textbox',{name:'第 3 行第 3 列'});
  await cell.fill('镜头备注');
  const csv = page.waitForEvent('download');
  await table.getByRole('button',{name:'导出 CSV'}).click();
  expect((await csv).suggestedFilename()).toBe('表格编辑.csv');
  await expect.poll(() => page.evaluate(() => new Promise(resolve => {
    const request = indexedDB.open('beike-canvas-projects');
    request.onerror = () => resolve(false);
    request.onsuccess = () => {
      const db = request.result;
      const result = db.transaction('projects').objectStore('projects').get('local-tools-fixture');
      result.onsuccess = () => { resolve(result.result?.nodes.find((node:{id:string}) => node.id === 'table')?.content?.includes('镜头备注')); db.close(); };
      result.onerror = () => { resolve(false); db.close(); };
    };
  }))).toBe(true);
  await page.reload();
  await expect(cell).toHaveValue('镜头备注');
});

test('native canvas runs the five priority nodes with shared media and controlled provider replies', async ({page}) => {
  const title = '优先节点实测';
  const image = '/app_logo.png';
  const video = '/storage/local/browser-test/timeline.mp4';
  const project = {
    id:'priority-tools-fixture',title,createdAt:1,updatedAt:1,viewport:{x:0,y:0,zoom:0.76},
    nodes:[
      {id:'image',type:'image',title:'共享参考图',imageUrl:image,x:95,y:100,width:128,height:100,createdAt:1},
      {id:'video',type:'video',title:'共享原片',videoUrl:video,x:95,y:350,width:128,height:76,createdAt:1},
      {id:'app',type:'note',studioSubType:'rh-app',title:'RH 应用',x:265,y:65,width:340,height:420,referenceNodeIds:['image'],createdAt:1},
      {id:'comfy',type:'note',studioSubType:'rh-comfy',title:'RH ComfyUI',x:630,y:65,width:340,height:420,referenceNodeIds:['image','video'],createdAt:1},
      {id:'mesh',type:'note',studioSubType:'gen-3d',title:'3D',x:995,y:65,width:375,height:250,referenceNodeIds:['image'],createdAt:1},
      {id:'build',type:'note',studioSubType:'director-3d',title:'智能搭建',specialized:{smartBuild:true},x:705,y:510,width:260,height:260,referenceNodeIds:['image','mesh'],createdAt:1},
      {id:'breakdown',type:'prompt',studioSubType:'video-analyze',title:'视频拆解',x:250,y:510,width:400,height:330,createdAt:1},
    ],
  };
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(value => {
    localStorage.setItem('custom_models',JSON.stringify([{id:'gemini-2.5-flash',name:'测试视觉模型',isMultimodal:true,isAssistant:true,enabled:true}]));
    if (sessionStorage.getItem('priority-tools-seeded')) return;
    localStorage.setItem('beike_canvas_projects_store',JSON.stringify({state:{projects:[value]},version:0}));
    sessionStorage.setItem('priority-tools-seeded','1');
  },project);
  const positions = Buffer.alloc(36);
  [-1,0,0, 1,0,0, 0,1,0].forEach((value,index) => positions.writeFloatLE(value,index*4));
  const meshDocument = JSON.stringify({
    asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],
    meshes:[{primitives:[{attributes:{POSITION:0}}]}],buffers:[{byteLength:positions.length}],
    bufferViews:[{buffer:0,byteOffset:0,byteLength:positions.length,target:34962}],
    accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[-1,0,0],max:[1,1,0]}],
  });
  const json = Buffer.from(meshDocument.padEnd(Math.ceil(Buffer.byteLength(meshDocument)/4)*4));
  const glb = Buffer.alloc(28+json.length+positions.length);
  glb.writeUInt32LE(0x46546c67,0);glb.writeUInt32LE(2,4);glb.writeUInt32LE(glb.length,8);
  glb.writeUInt32LE(json.length,12);glb.writeUInt32LE(0x4e4f534a,16);json.copy(glb,20);
  glb.writeUInt32LE(positions.length,20+json.length);glb.writeUInt32LE(0x004e4942,24+json.length);positions.copy(glb,28+json.length);
  await page.route('https://example.com/fixture.glb',route=>route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'model/gltf-binary',body:glb}));
  const cloudRequests = new Map<string, {kind:string;target?:string;image?:string;fields?:Array<{nodeId:string;fieldName:string;fieldValue:string}>}>();
  await page.route('**/api/generate/canvas-specialized**',route=>{
    const request=route.request();
    if (request.method()==='POST') {
      const key=request.headers()['x-idempotency-key'];
      const payload=request.postDataJSON();
      cloudRequests.set(key,payload);
      return route.fulfill({json:{success:true,taskId:payload.kind+'-task'}});
    }
    const key=new URL(request.url()).searchParams.get('operationKey') || '';
    const payload=cloudRequests.get(key);
    if (!payload) return route.fulfill({status:404,json:{success:false,error:'任务未到达'}});
    return route.fulfill({json:{success:true,status:'done',taskId:payload.kind+'-task',...(payload.kind==='gen-3d' ? {
      modelUrl:'https://example.com/fixture.glb',
    } : {outputs:[{url:'https://example.com/result.png',extension:'png'}]})}});
  });
  await page.route('**/api/system/proxy-image?*',route=>route.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZuoAAAAASUVORK5CYII=','base64')}));
  const textRequests: Array<Array<{type:string;text?:string;image_url?:{url:string}}>> = [];
  await page.route('**/api/generate/canvas-text',route=>{
    const parts=route.request().postDataJSON().messages[0].content;
    textRequests.push(parts);
    const content=String(parts[0].text).includes('3D场景搭建师')
      ? '{"objects":[{"label":"主台","x":0,"z":0,"width":2,"height":1,"depth":1,"color":"#b5856f"}]}'
      : '00.00–12.00 秒 · 固定机位 · 彩色运动测试图';
    return route.fulfill({json:{success:true,choices:[{finish_reason:'stop',message:{content}}]}});
  });
  await page.goto('/?view=canvas&project=priority-tools-fixture');
  const viewport=page.getByTestId('canvas-viewport');
  for (const [name,id,kind] of [['RH 应用','123','rh-app'],['RH ComfyUI','456','rh-comfy']] as const) {
    const panel=page.getByRole('region',{name,exact:true});
    await panel.getByLabel(kind==='rh-app' ? '应用 ID' : '工作流 ID').fill(id);
    await panel.getByRole('button',{name:'添加参数'}).click();
    await panel.getByLabel('节点 ID 1').fill('12');
    const fieldName=kind==='rh-app' ? 'image' : 'video';
    await panel.getByLabel('字段名 1').fill(fieldName);
    await panel.getByLabel('参数来源 1').selectOption(fieldName);
    await panel.getByRole('button',{name:'生成',exact:true}).click();
    await expect(panel.getByRole('status')).toHaveText('已完成');
    const sent=[...cloudRequests.values()].find(payload=>payload.kind===kind);
    expect(sent?.target).toBe(id);
    expect(sent?.fields?.[0]).toEqual({nodeId:'12',fieldName,fieldValue:expect.stringMatching(kind==='rh-app' ? /^data:image\/png;base64,/ : /^data:video\/mp4;base64,/)});
    await expect(panel.getByRole('img',{name:'生成预览'})).toBeVisible();
  }
  const mesh=page.getByRole('region',{name:'3D',exact:true});
  await mesh.getByTestId('drawing-preview').click();
  await page.getByRole('button',{name:'选择 3D 材质模式'}).click();
  await page.getByRole('menuitem',{name:'几何',exact:true}).click();
  await page.locator('[data-three-d-prompt-panel]').getByRole('button',{name:'生成',exact:true}).click();
  await expect(mesh.getByTestId('drawing-preview').getByRole('link',{name:'下载 GLB'})).toHaveAttribute('href','https://example.com/fixture.glb');
  await expect(mesh.locator('[data-model-status]')).toHaveAttribute('data-model-status','ready');
  await expect(mesh.getByRole('img',{name:'可旋转 3D 预览'}).locator('canvas')).toHaveCount(1);
  expect([...cloudRequests.values()].find(payload=>payload.kind==='gen-3d')).toMatchObject({textured:false,image:expect.stringMatching(/^data:image\/png;base64,/)});

  await page.getByRole('region',{name:'智能搭建',exact:true}).getByRole('button',{name:'打开',exact:true}).click();
  const build=page.getByRole('dialog',{name:'3D导演台'});
  await build.getByLabel('搭建描述').fill('把参考图的主体放到场景中央');
  await build.getByRole('button',{name:'生成布景'}).click();
  await build.getByRole('button',{name:'场景对象列表'}).click();
  await expect(build.getByLabel('主台 height')).toHaveValue('1');
  await expect(build.getByRole('img',{name:'3D导演台主视口'}).locator('polygon').first()).toBeVisible();
  await build.getByText('已连接 3D 模型',{exact:true}).click();
  await expect(build.getByRole('link',{name:'已连接 GLB'})).toHaveAttribute('href','https://example.com/fixture.glb');
  await build.getByLabel('主台 height').fill('2');
  const obj=page.waitForEvent('download');
  await build.getByRole('button',{name:'导出 OBJ'}).click();
  expect((await obj).suggestedFilename()).toBe('scene.obj');
  expect(textRequests[0].some(part=>part.image_url?.url.startsWith('data:image/png'))).toBe(true);
  await build.getByRole('button',{name:'返回',exact:true}).click();

  const port=(id:string,side:string)=>viewport.locator(`[data-port-node="${id}"].connector-${side}`);
  const from=(await port('video','right').boundingBox())!;
  const to=(await port('breakdown','left').boundingBox())!;
  await page.mouse.move(from.x+from.width/2,from.y+from.height/2);
  await page.mouse.down();
  await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:12});
  await page.mouse.up();
  const breakdown=page.getByRole('region',{name:'视频拆解',exact:true});
  await expect(breakdown.getByLabel('拆解原片')).toBeVisible();
  await breakdown.getByLabel('拆解要求').fill('描述构图与运镜');
  await breakdown.getByRole('button',{name:'开始拆解'}).click();
  await expect(breakdown.getByRole('status')).toContainText('00.00–12.00 秒');
  expect(textRequests[1].filter(part=>part.type==='image_url')).toHaveLength(8);
  expect(textRequests[1][0].text).toContain('12.00 秒');
});

test('native canvas runs panorama, Jimeng, motion transfer and script parsing on shared media', async ({page}) => {
  const project = {
    id:'next-tools-fixture',title:'专项节点实测',createdAt:1,updatedAt:1,viewport:{x:0,y:0,zoom:0.72},
    nodes:[
      {id:'image',type:'image',title:'共享参考图',imageUrl:'/app_logo.png',x:120,y:85,width:140,height:100,createdAt:1},
      {id:'video',type:'video',title:'共享原片',videoUrl:'/storage/local/browser-test/timeline.mp4',x:120,y:260,width:140,height:80,createdAt:1},
      {id:'text',type:'prompt',title:'共享剧本',content:'台灯亮起，镜头缓慢推近。',x:120,y:400,width:160,height:130,createdAt:1},
      {id:'panorama',type:'note',studioSubType:'global-perspective',title:'全局视角',x:310,y:70,width:440,height:400,referenceNodeIds:['image'],createdAt:1},
      {id:'upscale',type:'note',studioSubType:'jimeng-super-resolution',title:'智能超清',x:830,y:75,width:250,height:250,referenceNodeIds:['image'],createdAt:1},
      {id:'motion',type:'drawing',generationKind:'video',studioSubType:'motion-control',title:'动作迁移',x:1200,y:75,width:250,height:250,referenceNodeIds:['image','video'],createdAt:1,
        drawing:{model:'kling-video-v3',quality:'720P',aspect:'1:1',count:1,references:[],refMode:'motion_control',audio:true,optimizePrompt:false}},
      {id:'script',type:'prompt',studioSubType:'script-parse',title:'脚本解析',x:340,y:500,width:400,height:400,referenceNodeIds:['text'],createdAt:1},
    ],
  };
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(value => {
    localStorage.setItem('custom_models',JSON.stringify([
      {id:'gemini-2.5-flash',name:'测试解析模型',isMultimodal:true,isAssistant:true,enabled:true},
      {id:'kling-video-v3',name:'Kling 3.0',isVideo:true,enabled:true},
    ]));
    localStorage.setItem('ai_base_url','https://api.klingai.com');
    if (sessionStorage.getItem('next-tools-seeded')) return;
    localStorage.setItem('beike_canvas_projects_store',JSON.stringify({state:{projects:[value]},version:0}));
    sessionStorage.setItem('next-tools-seeded','1');
  },project);
  let upscale: Record<string,unknown> | undefined;
  let parsed = '';
  let motion: Record<string,unknown> | undefined;
  await page.route('**/api/generate/canvas-specialized**',route=>{
    if (route.request().method()==='POST') {
      upscale=route.request().postDataJSON();
      return route.fulfill({json:{success:true,taskId:'upscale-mock'}});
    }
    return route.fulfill({json:{success:true,status:'done',taskId:'upscale-mock',imageUrl:'https://example.com/upscale.png'}});
  });
  await page.route('**/api/system/proxy-image?*',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZuoAAAAASUVORK5CYII=','base64')}));
  await page.route('**/api/generate/canvas-text',route=>{
    parsed=route.request().postDataJSON().messages[0].content[0].text;
    return route.fulfill({json:{success:true,choices:[{finish_reason:'stop',message:{content:JSON.stringify({
      assets:{characters:[],scenes:['室内'],props:['台灯']},rows:[{scene:'台灯亮起',imagePrompt:'暖光台灯特写',videoPrompt:'缓慢推近'}],
    })}}]}});
  });
  await page.route('**/api/generate/upload-ref',route=>{
    const type = route.request().postData()?.includes('filename="reference.mp4"') ? 'mp4' : 'png';
    return route.fulfill({json:{success:true,url:'https://example.com/reference.'+type}});
  });
  await page.route('**/api/generate/seedance/precheck',route=>{
    const items=route.request().postDataJSON().items as Array<Record<string,unknown>>;
    return route.fulfill({json:{success:true,results:items.map(item=>({...item,status:'passed'}))}});
  });
  await page.route('**/api/generate/video**',route=>{
    if (route.request().method()==='POST') motion=route.request().postDataJSON();
    return route.fulfill({json:{success:true,status:'SUCCESS',taskId:'motion-mock',resultUrl:'/storage/local/browser-test/timeline.mp4'}});
  });
  await page.goto('/?view=canvas&project=next-tools-fixture');
  const viewport=page.getByTestId('canvas-viewport');
  const panorama=page.getByRole('region',{name:'全局视角',exact:true});
  const preview=panorama.getByRole('img',{name:'全景预览'});
  await expect(preview).toBeVisible();
  const picture=()=>preview.evaluate(canvas=>(canvas as HTMLCanvasElement).toDataURL());
  const before=await picture();
  const bounds=(await preview.boundingBox())!;
  await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
  await page.mouse.down();
  await page.mouse.move(bounds.x+bounds.width/2+80,bounds.y+bounds.height/2+15,{steps:8});
  await page.mouse.up();
  await expect.poll(picture).not.toBe(before);

  const hd=page.getByRole('region',{name:'智能超清',exact:true});
  await hd.getByTestId('drawing-preview').click();
  await hd.getByRole('button',{name:'8K',exact:true}).click();
  await hd.getByLabel('细节程度').fill('68');
  await hd.getByRole('button',{name:'开始高清放大'}).click();
  await expect(hd.getByRole('status')).toHaveText('已完成');
  expect(upscale).toMatchObject({kind:'jimeng-super-resolution',resolution:'8k',detail:68,image:expect.stringMatching(/^data:image\/png;base64,/)});
  await expect(hd.getByRole('img',{name:'生成预览'})).toBeVisible();

  const script=page.getByRole('region',{name:'脚本解析',exact:true});
  await script.getByTestId('drawing-preview').click();
  const scriptPanel = page.locator('[data-script-parse-prompt-panel]');
  await scriptPanel.getByRole('button',{name:'约束',exact:true}).click();
  await scriptPanel.getByRole('textbox',{name:'解析约束'}).fill('保留一个镜头');
  await scriptPanel.getByRole('button',{name:'解析脚本'}).click();
  await expect(script.getByText('镜头 1 · 台灯亮起')).toBeVisible();
  expect(parsed).toContain('台灯亮起，镜头缓慢推近。');
  expect(parsed).toContain('保留一个镜头');
  await script.getByText('镜头 1 · 台灯亮起').click();
  await expect(script.getByText('静帧：暖光台灯特写')).toBeVisible();
  await expect(script.getByText('视频：缓慢推近')).toBeVisible();
  await script.getByRole('toolbar',{name:'脚本解析操作栏'}).getByRole('button',{name:'创建分镜视表'}).click();

  await expect(viewport.getByRole('button',{name:'连接至 动作迁移 的 角色图片'})).toBeVisible();
  await expect(viewport.getByRole('button',{name:'连接至 动作迁移 的 动作参考视频'})).toBeVisible();
  const motionNode=viewport.locator('[data-canvas-node-id="motion"]');
  await motionNode.getByTestId('drawing-preview').click();
  await page.getByLabel('动作迁移画质').selectOption('1080P');
  await page.getByLabel('保留原声').uncheck();
  await page.getByRole('button',{name:'开始动作迁移'}).click();
  await expect.poll(()=>JSON.stringify(motion || {}),{timeout:20000}).toContain('motion_control');
  expect(motion).toMatchObject({resolution:'1080P',audio:false,images:['https://example.com/reference.png'],videos:['https://example.com/reference.mp4']});
  await expect(motionNode.locator('video')).toBeVisible({timeout:20000});

  await panorama.getByRole('button',{name:'当前画面拍照'}).click();
  await expect(viewport.getByRole('img',{name:'全景截图'})).toHaveCount(1);
  await panorama.getByRole('button',{name:'导出四角视角'}).click();
  await expect(viewport.getByRole('img',{name:/全景 · 角/})).toHaveCount(4);
});


test('native canvas renders every implemented creation type with the shared card treatment', async ({page}) => {
  const vite = await createServer({
    configFile: fileURLToPath(new URL('../../configs/vite.config.ts', import.meta.url)),
    server: { middlewareMode: true, watch: null, ws: false },
  });
  const project = await (async () => {
    try {
      const { buildQuickCanvasNode, CANVAS_LOCAL_TOOLS, CANVAS_PRIORITY_TOOLS } = await vite.ssrLoadModule(
        '/features/canvas/model/canvasNodeFactory.ts',
      ) as typeof import('../../../src/client/features/canvas/model/canvasNodeFactory');
      const tools: CanvasQuickNodeType[] = [
        'file','prompt','video-prompt-optimizer','image-generation','video-generation','audio',
        'storyboard-node','storyboard-chart-node','video-timeline','doodle-canvas','compare','save','preview','smart-build',
        ...Object.keys(CANVAS_LOCAL_TOOLS) as Array<keyof typeof CANVAS_LOCAL_TOOLS>,
        ...Object.keys(CANVAS_PRIORITY_TOOLS) as Array<keyof typeof CANVAS_PRIORITY_TOOLS>,
      ];
      const nodes = tools.map((kind,index)=>buildQuickCanvasNode(kind,{
        x:620+(index%7)*850,y:575+Math.floor(index/7)*900,
      },{id:kind}));
      return {id:'native-node-gallery',title:'原生节点验收',createdAt:1,updatedAt:1,viewport:{x:0,y:0,zoom:0.14},nodes};
    } finally {
      await vite.close();
    }
  })();
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(value=>{
    localStorage.setItem('beike_canvas_projects_store', JSON.stringify({state:{projects:[value]},version:0}));
  },project);
  await page.goto('/?view=canvas&project=native-node-gallery');
  const viewport = page.getByTestId('canvas-viewport');
  const cards = viewport.locator('[data-canvas-node-id]');
  await expect(cards).toHaveCount(project.nodes.length);
  for (const node of project.nodes) {
    const card = viewport.locator(`[data-canvas-node-id="${node.id}"]`);
    await expect(card).toHaveAttribute('data-node-kind',node.type);
    expect((await card.boundingBox())?.width).toBeCloseTo(node.width*0.14,0);
  }
  await expect(page.getByTestId('canvas-download-entry')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'返回首页',exact:true})).toHaveCount(0);
});

const promptPanelCases = [
  { title: '文本', type: 'prompt', x: 85, y: 130, atBottom: false },
  { title: '绘图', type: 'drawing', x: 805, y: 525, atBottom: true },
  { title: '视频生成', type: 'drawing', generationKind: 'video', x: 85, y: 525, atBottom: true },
  { title: '提示词优化', type: 'prompt', studioSubType: 'video-prompt-optimizer', x: 805, y: 425, atBottom: true },
  { title: '音频', type: 'audio', x: 125, y: 525, atBottom: true, panel: '[data-audio-prompt-panel]' },
  { title: '音频', type: 'audio', x: 85, y: 130, atBottom: false, panel: '[data-audio-prompt-panel]' },
  { title: '3D', type: 'note', studioSubType: 'gen-3d', x: 805, y: 525, atBottom: true, panel: '[data-three-d-prompt-panel]' },
  { title: '3D', type: 'note', studioSubType: 'gen-3d', x: 805, y: 130, atBottom: false, panel: '[data-three-d-prompt-panel]' },
  { title: '脚本解析', type: 'prompt', studioSubType: 'script-parse', x: 805, y: 525, atBottom: true },
  { title: '表格编辑', type: 'note', studioSubType: 'table-editor-node', x: 805, y: 525, atBottom: true },
];

for (const { atBottom, panel: panelSelector, ...fixture } of promptPanelCases) {
  test(`canvas prompt panel stays centered at the edge and after zoom for ${fixture.title} (${atBottom ? 'bottom edge' : 'room below'})`, async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 720 });
    const project = {
      id: 'prompt-position', title: '提示词面板定位', createdAt: 1, updatedAt: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [{ ...fixture, id: 'subject', width: 200, height: 150, createdAt: 1 }],
    };
    await page.addInitScript(value => {
      localStorage.setItem('beike_canvas_projects_store', JSON.stringify({ state: { projects: [value] }, version: 0 }));
    }, project);
    await page.goto('/?view=canvas&project=prompt-position');

    const viewport = page.getByTestId('canvas-viewport');
    const panel = page.locator(panelSelector ?? '[data-canvas-node-editor]');
    const card = page.locator('[data-canvas-node-id="subject"]');
    const node = fixture.type === 'drawing' ? card.getByTestId('drawing-preview') : card;
    await node.click();
    await expect(panel).toBeVisible();
    const position = async () => {
      const bounds = await node.boundingBox();
      const editor = await panel.boundingBox();
      if (!bounds || !editor) return 'missing';
      const centerDelta = Math.abs(bounds.x + bounds.width / 2 - editor.x - editor.width / 2);
      if (centerDelta >= 1) return 'offset';
      if (editor.y + editor.height < bounds.y) return 'above';
      if (editor.y > bounds.y + bounds.height) {
        const canvas = await viewport.boundingBox();
        return canvas && editor.y + editor.height <= canvas.y + canvas.height ? 'below' : 'clipped';
      }
      return 'overlap';
    };
    await expect.poll(position).toBe('below');
    if (fixture.studioSubType === 'video-prompt-optimizer') {
      const toolbar = card.getByRole('toolbar', { name: '提示词 Skill 工具栏' });
      await expect(toolbar.getByRole('button', { name: '对比' })).toBeVisible();
      await expect(toolbar.getByRole('button', { name: '卡片内切换提示词 Skill' })).toHaveCount(0);
      const selector = panel.getByRole('button', { name: '选择模型提示词 Skill' });
      await selector.click();
      const list = panel.getByRole('listbox', { name: '模型提示词 Skill 列表' });
      const option = list.getByRole('option', { selected: false }).first();
      const label = (await option.locator('span.truncate').innerText()).trim();
      await option.click();
      await expect(list).toBeHidden();
      await expect(selector).toContainText(label);
    }

    const bounds = (await viewport.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width * (fixture.x < 500 ? 0.7 : 0.3), bounds.y + 260);
    for (const [delta, zoom] of [[-100, 105], [300, 100], [100, 95]]) {
      await page.mouse.wheel(0, delta);
      await expect(page.getByRole('button', { name: `缩放 ${zoom}%` })).toBeVisible();
      await expect.poll(position).toBe('below');
    }
  });
}

for (const side of ['right', 'left'] as const) {
  test(`connected bottom-edge video reveals its prompt without covering adjacent cards (${side})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 800 });
    const project = {
      id: 'connected-video-prompt', title: '连线视频面板', createdAt: 1, updatedAt: 1,
      viewport: { x: 0, y: 0, zoom: 0.9 },
      nodes: [
        { id: 'image', type: 'image', title: '参考图片', imageUrl: '/app_logo.png', x: 65, y: 70, width: 185, height: 145 },
        { id: 'text', type: 'prompt', title: '文本', x: 45, y: 350, width: 160, height: 150 },
        { id: 'drawing', type: 'drawing', title: '绘图', x: 410, y: 320, width: 160, height: 150, referenceNodeIds: ['image', 'text'] },
        { id: 'audio', type: 'audio', title: '音频', x: 645, y: 85, width: 265, height: 150, referenceNodeIds: ['text'] },
        { id: 'skill', type: 'prompt', studioSubType: 'video-prompt-optimizer', title: '提示词优化', x: 670, y: 475, width: 235, height: 220, referenceNodeIds: ['text'] },
        { id: 'compare', type: 'compare', title: '对比', x: 1080, y: 475, width: 200, height: 140, referenceNodeIds: ['image', 'drawing'] },
        { id: 'video', type: 'drawing', generationKind: 'video', title: '视频生成', x: 1015, y: 730, width: 180, height: 180, referenceNodeIds: ['drawing', 'audio', 'skill'] },
      ].map(node => ({
        ...node,
        x: side === 'left' ? 1440 / 0.9 - node.x - (node.id === 'video' ? 444 : node.width) : node.x,
        createdAt: 1,
      })),
    };
    await page.addInitScript(value => {
      localStorage.setItem('beike_canvas_projects_store', JSON.stringify({ state: { projects: [value] }, version: 0 }));
    }, project);
    await page.goto('/?view=canvas&project=connected-video-prompt');

    const viewport = page.getByTestId('canvas-viewport');
    const card = viewport.locator('[data-canvas-node-id="video"]').getByTestId('drawing-preview');
    const panel = page.locator('[data-canvas-node-editor]');
    await expect(viewport.locator('path[data-connection-edge="true"]')).toHaveCount(9);
    const original = (await card.boundingBox())!;
    await card.click();
    await expect(panel).toBeVisible();
    const geometry = async () => {
      const node = (await card.boundingBox())!;
      const editor = (await panel.boundingBox())!;
      const canvas = (await viewport.boundingBox())!;
      const neighbors = await viewport.locator('[data-canvas-node-id]:not([data-canvas-node-id="video"])').evaluateAll(
        elements => elements.map(element => element.getBoundingClientRect().toJSON()),
      );
      return {
        movedInward: side === 'left' ? node.x > original.x : node.x < original.x,
        movedUp: node.y < original.y,
        centered: Math.abs(node.x + node.width / 2 - editor.x - editor.width / 2) < 1,
        below: editor.y > node.y + node.height,
        fullyVisible: editor.x >= canvas.x && editor.x + editor.width <= canvas.x + canvas.width &&
          editor.y >= canvas.y && editor.y + editor.height <= canvas.y + canvas.height,
        coveredNeighbors: neighbors.filter(box =>
          editor.x < box.right && editor.x + editor.width > box.left &&
          editor.y < box.bottom && editor.y + editor.height > box.top,
        ).length,
      };
    };
    await expect.poll(geometry).toEqual({ movedInward: true, movedUp: true, centered: true, below: true, fullyVisible: true, coveredNeighbors: 0 });
  });
}

test('stale canvas tabs preserve other projects and can export conflicting edits', async ({ page, context }) => {
  const storedNodeCount = (id: string) => page.evaluate(projectId => new Promise(resolve => {
    const open = indexedDB.open('beike-canvas-projects');
    open.onsuccess = () => {
      const db = open.result;
      const read = db.transaction('projects').objectStore('projects').get(projectId);
      read.onsuccess = () => { resolve(read.result?.nodes?.length ?? 0); db.close(); };
    };
  }), id);
  const makeCanvas = async () => {
    await page.goto('/?view=video_sales');
    await page.getByRole('region', { name: '最近画布' }).getByRole('button', { name: '新建画布', exact: true }).click();
    const viewport = page.getByTestId('canvas-viewport');
    await viewport.dblclick({ position: { x: 155, y: 180 } });
    await page.getByRole('menuitem', { name: '文本', exact: true }).click();
    const id = new URL(page.url()).searchParams.get('project')!;
    await expect.poll(() => storedNodeCount(id)).toBe(1);
    return id;
  };
  const original = await makeCanvas();
  const stale = await context.newPage();
  await stale.goto('/?view=video_sales');
  await expect(stale.getByRole('region', { name: '最近画布' }).getByText('文本', { exact: true })).toBeVisible();
  const created = await makeCanvas();
  expect(created).not.toBe(original);
  await stale.getByRole('region', { name: '最近画布' }).getByText('文本', { exact: true }).click();
  await expect(stale.getByTestId('canvas-viewport')).toBeVisible();
  await stale.keyboard.press('Control+s');
  await page.reload();
  await expect(page.getByTestId('canvas-viewport').locator('[data-canvas-node-id]')).toHaveCount(1);

  await page.goto('/?view=canvas&project=' + original);
  const currentViewport = page.getByTestId('canvas-viewport');
  await currentViewport.dblclick({ position: { x: 680, y: 380 } });
  await page.getByTestId('canvas-context-menu-item-image-generation').click({ timeout: 10_000 });
  await expect(currentViewport.locator('[data-canvas-node-id]')).toHaveCount(2);
  await expect.poll(() => storedNodeCount(original)).toBe(2);
  const staleText = stale.getByRole('textbox', { name: '文本内容' });
  await staleText.dblclick();
  const unsavedText = '旧窗口的未保存编辑';
  await staleText.fill(unsavedText);
  const exportEdits = stale.getByRole('button', { name: '导出当前编辑' });
  await expect(stale.getByRole('alert').filter({ has: exportEdits })).toContainText('画布已在另一个窗口修改');
  await exportEdits.click({ timeout: 10_000 });
  const [download] = await Promise.all([
    stale.waitForEvent('download', { timeout: 10_000 }),
    stale.getByRole('dialog', { name: '导出画布项目' }).getByRole('button', { name: '导出项目', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
  const backup = await JSZip.loadAsync(await readFile(await download.path()));
  expect(await backup.file('project.json')!.async('string')).toContain(unsavedText);
  await page.reload();
  await expect(currentViewport.locator('[data-node-kind="drawing"]')).toHaveCount(1);
  await expect(page.getByRole('textbox', { name: '文本内容' })).not.toContainText(unsavedText);
  await stale.close();
});

test('copy, redo and link undo survive opening the canvas again', async ({ page }) => {
  const project = {
    id: 'durable-graph', title: '编辑恢复', createdAt: 1, updatedAt: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [140, 485].map((x, index) => ({
      id: 'durable-' + index, type: 'note', title: '节点 ' + index,
      x, y: 230, width: 180, height: 120, createdAt: 1,
      ...(index ? { referenceNodeIds: ['durable-0'] } : {}),
    })),
  };
  await page.addInitScript(value => {
    localStorage.setItem('beike_canvas_projects_store', JSON.stringify({ state: { projects: [value] }, version: 0 }));
  }, project);
  await page.goto('/?view=canvas&project=' + project.id);
  const viewport = page.getByTestId('canvas-viewport');
  const nodes = viewport.locator('[data-canvas-node-id]');
  const edges = viewport.locator('[data-connection-edge][role="button"]');
  await expect(nodes).toHaveCount(2);
  const port = viewport.locator('[data-port-node="durable-0"].connector-right');
  await port.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-connection-drop-menu]')).toBeVisible();
  await page.keyboard.press('Escape');
  await viewport.click({ position: { x: 1000, y: 550 } });
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect(nodes).toHaveCount(4);
  await expect(edges).toHaveCount(2);
  await page.keyboard.press('Control+z');
  await expect(nodes).toHaveCount(2);
  await page.keyboard.press('Control+y');
  await expect(nodes).toHaveCount(4);
  await page.keyboard.press('Control+s');
  await expect.poll(() => page.evaluate(() => new Promise(resolve => {
    const open = indexedDB.open('beike-canvas-projects');
    open.onsuccess = () => {
      const db = open.result;
      const read = db.transaction('projects').objectStore('projects').get('durable-graph');
      read.onsuccess = () => { resolve(read.result?.studioScene?.connections?.length ?? 0); db.close(); };
    };
  }))).toBe(2);
  await page.reload();
  await expect(nodes).toHaveCount(4);
  await expect(edges).toHaveCount(2);
});

test('canvas text uses the browser context menu while node controls retain their menu', async ({ page }) => {
  const project = {
    id: 'context-text', title: '右键测试', createdAt: 1, updatedAt: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [{ id: 'text', type: 'prompt', title: '文本节点', content: '可复制的正文', x: 100, y: 100, width: 300, height: 220, createdAt: 1 }],
  };
  await page.addInitScript(value => {
    localStorage.setItem('beike_canvas_projects_store', JSON.stringify({ state: { projects: [value] }, version: 0 }));
  }, project);
  await page.goto('/?view=canvas&project=context-text');
  const node = page.locator('[data-canvas-node-id="text"]');
  const text = node.getByRole('textbox', { name: '文本内容' });
  await expect(text).toBeVisible();
  const prevented = await text.evaluate(element => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(false);
  await expect(page.getByRole('menu', { name: '节点右键菜单' })).toHaveCount(0);
  await node.getByTestId('drawing-preview').click({ button: 'right', position: { x: 5, y: 5 } });
  const menu = page.getByRole('menu', { name: '节点右键菜单' });
  await expect(menu).toBeVisible();
  await menu.getByRole('button', { name: '复制节点' }).click();
  await expect(page.locator('[data-canvas-node-id]')).toHaveCount(2);
});
