import { afterEach, beforeEach, expect, it } from 'vitest';
import { configureDomainRuntime } from '@shared/domain/core/runtime';
import { agentModelName } from './agentModelName';

const model = 'gemini-custom-flash';
beforeEach(() => {
  const data = new Map([
    ['beike_api_providers_v2', JSON.stringify([{ id: 'relay', name: '阿卓反代' }])],
    ['beike_modality_models_v1_chat', JSON.stringify([
      { id: 'relay-entry', modelId: model, name: model, channelId: 'relay' },
      { id: 'global-entry', modelId: model, name: model },
    ])],
  ]);
  configureDomainRuntime({ storage: { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: key => { data.delete(key); } } });
});
afterEach(() => configureDomainRuntime({ storage: null }));

it('uses the selected channel when the server reports a shared upstream model', () => {
  const task = { model, agentTurn: { modelUsed: model } };
  expect(agentModelName({ ...task, modelRouteKey: 'global-entry' })).toBe(model);
  expect(agentModelName({ ...task, modelRouteKey: 'relay-entry' })).toBe(model + ' · 阿卓反代');
  expect(agentModelName(task)).toBe(model);
});

it('shows a different model reported by the server', () => {
  expect(agentModelName({ model, modelRouteKey: 'relay-entry', agentTurn: { modelUsed: 'fallback-model' } })).toBe('fallback-model');
});
