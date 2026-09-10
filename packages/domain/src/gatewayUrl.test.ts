import { expect, it } from 'vitest';
import { normalizeGatewayBaseUrl } from './gatewayUrl';
import { buildImageRequest, buildVideoRequest } from './modelAdapters';
it.each(['https://gateway.test', 'https://gateway.test/v1', ' https://gateway.test/v1/ '])('normalizes %s at image and video boundaries', base => {
  expect(normalizeGatewayBaseUrl(base)).toBe('https://gateway.test');
  expect(buildImageRequest({ model: 'gpt-image-2.5-flare', prompt: 'test' }).endpoints(base).submit[0]).toBe('https://gateway.test/v1/images/generations?async=true');
  expect(buildVideoRequest({ model: 'veo3.1', prompt: 'test' }).endpoints(base).submit[0]).toBe('https://gateway.test/v2/videos/generations');
});
it('preserves reverse proxy path prefixes', () => {
  expect(normalizeGatewayBaseUrl('https://gateway.test/proxy/openai/v1/')).toBe('https://gateway.test/proxy/openai');
});
