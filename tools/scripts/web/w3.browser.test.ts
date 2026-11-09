import { expect, test } from './browser-fixtures';

test('W3 manual video generation rejects an invalid analysis before submitting', async ({ page }) => {
  const id = 'manual-w3-validation';
  const scene = {
    nodes: [
      { id: id + '-analysis', type: 'text-node', nodeName: '05 分镜', x: 80, y: 200, width: 250, height: 250,
        content: '这是一份缺少分镜标记的文案', settings: { text: '这是一份缺少分镜标记的文案', beikeTextResultRequired: true } },
      { id: id + '-keyframe', type: 'input-image', nodeName: '06 首帧', x: 360, y: 200, width: 240, height: 240,
        content: '/app_logo.png', settings: { mediaType: 'image' } },
      { id: id + '-video', type: 'gen-video', nodeName: '08 复刻视频', x: 680, y: 200, width: 260, height: 260,
        prompt: '【使用片段：01】', settings: { model: 'MiniMax-H3', beikeVideoWorkflow: 'w3-copy',
          beikeVideoMode: 'first_frame', beikeVideoAudio: false, beikeOptimizePrompt: false, resolution: '768P', duration: '15s', ratio: '9:16' } },
    ],
    connections: ['analysis', 'keyframe'].map(key => ({ id: key, from: id + '-' + key, to: id + '-video' })),
    groups: [], textBoxes: [], strokes: [], view: { x: 0, y: 0, zoom: 1 },
  };
  await page.addInitScript(({ id, scene }) => {
    localStorage.setItem('ai_base_url', 'https://metaso.cn');
    localStorage.setItem('ai_api_key', 'fixture-only');
    localStorage.setItem('beike_canvas_projects_store', JSON.stringify({ version: 0, state: { projects: [
      { id, title: '手动复刻校验', createdAt: 1, updatedAt: 1, nodes: [], studioScene: scene },
    ] } }));
  }, { id, scene });
  let submits = 0;
  await page.route(/\/api\/generate\/video(?:\?|$)/, async route => {
    if (route.request().method() === 'POST') submits++;
    await route.fulfill({ status: 400, json: { success: false, error: '测试拦截' } });
  });
  await page.goto('/?view=canvas&project=' + id);
  const video = page.locator('[data-canvas-node-id="' + id + '-video"]');
  await video.getByTestId('drawing-preview').click();
  await page.getByRole('button', { name: '开始生成视频' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '05 分镜分析' })).toBeVisible();
  expect(submits).toBe(0);
});
