// Home entry regression suite. All API calls are mocked; no production data/model calls.
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const evidenceDir = await mkdtemp(join(tmpdir(), 'beike-workshop-entry-'));
const browser = await chromium.launch({ headless: true });
const baseUrl = process.env.BEIKE_BASE_URL || 'http://127.0.0.1:5173';
const settings={selectedVisionModel:'gemini-3.7-flash', selectedImageGenModel:'gpt-image-2',selectedArchId:'recipe_phone_comms_master',selectedQuality:'high',selectedAspect:'3:4',selectedShotCount:4,useAssetLibrary:false,lockedPersonaId:'auto',lockedSceneId:'auto',lockedOutfitId:'auto',lockedActionId:'auto',lockedFullPromptId:'auto',generationStrategy:'single_shot',autoGenerateCopywriting:false,personaMode:'none',hasHumanPersona:false};
const item={id:'p',itemId:'123456',platform:'jd',title:'测试手机',price:99,category:'数码',brand:'测试',coverImage:'/test-product.svg',mainImages:[],skuImages:[],detailImages:[],props:{},status:'success',selected:true,allTypedImages:[],selectedProductImages:['/test-product.svg'],analyzedSuccess:true,prompts:[1,2,3,4].map(shot_no=>({shot_no,title:`镜头 ${shot_no}`,prompt:`product view ${shot_no}`})),tasks:[1,2,3,4].map(shot_no=>({id:`t${shot_no}`,shot_no,title:`镜头 ${shot_no}`,prompt:`product view ${shot_no}`,status:'FAILURE',idempotencyKey:`test-key-${shot_no}`,recoveryRequired:true,error:'Comfly upstream timeout 504；提交结果未确认，需要核对原任务'}))};
const snapshot={version:2,mode:'original',currentStage:4,batchInputText:'',settings,pipeline:{status:'partial_failed',planRevision:0,storyboardRevision:0,diversityContext:{groupSignatures:[],actionIds:[],sceneIds:[]},runs:[]},items:[item]};

