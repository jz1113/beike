import assert from 'node:assert/strict';
import test from 'node:test';
import { configureDomainRuntime } from '@beike/domain/runtime';
import { gatewayModelToWorkflowModel, getEnabledMultimodalModelsFromSettings, getEnabledImageModelsFromSettings, getEnabledVideoModelsFromSettings, repairWorkflowModelsForSettings, hasWorkflowModelConfiguration, workflowModelRouteId } from '@beike/domain/workflowModels';
import { selectModelRows, restoreChannelPresets, formatModelPrice } from './modelManagement.ts';
import { resolveServiceStatus, sameConnectionInputs } from './connectionStatus.ts';
import { loadSystemConfiguredModels } from '../../shared/models/configuredModels.ts';
const model = (id, channel = 'comfly', extra = {}) => ({ ...gatewayModelToWorkflowModel({ id, name: id }, channel), ...extra });
const opts = { channel: 'all', capability: 'all', query: '', status: 'all', sort: 'configured' };

test('channel and capability filters preserve separate route identities without mutating input', () => {
  const models = [model('gpt-6-luna'), model('gpt-6-luna', 'openai'), model('openai/gpt-image-2', 'lianchi'), model('gpt-image-2', 'comfly', { enabled: false })];
  const before = JSON.stringify(models);
  assert.equal(selectModelRows(models, opts).length, 4);
  assert.deepEqual(selectModelRows(models, { ...opts, channel: 'openai' }).map(workflowModelRouteId), ['openai-responses:gpt-6-luna']);
  assert.equal(selectModelRows(models, { ...opts, capability: 'image', status: 'disabled' })[0].id, 'gpt-image-2');
  assert.equal(selectModelRows(models, { ...opts, query: '联池' })[0].channel, 'lianchi');
  assert.equal(JSON.stringify(models), before);
});

test('price display sorting leaves stored call order intact and unknown/channel-specific prices last', () => {
  const models = [model('gpt-6-sol'), model('gpt-6-luna', 'openai'), model('gpt-6-luna')];
  const before = JSON.stringify(models);
  const prices = { 'gpt-6-sol': { promptPer1k: 2, completionPer1k: 4 }, 'gpt-6-luna': { promptPer1k: 1, completionPer1k: 1 } };
  assert.deepEqual(selectModelRows(models, { ...opts, sort: 'price', prices }).map(workflowModelRouteId), ['gpt-6-luna', 'gpt-6-sol', 'openai-responses:gpt-6-luna']);
  assert.equal(JSON.stringify(models), before);
  assert.equal(formatModelPrice(0.1 + 0.2), '0.3');
});

test('scoped restore preserves other channels, custom entries, and discovered non-presets', () => {
  const custom = model('gpt-6-sol', 'comfly', { isCustom: true, name: '自定义名称' });
  const discovered = model('gpt-5.6-sol');
  const openai = model('gpt-6-luna', 'openai', { enabled: false });
  const lianchi = model('openai/gpt-image-2', 'lianchi');
  const restored = restoreChannelPresets([model('gpt-6-luna', 'comfly', { enabled: false }), custom, discovered, openai, lianchi], [model('gpt-6-luna'), model('gpt-6-sol'), lianchi], 'comfly');
  for (const preserved of [custom, discovered, openai, lianchi]) assert.ok(restored.includes(preserved));
  assert.equal(restored.filter(m => workflowModelRouteId(m) === 'gpt-6-luna').length, 1);
  assert.notEqual(restored.find(m => workflowModelRouteId(m) === 'gpt-6-luna').enabled, false);
});

test('selector disablement survives repair and does not resurrect a configured empty pool', () => {
  const values = new Map([['custom_models', JSON.stringify([model('gpt-6-luna', 'comfly', { enabled: false }), model('gpt-image-2', 'comfly', { enabled: false })])]]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  configureDomainRuntime({ storage });
  globalThis.localStorage = storage;
  try {
    assert.ok(repairWorkflowModelsForSettings().every(m => m.enabled === false));
    assert.deepEqual(getEnabledMultimodalModelsFromSettings(), []);
    assert.deepEqual(getEnabledImageModelsFromSettings(), []);
    assert.deepEqual(getEnabledVideoModelsFromSettings(), []);
    const loaded = loadSystemConfiguredModels();
    assert.deepEqual(loaded.availableVisionModels, []);
    assert.deepEqual(loaded.availableImageModels, []);
    assert.equal(loaded.selectedVisionModel, '');
    storage.setItem('custom_models', '[]');
    assert.equal(hasWorkflowModelConfiguration(), true);
    storage.removeItem('custom_models');
    assert.equal(hasWorkflowModelConfiguration(), false);
    assert.ok(loadSystemConfiguredModels().availableVisionModels.length > 0);
  } finally { configureDomainRuntime({ storage: null }); delete globalThis.localStorage; }
});

test('credentials alone never claim connected, and changed test inputs invalidate evidence', () => {
  assert.equal(resolveServiceStatus(false).state, 'unconfigured');
  assert.equal(resolveServiceStatus(true).state, 'untested');
  const passed = { ok: true, message: '目录测试通过', checkedAt: 1 };
  assert.equal(resolveServiceStatus(true, false, false, passed).state, 'disabled');
  assert.equal(resolveServiceStatus(true, true, true, passed).state, 'testing');
  assert.equal(resolveServiceStatus(true, true, false, passed).state, 'passed');
  assert.equal(resolveServiceStatus(true, true, false, { ...passed, ok: false }).state, 'failed');
  assert.equal(sameConnectionInputs(['url', 'key'], ['url', 'new-key']), false);
  assert.equal(sameConnectionInputs(['url', 'key'], ['new-url', 'key']), false);
  assert.equal(sameConnectionInputs(['url', 'key'], ['url', 'key']), true);
});
