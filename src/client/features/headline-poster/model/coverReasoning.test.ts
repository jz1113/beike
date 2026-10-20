import { beforeEach, describe, expect, it } from 'vitest';
import { configureDomainRuntime } from '@shared/domain/core/runtime';
import { coverDeconstructBody, coverReasoningEffort, readCoverReasoningMap, rememberCoverReasoning } from './coverReasoning';

const memory = new Map<string, string>();

describe('cover reasoning effort', () => {
  beforeEach(() => {
    memory.clear();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value); },
      removeItem: (key: string) => { memory.delete(key); },
    };
    configureDomainRuntime({ storage });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  });

  it('keeps a per-model effort and falls back to medium for a capable model', () => {
    expect(coverReasoningEffort('claude-haiku-5-5', 'anthropic', {})).toBe('medium');
    const stored = rememberCoverReasoning({}, 'claude-haiku-5-5', 'xhigh', 'anthropic');
    expect(stored['claude-haiku-5-5']).toBe('xhigh');
    expect(readCoverReasoningMap()).toEqual({ 'claude-haiku-5-5': 'xhigh' });
    expect(coverReasoningEffort('claude-haiku-5-5', 'openai', stored)).toBe('auto');
    expect(coverReasoningEffort('gpt-4o-mini', 'openai', stored)).toBe('auto');
  });

  it('sends a normalized effort only when the selected route can use it', () => {
    const route = { modelId: 'claude-haiku-5-5', textProtocol: 'anthropic' as const, baseUrl: 'https://example.test', apiKey: 'secret' };
    expect(coverDeconstructBody(route, 'https://img.test/a.jpg', '样张', 'xhigh')).toMatchObject({ reasoningEffort: 'xhigh', model: 'claude-haiku-5-5' });
    expect(coverDeconstructBody({ ...route, textProtocol: 'openai' }, 'https://img.test/a.jpg', '样张', 'high')).not.toHaveProperty('reasoningEffort');
    expect(coverDeconstructBody({ ...route, modelId: 'gpt-4o-mini', textProtocol: 'openai' }, 'https://img.test/a.jpg', '样张', 'high')).not.toHaveProperty('reasoningEffort');
  });
});