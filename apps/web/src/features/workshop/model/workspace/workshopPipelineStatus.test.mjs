import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveWorkshopPipelineStatus as status } from './workshopPipelineStatus.ts';
const idle = { collecting: false, analyzing: false, generating: false, control: 'running' };
const product = patch => ({ selected: true, status: 'success', prompts: [], tasks: [], ...patch });
test('pipeline snapshot follows preparation and analysis rather than staying draft', () => {
  assert.equal(status([], idle), 'draft');
  assert.equal(status([], { ...idle, collecting: true }), 'collecting');
  assert.equal(status([product()], idle), 'plan_ready');
  assert.equal(status([product({ isAnalyzing: true })], idle), 'analyzing');
  assert.equal(status([product({ analyzedSuccess: true, prompts: [{shot_no:1}] })], idle), 'review_required');
});
test('generation, pause, cancellation and recovery are reflected in pipeline snapshot', () => {
  const queued = product({ tasks: [{status:'PENDING'}] });
  assert.equal(status([queued], { ...idle, generating: true }), 'generating');
  assert.equal(status([queued], { ...idle, generating: true, control: 'paused' }), 'paused');
  assert.equal(status([queued], { ...idle, control: 'cancelled' }), 'cancelled');
  assert.equal(status([queued], idle), 'approved');
  assert.equal(status([product({ tasks: [{status:'FAILURE', recoveryRequired:true, resultStatus:'superseded'}] })], idle), 'partial_failed');
});
test('successful current results require QC, and superseded/unselected results do not count', () => {
  const success = {status:'SUCCESS', resultUrl:'/storage/image.jpg'};
  assert.equal(status([product({tasks:[success]})], idle), 'qc_required');
  assert.equal(status([product({tasks:[{...success, resultStatus:'superseded'}]})], idle), 'plan_ready');
  assert.equal(status([product({selected:false,tasks:[{status:'FAILURE'}]})], idle), 'draft');
});
