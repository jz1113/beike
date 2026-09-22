import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reduceBatch } from './reducer.ts';
import { WORKSHOP_BATCH_STATUSES } from './states.ts';

test('follows the happy path from draft to archived', () => {
  const steps = [
    [{ type: 'START_COLLECTION' }, 'collecting'],
    [{ type: 'COLLECTION_FINISHED' }, 'plan_ready'],
    [{ type: 'CONFIRM_PLAN', planRevision: 1 }, 'plan_ready'],
    [{ type: 'START_ANALYSIS', runId: 'run-a' }, 'analyzing'],
    [{ type: 'ANALYSIS_FINISHED', result: 'success' }, 'review_required'],
    [{ type: 'APPROVE_STORYBOARD', storyboardRevision: 1 }, 'approved'],
    [{ type: 'START_GENERATION', runId: 'run-g' }, 'generating'],
    [{ type: 'GENERATION_FINISHED', result: 'success' }, 'qc_required'],
    [{ type: 'COMPLETE_BATCH' }, 'completed'],
    [{ type: 'ARCHIVE_BATCH' }, 'archived'],
  ];
  let status = 'draft';
  for (const [event, expected] of steps) {
    const result = reduceBatch(status, event);
    assert.equal(result.ok, true, `${event.type} from ${status}`);
    if (result.ok) status = result.next;
    assert.equal(status, expected);
  }
});

test('rejects illegal transitions instead of throwing', () => {
  const result = reduceBatch('draft', { type: 'COMPLETE_BATCH' });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /不允许/);
});

test('pauses and resumes back to the original generating status', () => {
  const paused = reduceBatch('generating', { type: 'PAUSE_RUN', runId: 'run-g' });
  assert.equal(paused.ok, true);
  if (!paused.ok) return;
  assert.equal(paused.next, 'paused');
  assert.equal(paused.pausedFrom, 'generating');
  const resumed = reduceBatch('paused', { type: 'RESUME_RUN', runId: 'run-g' }, { pausedFrom: 'generating' });
  assert.equal(resumed.ok, true);
  if (resumed.ok) assert.equal(resumed.next, 'generating');
});

test('resume without pausedFrom fails', () => {
  const result = reduceBatch('paused', { type: 'RESUME_RUN', runId: 'run-g' });
  assert.equal(result.ok, false);
});

test('analysis and generation partial failures go to partial_failed', () => {
  const analysis = reduceBatch('analyzing', { type: 'ANALYSIS_FINISHED', result: 'partial_failed' });
  assert.equal(analysis.ok, true);
  if (analysis.ok) assert.equal(analysis.next, 'partial_failed');
  const generation = reduceBatch('generating', { type: 'GENERATION_FINISHED', result: 'partial_failed' });
  assert.equal(generation.ok, true);
  if (generation.ok) assert.equal(generation.next, 'partial_failed');
});

test('partial_failed can retry analysis or generation', () => {
  const retryAnalysis = reduceBatch('partial_failed', { type: 'START_ANALYSIS', runId: 'run-a2' });
  assert.equal(retryAnalysis.ok, true);
  if (retryAnalysis.ok) assert.equal(retryAnalysis.next, 'analyzing');
  const retryGeneration = reduceBatch('partial_failed', { type: 'START_GENERATION', runId: 'run-g2' });
  assert.equal(retryGeneration.ok, true);
  if (retryGeneration.ok) assert.equal(retryGeneration.next, 'generating');
});

test('cancel is allowed from every incomplete status', () => {
  for (const status of WORKSHOP_BATCH_STATUSES) {
    const result = reduceBatch(status, { type: 'CANCEL_BATCH' });
    if (status === 'completed' || status === 'archived' || status === 'cancelled') {
      assert.equal(result.ok, false, status);
    } else {
      assert.equal(result.ok, true, status);
      if (result.ok) assert.equal(result.next, 'cancelled');
    }
  }
});

test('completed cannot be archived from draft; archive requires completed or cancelled', () => {
  assert.equal(reduceBatch('draft', { type: 'ARCHIVE_BATCH' }).ok, false);
  const fromCompleted = reduceBatch('completed', { type: 'ARCHIVE_BATCH' });
  assert.equal(fromCompleted.ok, true);
  if (fromCompleted.ok) assert.equal(fromCompleted.next, 'archived');
});
