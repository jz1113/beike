import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Page } from '@playwright/test';
import type { StudioTaskCommands } from '../../../src/client/features/canvas/model/studioTaskState';
import type { StudioScene } from '../../../src/client/features/canvas/model/types';
import { expect, test } from './browser-fixtures';

const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2ioAAAAASUVORK5CYII=', 'base64');
const source = '/storage/local/browser-test/source.mp4';
const upstreamSource = 'https://fixture.invalid/source.mp4';
const script = '【全片一致性】同一人物与商品，指定背景。【声音模式：静音】【全片一致性结束】\n【视频片段 01｜时长 15 秒】\n首帧：人物在背景前的近景。\n本地时间轴：\n0–5秒：后退。\n5–10秒：转身。\n10–15秒：走近后停稳。\n【视频片段结束】';

type FixtureWindow = Window & {
  beikeStudio: { taskCommands: StudioTaskCommands };
  beikeCanvasSave(scene: StudioScene): Promise<void>;
};

async function readVideoNode(page: Page) {
  return page.frameLocator('iframe[title="贝壳云图项目画布"]').locator('body').evaluate(() => {
    const host = window as unknown as FixtureWindow;
    return host.beikeStudio.taskCommands.read().nodes.find(node => node.id.endsWith('-video'));
  });
}

function seedVideoReceipt(id: string) {
  const db = new DatabaseSync(join(process.env.BEIKE_BROWSER_DATA_DIR!, 'browser.db'));
  try {
    db.prepare(`INSERT INTO "ImageTask" ("id","workspaceId","taskId","status","mediaType","model","resultUrl","prompt","updatedAt")
      VALUES (?, 'local', ?, 'SUCCESS', 'video', 'MiniMax-H3', ?, 'browser fixture', CURRENT_TIMESTAMP)`).run(id, id, source);
  } finally {
    db.close();
  }
}

