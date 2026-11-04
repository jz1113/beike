import { describe, expect, it } from 'vitest';
import { grokImagineVideoEndpoints } from './endpoints';

describe('Grok official and gateway video routes', () => {
  it.each([
    ['https://api.x.ai', 'https://api.x.ai'],
    [' https://api.x.ai/v1/ ', 'https://api.x.ai'],
    ['https://eu.api.x.ai/v1', 'https://eu.api.x.ai'],
    ['https://us.api.x.ai/v1', 'https://us.api.x.ai'],
    ['https://gateway.example/v1', 'https://gateway.example/xai'],
    ['https://gateway.example/xai/v1/', 'https://gateway.example/xai'],
    ['https://gateway.example/proxy/xai/v1', 'https://gateway.example/proxy/xai'],
    ['https://gateway.example/proxy/v1', 'https://gateway.example/proxy/xai'],
    ['https://api.x.ai.proxy.example/v1', 'https://api.x.ai.proxy.example/xai'],
  ])('submits and polls through the same protocol for %s', (base, root) => {
    for (const mode of ['text', 'omni', 'first_frame', 'first_last_frame', 'edit', 'extend']) {
      const path = mode === 'edit' ? 'edits' : mode === 'extend' ? 'extensions' : 'generations';
      expect(grokImagineVideoEndpoints(base, mode)).toEqual({
        submit: [`${root}/v1/videos/${path}`],
        query: [`${root}/v1/videos/{taskId}`],
      });
    }
  });
});
