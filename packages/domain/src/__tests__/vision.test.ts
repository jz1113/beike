import { describe, expect, it } from 'vitest';
import {
  buildVisionModelsToTry,
  buildPass1VisionModelsToTry,
  filterVisionCapableModels,
  isVisionCapableModel,
} from '../vision';

describe('buildVisionModelsToTry', () => {
  it('returns primary + user fallbacks without injecting built-in models', () => {
    const chain = buildVisionModelsToTry('gpt-5.6-luna', [
      'gemini-3.6-flash',
      'claude-haiku-4-5-20251001',
      'gpt-5.5-pro',
    ]);
    expect(chain).toEqual([
      'gpt-5.6-luna',
      'gemini-3.6-flash',
      'claude-haiku-4-5-20251001',
    ]);
    expect(chain).not.toContain('gpt-5.5-pro');
  });

  it('deduplicates normalized and raw primary model', () => {
    const chain = buildVisionModelsToTry('gpt-4-vision-preview', ['gpt-5.6-luna']);
    expect(chain).toEqual(['gpt-5.6-luna']);
  });

  it('returns empty array when no model and no fallbacks', () => {
    expect(buildVisionModelsToTry(undefined, [])).toEqual([]);
    expect(buildVisionModelsToTry('', [])).toEqual([]);
  });

  it('can build chain from fallbacks only when primary missing', () => {
    expect(buildVisionModelsToTry(undefined, ['gemini-3.6-flash', 'gpt-5.6-luna'])).toEqual([
      'gemini-3.6-flash',
      'gpt-5.6-luna',
    ]);
  });

  it('respects maxTotal cap', () => {
    const chain = buildVisionModelsToTry('a', ['b', 'c', 'd'], 2);
    expect(chain).toEqual(['a', 'b']);
  });
});

describe('isVisionCapableModel', () => {
  it('accepts common multimodal vision models', () => {
    expect(isVisionCapableModel('gpt-5.6-luna')).toBe(true);
    expect(isVisionCapableModel('gemini-3.6-flash')).toBe(true);
    expect(isVisionCapableModel('claude-3-7-sonnet-thinking')).toBe(true);
  });

  it('rejects text-only deepseek models', () => {
    expect(isVisionCapableModel('deepseek-v4-flash')).toBe(true);
    expect(isVisionCapableModel('deepseek-chat')).toBe(false);
    expect(isVisionCapableModel('deepseek-reasoner')).toBe(false);
  });

  it('filterVisionCapableModels removes non-vision models from chain', () => {
    expect(
      filterVisionCapableModels(['gpt-5.6-luna', 'gemini-3.6-flash', 'deepseek-v4-flash'])
    ).toEqual(['gpt-5.6-luna', 'gemini-3.6-flash', 'deepseek-v4-flash']);
  });
});

describe('buildPass1VisionModelsToTry', () => {
  it('strictly keeps user chosen primary model as the first element without reordering flash ahead', () => {
    const chain = buildPass1VisionModelsToTry('gpt-5.6-luna', ['glm-5.3-flash', 'gemini-3.1-pro-preview-thinking-high']);
    expect(chain[0]).toBe('gpt-5.6-luna');
    expect(chain).toEqual([
      'gpt-5.6-luna',
      'glm-5.3-flash',
      'gemini-3.1-pro-preview',
    ]);
  });
});
