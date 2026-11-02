import { afterEach, describe, expect, it } from 'vitest';
import type { GenerationTask } from '@client/store/appStoreTypes';
import { clearRefMediaRegistry, registerRefMedia } from './refMediaRegistry';
import { parseAgentAttachments } from './agentArtifact';

afterEach(clearRefMediaRegistry);

describe('Agent media attachments', () => {
  it('recognizes a local blob video using its original file', () => {
    const file = new File(['video'], '分镜.webm', { type: 'video/webm' });
    registerRefMedia('blob:local-video', file);
    expect(parseAgentAttachments({ referenceImages: ['blob:local-video'] } as GenerationTask))
      .toEqual([{ url: 'blob:local-video', name: file.name, kind: 'video', size: file.size }]);
  });

  it('recognizes stored and signed video URLs after the registry is gone', () => {
    const urls = ['/storage/local/assistant-attachments/test.webm', 'https://example.com/movie.MOV?token=test'];
    expect(parseAgentAttachments({ referenceImages: urls } as GenerationTask).map((item) => item.kind)).toEqual(['video', 'video']);
  });
});
