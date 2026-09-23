import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCodexCatalog } from './codexCatalog.ts';

test('imports CC Switch Codex catalog slugs without credentials', () => {
  const models = parseCodexCatalog({ models: [
    { slug: 'gpt-6-luna', display_name: 'GPT 6 Luna', input_modalities: ['text', 'image'] },
    { slug: 'gpt-6-luna' },
    { slug: 'deepseek-flash', display_name: 'DeepSeek Flash' },
  ] });
  assert.deepEqual(models.map(model => [model.id, model.supported]), [
    ['gpt-6-luna', true],
    ['deepseek-flash', false],
  ]);
});

test('rejects unrelated JSON instead of claiming it is a model catalog', () => {
  assert.throws(() => parseCodexCatalog({ auth_mode: 'chatgpt' }), /models 数组/);
});
