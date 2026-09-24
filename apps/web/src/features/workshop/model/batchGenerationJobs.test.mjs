import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBatchGenerationJobs } from './batchGenerationJobs.ts';
import { runGenerationJobs } from './batchImageGeneration.ts';

const products = () => Array.from({ length: 5 }, (_, i) => ({
  id: `product${i}`, prompts: [1, 2, 3, 4].map((shot_no) => ({ shot_no, selected: true })),
  tasks: [1, 2, 3, 4].map((shot_no) => ({ shot_no, status: 'PENDING' })),
}));
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('five products produce twenty single-image jobs in fair shot order', () => {
  const jobs = buildBatchGenerationJobs(products(), 'single_shot');
  assert.equal(jobs.length, 20);
  assert.ok(jobs.every((job) => job.shots.length === 1));
  assert.deepEqual(jobs.slice(0, 5).map((job) => job.item.id), products().map((item) => item.id));
  assert.ok(jobs.slice(0, 5).every((job) => job.shots[0].shot_no === 1));
});

test('grid strategy submits one group per product', () => {
  const jobs = buildBatchGenerationJobs(products(), 'grid_first');
  assert.equal(jobs.length, 5);
  assert.ok(jobs.every((job) => job.shots.length === 4));
});

test('completed, running, superseded and deselected shots are not resubmitted', () => {
  const [item] = products();
  item.tasks[0] = { shot_no: 1, status: 'SUCCESS', resultUrl: '/storage/a.png' };
  item.tasks[1].status = 'IN_PROGRESS';
  item.tasks[2].resultStatus = 'superseded';
  item.prompts[3].selected = false;
  assert.deepEqual(buildBatchGenerationJobs([item], 'single_shot'), []);
});

test('16 concurrency starts 16 real requests, refills immediately and never exceeds the limit', async () => {
  const jobs = buildBatchGenerationJobs(products(), 'single_shot');
  const releases = [];
  let started = 0; let active = 0; let maxActive = 0;
  const execution = runGenerationJobs({ jobs, concurrency: 16, isAborted: () => false,
    execute: async () => {
      started++; active++; maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => releases.push(resolve));
      active--;
    },
  });
  assert.equal(started, 16);
  releases.shift()();
  await tick();
  assert.equal(started, 17);
  while (releases.length) { releases.shift()(); await tick(); }
  await execution;
  assert.equal(started, 20);
  assert.equal(maxActive, 16);
});

test('cancellation prevents unsent shots from starting', async () => {
  let cancelled = false; const started = [];
  await runGenerationJobs({ jobs: [1, 2, 3, 4], concurrency: 1, isAborted: () => cancelled,
    execute: async (job) => { started.push(job); cancelled = true; },
  });
  assert.deepEqual(started, [1]);
});

test('pausing prevents new submissions until resumed', async () => {
  let paused = true; const started = [];
  const execution = runGenerationJobs({ jobs: [1, 2], concurrency: 2, isAborted: () => false, isPaused: () => paused,
    execute: async (job) => { started.push(job); },
  });
  await tick();
  assert.deepEqual(started, []);
  paused = false;
  await execution;
  assert.deepEqual(started, [1, 2]);
});