const emptySnapshot = () => ({ ...structuredClone(snapshot), items: [], batchInputText: '', currentStage: 1, pipeline: { ...snapshot.pipeline, status: 'draft' } });
const makeBatch = (snapshot, id = 'previous-batch') => ({ id, name: id, revision: 1, status: snapshot.pipeline.status, snapshot, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
async function scenario(name, initial, run) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const state = { batch: makeBatch(initial), archives: [], calls: [], errors: [], failArchive: false, failSave: false, archiveDelay: 0, collectionGate: null };
  page.on('pageerror', error => state.errors.push(error.message));
  await page.route('**/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname, method = req.method();
    if (!path.startsWith('/api/')) return route.continue();
    state.calls.push(`${method} ${path}`);
    let data = { success: true, items: [], recipes: [], personas: [], scenes: [], outfits: [], actions: [], fullPrompts: [] }, status = 200;
    if (path === '/api/catalog/collect') {
      await state.collectionGate;
      data = { success: true, product: { title: '后台采集完成的商品', mainImages: ['/test-product.svg'] } };
    } else if (path === '/api/catalog/workshop-batches/active') data = { batch: state.batch };
    else if (path === '/api/catalog/workshop-batches/active/archive') {
      if (state.archiveDelay) await new Promise(resolve => setTimeout(resolve, state.archiveDelay));
      if (state.failArchive) { status = 500; data = { error: '模拟归档失败' }; }
      else {
        state.archives.push(structuredClone(state.batch));
        state.batch = makeBatch(emptySnapshot(), `fresh-${state.archives.length}`);
        data = { batch: state.batch };
      }
    } else if (path === '/api/catalog/workshop-batches') data = { batches: [] };
    else if (path.startsWith('/api/catalog/workshop-batches/') && method === 'PUT') {
      if (state.failSave) { status = 500; data = { error: '模拟保存失败' }; }
      else {
        const body = req.postDataJSON();
        assert.equal(path.split('/').pop(), state.batch.id, 'must never save old content into the new batch');
        assert.equal(body.revision, state.batch.revision);
        state.batch.snapshot = body.snapshot;
        state.batch.revision++;
        data = { revision: state.batch.revision, updatedAt: new Date().toISOString() };
      }
    } else if (path.startsWith('/api/generate/')) throw new Error('entry must never submit a model request');
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });
  const homeEntry = async () => {
    if (await page.getByRole('button', { name: '原创种草工坊', exact: true }).isVisible()) await page.getByRole('button', { name: '原创种草工坊', exact: true }).click();
    else await page.getByRole('button', { name: '首页', exact: true }).click();
    await page.getByRole('button', { name: '种草工坊：开始创作', exact: true }).click();
  };
  const waitReady = async () => { await page.getByRole('button', { name: '新建批次', exact: true }).waitFor(); };
  try {
    await run({ page, state, homeEntry, waitReady });
    assert.deepEqual(state.errors, []);
    await page.screenshot({ path: join(evidenceDir, `${name}.png`), fullPage: true });
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.log(name, state.calls, await page.locator('body').innerText());
    throw error;
  } finally { await page.close(); }
}
try {
  await scenario('home-entry-and-cached-reentry', structuredClone(snapshot), async ({ page, state, homeEntry, waitReady }) => {
    state.archiveDelay = 350;
    await page.goto(baseUrl);
    await page.getByRole('button', { name: '种草工坊：开始创作', exact: true }).click();
    await waitReady();
    assert.equal(state.archives.length, 1, 'StrictMode must archive exactly once');
    assert.equal(state.archives[0].snapshot.items.length, 1);
    assert.equal(state.batch.snapshot.items.length, 0);
    assert.equal(new URL(page.url()).searchParams.get('step'), '1');
    assert.equal(await page.getByText('测试手机', { exact: true }).count(), 0);
    await homeEntry(); await waitReady();
    assert.equal(state.archives.length, 1, 'empty reentry must reuse batch');
    // Only input, not yet collected: still belongs to the old batch and must be archived.
    await page.locator('textarea').first().fill('https://item.jd.com/123456.html');
    await homeEntry(); await waitReady();
    assert.equal(state.archives.length, 2);
    assert.equal(state.archives[1].snapshot.batchInputText, 'https://item.jd.com/123456.html');
    assert.equal(await page.locator('textarea').first().inputValue(), '');
    await page.waitForTimeout(1500);
    assert.equal(state.batch.snapshot.items.length, 0, 'autosave must not restore old items');
    assert.equal(state.batch.snapshot.batchInputText, '');
  });
  await scenario('deep-link-and-refresh-restore', structuredClone(snapshot), async ({ page, state, waitReady }) => {
    await page.goto(`${baseUrl}/?view=workshop&step=4`); await waitReady();
    assert.equal(await page.getByRole('button', { name: '核对原任务', exact: true }).count(), 4);
    await page.reload(); await waitReady();
    assert.equal(await page.getByRole('button', { name: '核对原任务', exact: true }).count(), 4);
    assert.equal(state.archives.length, 0);
  });
  await scenario('archive-failure-preserves-old-work', structuredClone(snapshot), async ({ page, state, homeEntry, waitReady }) => {
    state.failArchive = true;
    await page.goto(baseUrl); await homeEntry(); await waitReady();
    await page.getByText('模拟归档失败', { exact: false }).first().waitFor();
    assert.equal(await page.getByRole('button', { name: '核对原任务', exact: true }).count(), 4);
    assert.equal(state.archives.length, 0);
    state.failArchive = false;
    await homeEntry(); await waitReady();
    assert.equal(state.archives.length, 1);
  });
  await scenario('unsaved-input-blocks-reentry', emptySnapshot(), async ({ page, state, homeEntry, waitReady }) => {
    await page.goto(`${baseUrl}/?view=workshop&step=1`); await waitReady();
    state.failSave = true;
    await page.locator('textarea').first().fill('https://item.jd.com/987654.html');
    await homeEntry(); await waitReady();
    assert.equal(state.archives.length, 0);
    assert.equal(await page.locator('textarea').first().inputValue(), 'https://item.jd.com/987654.html');
    assert.ok((await page.locator('body').innerText()).includes('尚未确认保存'));
  });
  await scenario('running-task-blocks-fresh-entry', emptySnapshot(), async ({ page, state, homeEntry, waitReady }) => {
    let release;
    state.collectionGate = new Promise(resolve => { release = resolve; });
    await page.goto(`${baseUrl}/?view=workshop&step=1`); await waitReady();
    await page.locator('textarea').first().fill('https://item.jd.com/123456.html');
    const collecting = page.waitForRequest(request => new URL(request.url()).pathname === '/api/catalog/collect');
    await page.getByRole('button', { name: '智能采编', exact: true }).click();
    await collecting;
    await homeEntry(); await waitReady();
    assert.equal(state.archives.length, 0, 'in-flight work must not be archived');
    assert.ok((await page.locator('body').innerText()).includes('仍有任务执行中'));
    release();
    await page.getByText('后台采集完成的商品', { exact: true }).waitFor();
    await homeEntry(); await waitReady();
    assert.equal(state.archives.length, 1);
    assert.equal(state.archives[0].snapshot.items[0].title, '后台采集完成的商品');
  });
  console.log('Evidence:', evidenceDir);
} finally { await browser.close(); }