for (const reload of [false, true]) {
  test(reload ? 'W3 reload looks up the original video receipt, then delivers without another model POST'
    : 'W3 runs from four synthetic inputs through real silent MP4 delivery', async ({ page }) => {
    const taskId = reload ? 'fixture-h3-recovered' : 'fixture-h3-complete';
    const calls: string[] = [];
    const keys: string[] = [];
    let originalKey = '';
    let afterReload = false;
    let output = '';
    await page.addInitScript(() => {
      localStorage.setItem('ai_base_url', 'https://metaso.cn');
      localStorage.setItem('ai_api_key', 'fixture-only');
    });
    await page.route('**/browser-fixture/*.png', route => route.fulfill({ body: image, contentType: 'image/png' }));
    await page.route('**/api/generate/upload-ref', async route => {
      expect(route.request().method()).toBe('POST');
      expect(route.request().postDataBuffer()?.length).toBeGreaterThan(1000);
      await route.fulfill({ json: { success: true, url: upstreamSource } });
    });
    await page.route('**/api/generate/canvas-text', async route => {
      expect(route.request().method()).toBe('POST');
      calls.push('analysis');
      const body = route.request().postDataJSON();
      const wire = JSON.stringify(body);
      expect(wire).toContain(upstreamSource);
      expect(wire.match(/data:image\/[^;,]+;base64,/g)).toHaveLength(3);
      await route.fulfill({ json: { success: true, operationKey: body.clientTaskId, text: script,
        choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: script } }] } });
    });
    await page.route('**/api/generate/image', async route => {
      expect(route.request().method()).toBe('POST');
      calls.push('image');
      const body = route.request().postDataJSON();
      expect(body.images.map((url: string) => new URL(url).pathname).sort()).toEqual(
        ['background', 'person', 'product'].map(key => '/browser-fixture/' + key + '.png'));
      expect(body.prompt).not.toContain(upstreamSource);
      await route.fulfill({ json: { success: true, status: 'SUCCESS', resultUrl: new URL('/browser-fixture/keyframe.png', page.url()).href } });
    });
    await page.route(/\/api\/generate\/video(?:\?|$)/, async route => {
      const request = route.request();
      if (request.method() === 'POST') {
        calls.push('video');
        const body = request.postDataJSON();
        expect(body).toMatchObject({ model: 'MiniMax-H3', duration: 15, aspect_ratio: 'adaptive', resolution: '768P',
          ref_mode: 'first_frame', audio: false, videos: [] });
        const firstFrame = new URL('/browser-fixture/keyframe.png', page.url()).href;
        expect(body.images).toEqual([firstFrame]);
        expect(body.first_frame_image).toBe(firstFrame);
        originalKey = request.headers()['x-idempotency-key'];
        expect(originalKey).toBeTruthy();
        expect(body.clientTaskId).toBe(originalKey);
        if (reload) return route.abort('connectionreset');
        seedVideoReceipt(taskId);
      } else {
        expect(request.method()).toBe('GET');
        const key = new URL(request.url()).searchParams.get('taskKey');
        expect(key).toBe(originalKey);
        if (!afterReload) return route.fulfill({ json: { success: true, submissionPending: true } });
        if (!keys.length) seedVideoReceipt(taskId);
        keys.push(key!);
      }
      await route.fulfill({ json: { success: true, taskId, status: 'SUCCESS', resultUrl: source } });
    });
    await page.route('**/api/generate/video/silent', async route => {
      expect(route.request().method()).toBe('POST');
      expect(route.request().postDataJSON()).toEqual({ taskId });
      calls.push('delivery');
      const response = await route.fetch({ maxRedirects: 0 });
      const json = await response.json();
      expect(response.status(), JSON.stringify(json)).toBe(200);
      expect(json).toMatchObject({ success: true, durationSec: 15, hasAudio: false });
      output = json.url;
      await route.fulfill({ response, json });
    });
    await page.goto('/?view=video_sales');
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await page.getByRole('button', { name: 'W3复刻模板', exact: true }).click();
    const frame = page.frameLocator('iframe[title="贝壳云图项目画布"]');
    const ready = async () => {
      await expect(frame.getByTitle('01 上传参考视频', { exact: true })).toBeVisible();
      await expect(frame.getByRole('status', { name: '画布加载中' })).toBeHidden();
    };
    await ready();
    // Seed only the four local input slots via the editor's existing scene/save bridge.
    // Everything from preflight through generation and delivery uses the product UI and APIs.
    await frame.locator('body').evaluate(async (_, video) => {
      const host = window as unknown as FixtureWindow;
      const commands = host.beikeStudio.taskCommands;
      const scene = commands.read();
      for (const key of ['source', 'product', 'person', 'background']) {
        const node = scene.nodes.find(row => row.id.endsWith('-' + key))!;
        const content = new URL(key === 'source' ? video : '/browser-fixture/' + key + '.png', parent.location.origin).href;
        commands.update(node.id, undefined, { content });
      }
      await host.beikeCanvasSave(commands.read());
    }, source);
    await page.getByRole('button', { name: '一键运行W3复刻' }).click();
    if (reload) {
      await expect.poll(() => originalKey, { timeout: 20_000 }).not.toBe('');
      await page.reload();
      afterReload = true;
      await ready();
      await expect.poll(() => keys, { timeout: 20_000 }).toContain(originalKey);
      const resume = page.getByRole('button', { name: '继续无声交付（不重新生成）' });
      await expect(resume).toBeVisible();
      await expect(page.getByRole('button', { name: '一键运行W3复刻' })).toBeDisabled();
      await resume.click();
    }
    const runStatus = page.getByRole('complementary', { name: '视频复刻一键运行' });
    const done = runStatus.getByText('15秒无音轨视频已生成并保存', { exact: true });
    const error = runStatus.getByRole('alert');
    await expect(done.or(error)).toBeVisible({ timeout: 25_000 });
    expect(await error.allTextContents()).toEqual([]);
    await expect(done).toBeVisible();
    expect(calls).toEqual(['analysis', 'image', 'video', 'delivery']);
    if (reload) expect(keys).toEqual([originalKey]);
    expect(output).toMatch(/^\/storage\/local\/azhuo\/generated\/videos\/w3-silent\//);
    const saved = join(process.env.BEIKE_BROWSER_DATA_DIR!, output);
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', saved], { encoding: 'utf8' }));
    expect(probe.streams.map((stream: { codec_type: string }) => stream.codec_type)).toEqual(['video']);
    expect(Number(probe.format.duration)).toBe(15);
    expect(Math.min(probe.streams[0].width, probe.streams[0].height)).toBe(768);
    await page.reload();
    await ready();
    await expect.poll(async () => (await readVideoNode(page))?.content).toContain(output);
    expect(calls).toEqual(['analysis', 'image', 'video', 'delivery']);
  });
}
