import assert from 'node:assert/strict';
import { test } from 'node:test';
import { configureDomainRuntime } from '@beike/domain/runtime';
import {
  gatewayModelToWorkflowModel,
  getEnabledMultimodalModelsFromSettings,
  openAIModelRouteId,
  repairWorkflowModelsInStorage,
  upstreamModelId,
  workflowModelRouteId,
} from '@beike/domain/workflowModels';

function memoryStorage(initial = []) {
  const values = new Map(initial);
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: key => { values.delete(key); },
  };
}

test('identical upstream IDs have independent Comfly and OpenAI identities', () => {
  const gatewayModel = { id: 'gpt-6-luna', name: 'GPT 6 Luna', isVision: true, isMultimodal: true };
  const comfly = gatewayModelToWorkflowModel(gatewayModel, 'comfly');
  const openai = gatewayModelToWorkflowModel(gatewayModel, 'openai');
  assert.equal(comfly.id, openai.id);
  assert.equal(workflowModelRouteId(comfly), 'gpt-6-luna');
  assert.equal(workflowModelRouteId(openai), 'openai-responses:gpt-6-luna');
  assert.equal(upstreamModelId(workflowModelRouteId(openai)), 'gpt-6-luna');

  const storage = memoryStorage([['custom_models', JSON.stringify([comfly, openai])]]);
  configureDomainRuntime({ storage });
  try {
    const repaired = repairWorkflowModelsInStorage();
    assert.deepEqual(repaired.map(workflowModelRouteId), ['gpt-6-luna', 'openai-responses:gpt-6-luna']);
    assert.deepEqual(getEnabledMultimodalModelsFromSettings().map(model => model.id), [
      'gpt-6-luna', 'openai-responses:gpt-6-luna',
    ]);
  } finally { configureDomainRuntime({ storage: null }); }
});

test('legacy automatic OpenAI routing migrates to a separate selectable channel once', () => {
  const storage = memoryStorage([
    ['custom_models', JSON.stringify([
      { id: 'gpt-6-luna', name: 'GPT 6 Luna', isMultimodal: true },
      { id: 'gpt-5.6-sol', name: 'GPT 5.6 Sol', isMultimodal: true },
    ])],
    ['openai_responses_enabled', 'true'],
    ['ai_multimodal_model', 'gpt-6-luna'],
  ]);
  configureDomainRuntime({ storage });
  try {
    assert.deepEqual(repairWorkflowModelsInStorage().map(workflowModelRouteId), [
      'gpt-6-luna', 'gpt-5.6-sol', openAIModelRouteId('gpt-6-luna'),
    ]);
    assert.equal(storage.getItem('ai_multimodal_model'), openAIModelRouteId('gpt-6-luna'));
    assert.equal(storage.getItem('openai_channel_split_v1'), 'true');
    assert.equal(repairWorkflowModelsInStorage().length, 3);
  } finally { configureDomainRuntime({ storage: null }); }
});
