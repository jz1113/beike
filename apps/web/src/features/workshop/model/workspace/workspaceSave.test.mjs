import assert from 'node:assert/strict';
import { test } from 'node:test';
import { workshopBatchSchema } from '@beike/contracts/workshopBatches';
import { emptyPipelineState } from '@beike/contracts/workshopWorkspace';
import { WorkspaceSaveSession, serializeWorkspaceSnapshot } from './workspaceSave.ts';

function fixture() {
  const initial = workshopBatchSchema.parse({
    id: 'batch_test', name: 'Test', status: 'draft', revision: 1,
    createdAt: '2026-09-25T00:00:00.000Z', updatedAt: '2026-09-25T00:00:00.000Z',
    snapshot: {
      version: 2, mode: 'original', currentStage: 1, batchInputText: '', items: [], pipeline: emptyPipelineState('draft'),
      settings: {
        selectedVisionModel: 'test', selectedImageGenModel: 'test', selectedArchId: 'test',
        selectedQuality: 'high', selectedAspect: '3:4', selectedShotCount: 4,
        useAssetLibrary: true, lockedPersonaId: 'auto', lockedSceneId: 'auto',
        lockedOutfitId: 'auto', lockedActionId: 'auto', generationStrategy: 'grid_first',
      },
    },
  });
  const state = { remote: structuredClone(initial), calls: [], fail: null, now: 0 };
  const fetch = async (_url, init) => {
    state.calls.push(init?.method || 'GET');
    if (!init?.method) {
      if (state.fail === 'offline') throw new TypeError('offline');
      return Response.json({ batch: state.remote });
    }
    if (state.fail === 'offline' || state.fail === 'before-commit') throw new TypeError('network');
    if (state.fail === 'server-error') return Response.json({ error: 'busy' }, { status: 503 });
    if (state.fail === 'forbidden') return Response.json({ error: '需要有效访问令牌' }, { status: 401 });
    const body = JSON.parse(init.body);
    if (body.revision !== state.remote.revision) return Response.json({ error: 'conflict' }, { status: 409 });
    state.remote = { ...state.remote, revision: body.revision + 1, snapshot: body.snapshot };
    if (state.fail === 'after-commit') throw new TypeError('lost response');
    return Response.json({ revision: state.remote.revision, updatedAt: state.remote.updatedAt });
  };
  return {
    state, session: new WorkspaceSaveSession(initial), options: { fetch, now: () => state.now },
    json: text => serializeWorkspaceSnapshot({ ...initial.snapshot, batchInputText: text }),
  };
}

test('temporary failure retries after backoff without reloading local edits', async () => {
  const { session, state, options, json } = fixture();
  state.fail = 'before-commit';
  await assert.rejects(session.save(json('edited'), options), /network/);
  assert.equal(session.blocked, false);
  assert.equal(await session.save(json('edited'), options), false);
  assert.deepEqual(state.calls, ['PUT']);
  state.fail = null; state.now = 1200;
  assert.equal(await session.save(json('edited'), options), true);
  assert.deepEqual(state.calls, ['PUT', 'GET', 'PUT']);
  assert.equal(session.savedJson, json('edited'));
});

test('lost successful response is confirmed without a duplicate write', async () => {
  const { session, state, options, json } = fixture();
  state.fail = 'after-commit';
  await assert.rejects(session.save(json('edited'), options));
  state.fail = null;
  assert.equal(await session.save(json('edited'), { ...options, force: true }), true);
  assert.deepEqual(state.calls, ['PUT', 'GET']);
  assert.equal(session.revision, 2);
});

test('edits made while offline are saved after confirming the prior write', async () => {
  const { session, state, options, json } = fixture();
  state.fail = 'after-commit';
  await assert.rejects(session.save(json('first'), options));
  state.fail = null;
  assert.equal(await session.save(json('newer local edit'), { ...options, force: true }), true);
  assert.equal(session.revision, 3);
  assert.equal(state.remote.snapshot.batchInputText, 'newer local edit');
});

