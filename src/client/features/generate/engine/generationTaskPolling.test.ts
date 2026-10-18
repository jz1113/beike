import { describe, expect, it } from 'vitest';
import type { GenerationTask } from '@client/store';
import { failedTaskPollEndpoint } from './generationTaskPolling';

function task(partial: Partial<GenerationTask>): GenerationTask {
  return {
    id: 't1',
    prompt: '',
    model: 'gpt-image-2',
    status: 'FAILURE',
    createdAt: 1,
    ...partial,
  } as GenerationTask;
}

describe('failedTaskPollEndpoint', () => {
  it('routes depth images away from the generic image poller', () => {
    expect(failedTaskPollEndpoint(task({ mediaType: 'depth-image' }))).toBe('/api/generate/depth-image');
    expect(failedTaskPollEndpoint(task({ mediaType: 'image' }))).toBe('/api/generate/image');
    expect(failedTaskPollEndpoint(task({ mediaType: 'audio' }))).toBe('/api/generate/audio');
  });
});
