import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CUSTOM_MODELS_BACKUP_KEY,
  CUSTOM_MODELS_KEY,
  loadCustomModels,
  persistCustomModels,
} from './customModelsStorage.ts';

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

test('corrupt custom_models keeps previous list and never writes empty array', () => {
  const storage = memoryStorage();
  globalThis.localStorage = storage;
  storage.setItem(CUSTOM_MODELS_KEY, '{not-json');
  const previous = [{ id: 'keep-me', name: 'Keep', shortName: 'K', isImage: true, isVideo: false }];
  const loaded = loadCustomModels(previous);
  assert.equal(loaded.invalid, true);
  assert.equal(loaded.models, previous);
  assert.equal(storage.getItem(CUSTOM_MODELS_KEY), '{not-json');
  assert.equal(storage.getItem(CUSTOM_MODELS_BACKUP_KEY), '{not-json');
});

test('custom model storage preserves the explicit Model Management priority', () => {
  const storage = memoryStorage();
  globalThis.localStorage = storage;
  const models = [
    { id: 'gpt-5.6-luna', name: 'Luna', isMultimodal: true },
    { id: 'grok-4.6', name: 'Grok', isMultimodal: true },
    { id: 'gemini-3.7-flash', name: 'Gemini', isMultimodal: true },
  ];

  assert.equal(persistCustomModels(models), true);
  assert.deepEqual(JSON.parse(storage.getItem(CUSTOM_MODELS_KEY)), models);
  assert.deepEqual(loadCustomModels().models, models);
});
