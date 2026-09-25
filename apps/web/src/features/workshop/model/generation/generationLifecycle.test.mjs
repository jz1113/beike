import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { prepareTaskRetry, acknowledgeUncertainTasks } from './taskRetry.ts';
import { mergeGenerationTasks, needsGenerationSubmit } from './mergeGenerationTasks.ts';
import { recoverWorkspace } from '../workspace/workspaceRecovery.ts';

async function load(relativePath) {
  const bundle = await build({ entryPoints: [fileURLToPath(new URL(relativePath, import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'esm', define: { 'import.meta.env': '{}' },
    plugins: [{ name: 'grid-slicer', setup(build) {
      build.onLoad({ filter: /imageGridSlicer\.ts$/ }, () => ({ contents: 'export async function sliceGridImage2x2Blobs() { return [1,2,3,4].map(() => new Blob(["image"], {type:"image/jpeg"})); }' }));
    } }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
}
const coordinator = await load('./batchGenerationCoordinator.ts');
const { recheckWorkshopTask } = await load('./recheckWorkshopTask.ts');
const { submitImageGenTaskResult } = await load('../../../../shared/api/generationApi.ts');
const config = { selectedQuality: 'high', selectedAspect: '3:4', selectedImageGenModel: 'gpt-image-2', selectedShotCount: 4, isAborted: () => false };
const mergeContext = { batchId: 'batch', storyboardRevision: 0, model: 'gpt-image-2', aspectRatio: '3:4', quality: 'high' };
const product = (extra = {}) => ({ id: 'p', itemId: 'p', title: '陶瓷杯', status: 'success', selected: true,
  selectedProductImages: ['https://example.test/product.jpg'], analyzedSuccess: true,
  prompts: [1, 2, 3, 4].map(shot_no => ({ shot_no, title: `视角 ${shot_no}`, prompt: `product view ${shot_no}`, has_human: false })), tasks: [], ...extra });
function context(initial, extra = {}) {
  const itemsRef = { current: initial };
  const messages = [];
  const state = {};
  const deps = { config, generationStrategy: 'single_shot', imageGenConcurrency: 1, itemsRef,
    setItems: update => { itemsRef.current = typeof update === 'function' ? update(itemsRef.current) : update; },
    runControlRef: { current: { status: 'running' } }, batchId: 'batch', storyboardRevision: 0,
    showToast: message => messages.push(message), setCurrentStage: value => { state.stage = value; },
    setIsGeneratingBatch: value => { state.busy = value; }, setTotalTaskCount: value => { state.total = value; },
    setCompletedTaskCount: value => { state.done = value; }, setSuccessTaskCount: value => { state.success = value; },
    setFailTaskCount: value => { state.failed = value; }, autoGenerateCopywriting: false,
    generateAllCopywriting: async () => {}, ...extra };
  return { deps, itemsRef, messages, state };
}
const reply = (data, status = 200) => Response.json(data, { status });

test('uncertain submissions block every automatic retry and can recover by task key without POST', async t => {
  let posts = 0;
  t.mock.method(globalThis, 'fetch', async (_url, init) => { assert.equal(init.method, 'POST'); posts++; throw new TypeError('Failed to fetch'); });
  const ctx = context([product()]);
  await coordinator.startBatchGenerationCoordinator(ctx.deps);
  assert.equal(posts, 4);
  assert.ok(ctx.itemsRef.current[0].tasks.every(task => task.recoveryRequired));
  await coordinator.startBatchGenerationCoordinator(ctx.deps);
  await coordinator.retryFailedImageTasksCoordinator(ctx.deps, ctx.itemsRef.current, false);
  await coordinator.retrySingleShotTaskCoordinator('p', 0, ctx.itemsRef.current, ctx.deps.setItems, config, ctx.deps.showToast);
  assert.equal(posts, 4);
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.notEqual(init.method, 'POST'); assert.match(url, /taskKey=/);
    return reply({ status: 'SUCCESS', resultUrl: '/storage/recovered.jpg', taskId: 'upstream' });
  });
  await recheckWorkshopTask('p', ctx.itemsRef.current[0].tasks[0].id, ctx.itemsRef.current, ctx.deps.setItems, ctx.deps.showToast);
  assert.equal(ctx.itemsRef.current[0].tasks[0].status, 'SUCCESS');
  assert.equal(ctx.itemsRef.current[0].tasks[0].recoveryRequired, false);
  assert.equal(ctx.itemsRef.current[0].tasks[0].upstreamTaskId, 'upstream');
});

test('persistence-error responses retain upstream ID before rejecting, and cancel after acceptance remains uncertain', async t => {
  let submitted;
  t.mock.method(globalThis, 'fetch', async () => reply({ success: false, error: 'db error', taskId: 'accepted' }, 500));
  await assert.rejects(submitImageGenTaskResult({ prompt: 'p' }, { isAborted: () => false, onTaskSubmitted: id => { submitted = id; } }), error => error.recoveryRequired === true);
  assert.equal(submitted, 'accepted');
  let aborted = false;
  t.mock.method(globalThis, 'fetch', async () => reply({ success: true, taskId: 'accepted' }));
  await assert.rejects(submitImageGenTaskResult({ prompt: 'p' }, { isAborted: () => aborted, onTaskSubmitted: () => { aborted = true; } }), error => error.recoveryRequired === true);
});

test('explicit validation rejection is retryable after correction, malformed success remains uncertain', async t => {
  t.mock.method(globalThis, 'fetch', async () => reply({ success: false, error: 'missing reference' }, 400));
  await assert.rejects(submitImageGenTaskResult({ prompt: 'p' }, { isAborted: () => false }), error => !error.recoveryRequired);
  t.mock.method(globalThis, 'fetch', async () => reply({ success: true }));
  await assert.rejects(submitImageGenTaskResult({ prompt: 'p' }, { isAborted: () => false }), error => error.recoveryRequired === true);
});

test('confirmed terminal failure clears the recovery gate; query failures do not', async t => {
  const p = product(); p.tasks = mergeGenerationTasks(p, mergeContext).map(task => ({ ...task, status: 'FAILURE', recoveryRequired: true }));
  const ctx = context([p]);
  t.mock.method(globalThis, 'fetch', async () => reply({ status: 'QUERY_FAILED', error: 'unknown' }));
  await recheckWorkshopTask('p', p.tasks[0].id, ctx.itemsRef.current, ctx.deps.setItems, ctx.deps.showToast);
  assert.equal(ctx.itemsRef.current[0].tasks[0].recoveryRequired, true);
  t.mock.method(globalThis, 'fetch', async () => reply({ status: 'FAILURE', failReason: 'rejected' }));
  await recheckWorkshopTask('p', p.tasks[0].id, ctx.itemsRef.current, ctx.deps.setItems, ctx.deps.showToast);
  assert.equal(ctx.itemsRef.current[0].tasks[0].recoveryRequired, false);
});

test('late recovery cannot overwrite a different attempt', async t => {
  const p = product(); p.tasks = mergeGenerationTasks(p, mergeContext).map(task => ({ ...task, status: 'FAILURE', recoveryRequired: true }));
  const ctx = context([p]);
  let resolve;
  t.mock.method(globalThis, 'fetch', () => new Promise(done => { resolve = done; }));
  const running = recheckWorkshopTask('p', p.tasks[0].id, ctx.itemsRef.current, ctx.deps.setItems, ctx.deps.showToast);
  ctx.deps.setItems(items => items.map(item => ({ ...item, tasks: item.tasks.map(prepareTaskRetry) })));
  resolve(reply({ status: 'SUCCESS', resultUrl: '/storage/old.jpg' }));
  await running;
  assert.equal(ctx.itemsRef.current[0].tasks[0].resultUrl, undefined);
});

test('retry clears all old grid metadata and approval; superseded identical prompt gets a new operation key', () => {
  const p = product(); const old = mergeGenerationTasks(p, mergeContext)[0];
  const stale = { ...old, status: 'SUCCESS', resultUrl: '/storage/old.jpg', resultStatus: 'superseded', outputReview: 'accepted', upstreamTaskId: 'old', gridTaskKey: 'old-grid', gridSourceUrl: '/storage/grid.jpg' };
  const next = prepareTaskRetry(stale);
  assert.equal(next.upstreamTaskId, undefined); assert.equal(next.gridTaskKey, undefined);
  assert.equal(next.gridSourceUrl, undefined); assert.equal(next.outputReview, 'unreviewed');
  assert.notEqual(next.idempotencyKey, old.idempotencyKey);
  const merged = mergeGenerationTasks({ ...p, tasks: [stale] }, mergeContext)[0];
  assert.notEqual(merged.idempotencyKey, old.idempotencyKey);
  assert.equal(needsGenerationSubmit({ ...old, status: 'FAILURE', recoveryRequired: true }), false);
});

test('grid retry generates a new grid once and preserves successful shots, rather than querying old failure', async t => {
  const p = product({ gridPrompt: 'four cup views', masterGridUrl: '/storage/old-grid.jpg' });
  p.tasks = mergeGenerationTasks(p, { ...mergeContext, generationStrategy: 'grid_first' }).map((task, index) => ({ ...task,
    status: index === 0 ? 'SUCCESS' : 'FAILURE', resultUrl: index === 0 ? '/storage/keep.jpg' : undefined,
    gridTaskKey: 'old-grid-key', upstreamTaskId: 'old-upstream', outputReview: 'accepted' }));
  const ctx = context([p], { generationStrategy: 'grid_first' });
  let generations = 0; let uploads = 0;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(init.method, 'POST');
    if (url.includes('/upload')) { uploads++; return reply({ success: true, url: `/storage/new-${uploads}.jpg` }); }
    generations++; assert.equal(JSON.parse(init.body).isGrid2x2, true);
    return reply({ success: true, status: 'SUCCESS', resultUrl: '/storage/new-grid.jpg' });
  });
  await coordinator.retryFailedImageTasksCoordinator(ctx.deps, ctx.itemsRef.current, false);
  assert.equal(generations, 1); assert.equal(uploads, 3);
  assert.equal(ctx.itemsRef.current[0].tasks[0].resultUrl, '/storage/keep.jpg');
  assert.ok(ctx.itemsRef.current[0].tasks.every(task => task.status === 'SUCCESS'));
  assert.equal(ctx.state.success, 3);
});

test('grid recovery of a terminal failed upstream unblocks deliberate retry without generation', async t => {
  const p = product({ gridPrompt: 'four views' });
  p.tasks = mergeGenerationTasks(p, mergeContext).map(task => ({ ...task, status: 'FAILURE', gridTaskKey: 'original', recoveryRequired: true }));
  const ctx = context([p]);
  t.mock.method(globalThis, 'fetch', async (_url, init) => { assert.notEqual(init.method, 'POST'); return reply({ status: 'FAILURE', failReason: 'upstream rejected' }); });
  await recheckWorkshopTask('p', p.tasks[0].id, ctx.itemsRef.current, ctx.deps.setItems, ctx.deps.showToast);
  assert.ok(ctx.itemsRef.current[0].tasks.every(task => !task.recoveryRequired));
});

test('refresh preserves unsubmitted pending tasks, while submitted tasks require recovery', () => {
  const p = product(); p.tasks = mergeGenerationTasks(p, mergeContext);
  p.tasks[1].status = 'IN_PROGRESS';
  const restored = recoverWorkspace({ items: [p], pipeline: { status: 'generating' } });
  assert.equal(restored.items[0].tasks[0].status, 'PENDING');
  assert.equal(restored.items[0].tasks[0].recoveryRequired, undefined);
  assert.equal(restored.items[0].tasks[1].recoveryRequired, true);
  const acknowledged = acknowledgeUncertainTasks(restored.items);
  assert.equal(acknowledged[0].tasks[1].recoveryRequired, false);
});

test('cancelled queue leaves unstarted shots pending and does not count them as failures', async t => {
  const ctx = context([product()]);
  let count = 0;
  t.mock.method(globalThis, 'fetch', async () => { count++; ctx.deps.runControlRef.current.status = 'cancelled'; return reply({ success: true, status: 'SUCCESS', resultUrl: '/storage/first.jpg' }); });
  await coordinator.startBatchGenerationCoordinator(ctx.deps);
  assert.equal(count, 1);
  assert.equal(ctx.itemsRef.current[0].tasks.filter(task => task.status === 'PENDING').length, 3);
  assert.equal(ctx.state.busy, false);
});

test('cancelling while POST is in flight still saves its upstream ID and requires recovery', async t => {
  let aborted = false; let submitted;
  t.mock.method(globalThis, 'fetch', async () => { aborted = true; return reply({ success: true, taskId: 'accepted-before-cancel' }); });
  await assert.rejects(submitImageGenTaskResult({ prompt: 'p' }, { isAborted: () => aborted, onTaskSubmitted: id => { submitted = id; } }), error => error.recoveryRequired === true);
  assert.equal(submitted, 'accepted-before-cancel');
});

test('failed-only retry validates current references and storyboard before submitting', async t => {
  t.mock.method(globalThis, 'fetch', async () => { assert.fail('invalid storyboard must not submit'); });
  const p = product({ analyzedSuccess: false });
  p.tasks = mergeGenerationTasks(p, mergeContext).map(task => ({ ...task, status: 'FAILURE' }));
  const ctx = context([p]);
  await coordinator.retryFailedImageTasksCoordinator(ctx.deps, ctx.itemsRef.current, false);
  assert.match(ctx.messages.at(-1), /尚未完成分镜分析/);
  assert.equal(ctx.itemsRef.current[0].tasks[0].attempt, 0);
});
