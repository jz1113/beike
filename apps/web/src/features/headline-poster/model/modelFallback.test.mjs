import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPosterTitleModelFallbackChain } from './posterTypes.ts';

test('title-model fallback keeps the selected model first and follows Model Management order', () => {
  const chain = buildPosterTitleModelFallbackChain('gpt-5.6-luna', [
    'gpt-5.6-luna', 'grok-4.6', 'gemini-3.7-flash', 'gemini-3.8-flash', 'deepseek-v4-flash', 'gpt-5.4-mini', 'claude-haiku-4-5-20251001-thinking', 'claude-sonnet-5', 'gpt-5.6-terra',
  ]);

  assert.deepEqual(chain, [
    'gpt-5.6-luna', 'grok-4.6', 'gemini-3.7-flash', 'gemini-3.8-flash', 'deepseek-v4-flash', 'gpt-5.4-mini', 'claude-haiku-4-5-20251001-thinking', 'claude-sonnet-5', 'gpt-5.6-terra',
  ]);
});

test('title-model fallback promotes an explicit primary, then retains configured priority', () => {
  assert.deepEqual(
    buildPosterTitleModelFallbackChain('gemini-3.8-flash', ['gpt-5.6-luna', 'grok-4.6', 'gemini-3.7-flash', 'gemini-3.8-flash', 'deepseek-v4-flash']),
    ['gemini-3.8-flash', 'gpt-5.6-luna', 'grok-4.6', 'gemini-3.7-flash', 'deepseek-v4-flash'],
  );
});