test('reverting to the old local snapshot still reconciles an uncertain write', async () => {
  const { session, state, options, json } = fixture();
  state.fail = 'after-commit';
  await assert.rejects(session.save(json('first'), options));
  state.fail = null;
  await session.save(json(''), { ...options, force: true });
  assert.equal(state.remote.snapshot.batchInputText, '');
  assert.equal(session.revision, 3);
});

test('another window change blocks writes and manual retry cannot overwrite it', async () => {
  const { session, state, options, json } = fixture();
  state.fail = 'before-commit';
  await assert.rejects(session.save(json('local edit'), options));
  state.remote.revision = 2;
  state.remote.snapshot.batchInputText = 'other window';
  state.fail = null;
  await assert.rejects(session.save(json('local edit'), { ...options, force: true }), /其他窗口/);
  assert.equal(session.blocked, true);
  assert.equal(await session.save(json('local edit'), options), false);
  await assert.rejects(session.save(json('local edit'), { ...options, force: true }), /其他窗口/);
  assert.equal(state.remote.snapshot.batchInputText, 'other window');
  assert.equal(state.calls.filter(c => c === 'PUT').length, 1);
});

test('a first-attempt 409 is reconciled rather than blindly retried', async () => {
  const { session, state, options, json } = fixture();
  state.remote.revision = 2;
  state.remote.snapshot.batchInputText = 'another writer';
  await assert.rejects(session.save(json('mine'), options), /其他窗口/);
  assert.equal(session.blocked, true);
  assert.deepEqual(state.calls, ['PUT', 'GET']);
});

test('server errors and failed reconciliation remain retryable; auth errors require manual retry', async () => {
  const { session, state, options, json } = fixture();
  state.fail = 'server-error';
  await assert.rejects(session.save(json('mine'), options), /busy/);
  state.fail = 'offline'; state.now = 1200;
  await assert.rejects(session.save(json('mine'), options), /offline/);
  assert.equal(session.blocked, false);
  state.fail = 'forbidden';
  await assert.rejects(session.save(json('mine'), { ...options, force: true }), /访问令牌/);
  assert.equal(session.blocked, true);
  state.fail = null;
  assert.equal(await session.save(json('mine'), { ...options, force: true }), true);
});

test('a 409 for the exact committed attempt is acknowledged without another write', async () => {
  const { session, state, options, json } = fixture();
  state.remote.revision = 2;
  state.remote.snapshot.batchInputText = 'mine';
  assert.equal(await session.save(json('mine'), options), true);
  assert.equal(session.revision, 2);
  assert.equal(session.blocked, false);
  assert.deepEqual(state.calls, ['PUT', 'GET']);
});

test('an invalid successful acknowledgement is reconciled before retrying', async () => {
  const { session, state, options, json } = fixture();
  const fetch = async (url, init) => {
    const response = await options.fetch(url, init);
    return init?.method === 'PUT' ? Response.json({ revision: 999 }) : response;
  };
  await assert.rejects(session.save(json('mine'), { ...options, fetch }), /尚未确认/);
  assert.equal(session.hasPendingSave, true);
  assert.equal(await session.save(json('mine'), { ...options, force: true }), true);
  assert.equal(session.revision, 2);
  assert.deepEqual(state.calls, ['PUT', 'GET']);
});

test('archiving during a failed save blocks retries without losing the local draft', async () => {
  const { session, state, options, json } = fixture();
  state.fail = 'before-commit';
  await assert.rejects(session.save(json('local draft'), options));
  state.fail = null;
  state.remote.status = 'archived';
  await assert.rejects(session.save(json('local draft'), { ...options, force: true }), /归档/);
  assert.equal(session.blocked, true);
  assert.deepEqual(state.calls, ['PUT', 'GET']);
});
