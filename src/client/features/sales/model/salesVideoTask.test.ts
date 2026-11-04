import { describe, expect, it } from 'vitest';
import { emptySalesProductionPlan, parseSalesProductionPlan, planForSelectedScript } from './salesProductionDraft';
import { patchSalesProductionPlan, staleSalesProductionOutputs } from './salesProductionOutputs';
import { parseSalesPendingVideoTask } from './salesVideoTask';

const receipt = { taskId: 'wan-task', model: 'wan3.0-video', modelSelection: 'chosen-channel', sourceKey: 'exact-video-inputs' };

describe('saved production video receipts', () => {
  it('round trips the task, upstream model, selected channel and source identity through the draft', () => {
    const plan = { ...emptySalesProductionPlan(), scriptId: 'script', pendingVideoTask: receipt };
    expect(parseSalesProductionPlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
    expect(parseSalesProductionPlan({ generatedVideoUrl: '/legacy.mp4' }))
      .toMatchObject({ pendingVideoTask: null, generatedVideoUrl: '/legacy.mp4' });
  });

  it.each([null, [], {}, { ...receipt, taskId: '' }, { ...receipt, modelSelection: '' }, { ...receipt, sourceKey: '' },
    { ...receipt, sourceKey: 'x'.repeat(1_000_001) }])('rejects an incomplete or oversized recovery receipt', (value) => {
    expect(parseSalesPendingVideoTask(value)).toBeNull();
  });

  it('does not store credentials or unrelated fields from a receipt', () => {
    expect(parseSalesPendingVideoTask({ ...receipt, apiKey: 'must-not-persist', credential: { secret: 'ignored' } })).toEqual(receipt);
  });

  it('clears the receipt when the script, visual settings or resolved source changes', () => {
    const plan = { ...emptySalesProductionPlan(), scriptId: 'old-script', pendingVideoTask: receipt };
    expect(planForSelectedScript(plan, 'new-script').pendingVideoTask).toBeNull();
    expect(patchSalesProductionPlan(plan, { videoModel: 'another-channel' }).pendingVideoTask).toBeNull();
    expect(staleSalesProductionOutputs(plan, { video: 'old', voice: '', mix: '' }, { video: 'new', voice: '', mix: '' }))
      .toEqual({ pendingVideoTask: null });
  });

  it('keeps the receipt through soundtrack edits and clears it when an imported video replaces the task', () => {
    const plan = { ...emptySalesProductionPlan(), pendingVideoTask: receipt };
    expect(patchSalesProductionPlan(plan, { customBgmUrl: '/track.mp3' }).pendingVideoTask).toEqual(receipt);
    expect(patchSalesProductionPlan(plan, { generatedVideoUrl: '/imported.mp4' }).pendingVideoTask).toBeNull();
  });
});
