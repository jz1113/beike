/* global document, window */
// Mocked local regression suite: never submits paid model requests or uses real credentials.
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true });
const evidenceDir = await mkdtemp(join(tmpdir(), 'beike-settings-channels-'));
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('dialog', dialog => dialog.accept());
let fallback = false;
let releaseTest;
let testGate;
await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  if (!path.startsWith('/api/')) return route.continue();
  assert.ok(!path.startsWith('/api/generate/'), 'settings must not generate billable content');
  const data = { success: true, items: [], models: [], recipes: [], personas: [], scenes: [], outfits: [], actions: [], fullPrompts: [] };
  if (path.endsWith('/pricing')) data.prices = { 'gpt-6-luna': { promptPer1k: 0.001, completionPer1k: 0.003 } };
  if (path.endsWith('/models/fetch')) { await testGate; data.isFallback = fallback; }
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
});
await page.addInitScript(() => {
  const model = (id, channel) => ({ id, name: id, shortName: id, channel, isImage: id.includes('image'), isVideo: false, isMultimodal: !id.includes('image') });
  localStorage.setItem('custom_models', JSON.stringify([model('gpt-6-luna', 'comfly'), model('gpt-6-luna', 'openai'), model('gpt-image-2', 'comfly'), model('openai/gpt-image-2', 'lianchi')]));
  for (const key of ['lianchi_model_added_v1', 'gpt6_multimodal_models_added_v1', 'grok47_multimodal_model_added_v1', 'openai_channel_split_v1']) localStorage.setItem(key, 'true');
  localStorage.setItem('ai_api_key', 'test-local-only');
  localStorage.setItem('ai_base_url', 'https://mock.invalid');
  localStorage.setItem('ai_multimodal_model', 'gpt-6-luna');
});
const nav = name => page.getByRole('button', { name, exact: true });
const routes = () => page.locator('[data-model-route]').evaluateAll(rows => rows.map(row => row.getAttribute('data-model-route')));
const stored = () => page.evaluate(() => ({ models: localStorage.getItem('custom_models'), defaultModel: localStorage.getItem('ai_multimodal_model'), key: localStorage.getItem('ai_api_key'), baseUrl: localStorage.getItem('ai_base_url') }));
try {
  await page.goto(`${process.env.BEIKE_BASE_URL || 'http://127.0.0.1:5173'}/?view=settings`);
  await page.locator('[data-model-route="gpt-6-luna"]').waitFor();
  assert.deepEqual(await routes(), ['gpt-6-luna', 'gpt-image-2']);
  assert.equal(await page.getByRole('textbox', { name: '网关 API 接口地址', exact: true }).inputValue(), 'https://mock.invalid');
  assert.ok((await page.getByRole('status').innerText()).includes('未测试'));
  await page.screenshot({ path: join(evidenceDir, 'channels-desktop.png') });

  const initial = await stored();
  await nav('模型管理').click();
  assert.equal((await routes()).length, 4);
  await page.getByLabel('展示排序', { exact: true }).selectOption('price');
  await page.getByRole('button', { name: '刷新 Comfly 报价' }).click();
  await page.getByLabel('搜索模型', { exact: true }).fill('gpt-6');
  assert.deepEqual(await routes(), ['gpt-6-luna', 'openai-responses:gpt-6-luna']);
  assert.deepEqual(await stored(), initial, 'display operations must not persist order, defaults or credentials');
  await page.getByLabel('搜索模型', { exact: true }).fill('');
  await page.screenshot({ path: join(evidenceDir, 'models-desktop.png') });
  await page.locator('[data-model-route="gpt-6-luna"]').getByRole('switch').click();
  assert.equal(await page.locator('[data-model-route="gpt-6-luna"]').getByRole('switch').getAttribute('aria-checked'), 'false');
  assert.equal(await page.locator('[data-model-route="openai-responses:gpt-6-luna"]').getByRole('switch').getAttribute('aria-checked'), 'true');
  await nav('默认模型与调用规则').click();
  assert.ok((await page.getByRole('alert').allTextContents()).some(text => text.includes('gpt-6-luna')));
  assert.equal((await stored()).defaultModel, 'gpt-6-luna', 'disabled default must not be silently overwritten');
  await page.screenshot({ path: join(evidenceDir, 'defaults-desktop.png') });

  await nav('渠道管理').click();
  await page.getByRole('button', { name: /恢复Comfly/ }).click();
  const restored = JSON.parse((await stored()).models);
  assert.equal(restored.filter(model => model.channel === 'openai').length, 1);
  assert.equal(restored.filter(model => model.channel === 'lianchi').length, 1);
  assert.equal((await stored()).key, initial.key);
  assert.equal((await stored()).defaultModel, initial.defaultModel);
  await page.getByRole('button', { name: /OpenAI \/ Responses.*未配置/ }).click();
  assert.deepEqual(await routes(), ['openai-responses:gpt-6-luna']);
  await nav('添加模型').click();
  assert.equal(await page.getByRole('dialog').getByLabel('所属渠道').inputValue(), 'openai');
  await page.getByRole('dialog').getByLabel('上游模型 ID').fill('gpt-6-sol');
  await nav('添加线路').click();
  assert.ok((await routes()).includes('openai-responses:gpt-6-sol'));

  await page.getByRole('button', { name: /Comfly 网关.*未测试/ }).click();
  await nav('测速 Ping').click();
  await page.getByRole('status').filter({ hasText: '测试通过' }).waitFor();
  await page.getByRole('textbox', { name: '网关 API 接口地址', exact: true }).fill('https://edited.invalid');
  assert.ok((await page.getByRole('status').innerText()).includes('未测试'));
  fallback = true;
  await nav('测速 Ping').click();
  await page.getByRole('status').filter({ hasText: '测试失败' }).waitFor();
  fallback = false;
  testGate = new Promise(resolve => { releaseTest = resolve; });
  await nav('测速 Ping').click();
  await page.getByRole('status').filter({ hasText: '测试中' }).waitFor();
  await page.getByRole('textbox', { name: '网关 API 接口地址', exact: true }).fill('https://newer.invalid');
  releaseTest();
  await page.getByRole('status').filter({ hasText: '未测试' }).waitFor();

  const beforeDeepSeek = await stored();
  await page.getByRole('button', { name: /DeepSeek.*未配置/ }).click();
  await page.getByPlaceholder('sk-...').fill('test-deepseek-only');
  await nav('保存 Key').click();
  assert.equal((await stored()).key, beforeDeepSeek.key, 'DeepSeek must not replace the Comfly key');
  assert.equal((await stored()).baseUrl, beforeDeepSeek.baseUrl, 'DeepSeek must not replace the Comfly URL');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('设置分类', { exact: true }).selectOption('models');
  await page.getByLabel('筛选渠道', { exact: true }).selectOption('openai');
  assert.deepEqual((await routes()).sort(), ['openai-responses:gpt-6-luna', 'openai-responses:gpt-6-sol']);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'mobile viewport must not overflow');
  await page.screenshot({ path: join(evidenceDir, 'models-mobile.png') });
  await page.getByLabel('设置分类', { exact: true }).selectOption('other_services');
  assert.equal(await page.getByLabel('选择接口服务', { exact: true }).locator('option').count(), 4);
  assert.deepEqual(errors, []);
  console.log('PASS: channel isolation, immutable display sorting, enablement/default warning, scoped restore, channel-aware add, verified/stale/fallback test states, mobile navigation');
  console.log('Evidence:', evidenceDir);
} catch (error) {
  console.error(await page.locator('body').innerText());
  throw error;
} finally { await browser.close(); }
