import { afterEach, describe, expect, it, vi } from 'vitest';
import { GENERATION_BATCH_LIMIT } from '@shared/domain/assistant/generationPrompts';
import {
  generationSubmissionQueue,
  getGenerationMediaConcurrency,
  setGenerationMediaConcurrency,
  subscribeGenerationMediaConcurrency,
} from './generationSubmissionConfig';

const initialConcurrency = getGenerationMediaConcurrency();
afterEach(() => {
  generationSubmissionQueue.cancel();
  setGenerationMediaConcurrency(initialConcurrency);
});

describe('generation submission configuration', () => {
  it('configures the same shared queue used by the generation engine', () => {
    expect(getGenerationMediaConcurrency()).toBe(GENERATION_BATCH_LIMIT);
    expect(setGenerationMediaConcurrency(6)).toBe(6);
    expect(generationSubmissionQueue.getMediaConcurrency()).toBe(6);
    expect(setGenerationMediaConcurrency(1)).toBe(1);
    expect(getGenerationMediaConcurrency()).toBe(1);
  });

  it('notifies subscribers only when the effective concurrency changes and supports unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeGenerationMediaConcurrency(listener);
    try {
      setGenerationMediaConcurrency(5);
      expect(listener).toHaveBeenCalledOnce();
      setGenerationMediaConcurrency(5.9);
      expect(listener).toHaveBeenCalledOnce();
      setGenerationMediaConcurrency(99);
      expect(listener).toHaveBeenCalledTimes(2);
      expect(getGenerationMediaConcurrency()).toBe(GENERATION_BATCH_LIMIT);
      unsubscribe();
      setGenerationMediaConcurrency(2);
      expect(listener).toHaveBeenCalledTimes(2);
    } finally {
      unsubscribe();
    }
  });
});
