import { expect, it } from 'vitest';
import { buildStandardOpenAiImagePayload, resolveImageGatewaySize } from './imageGatewaySize';
const baseUrl = 'https://api.gapnet.ai/endpoint';
const model = 'openai/gpt-image-2';
it.each([
  ['768x1024', '3:4', '768x1024'],
  ['1536x2048', '3:4', '768x1024'],
  ['2160x3840', '9:16', '720x1280'],
  ['3840x2160', '16:9', '1280x720'],
  ['2048x2048', '1:1', '1024x1024'],
  ['auto', undefined, 'auto'],
])('maps %s to standard dimensions', (size, aspect, expected) => {
  expect(resolveImageGatewaySize(baseUrl, model, size, aspect)).toBe(expected);
});
it('leaves the primary gateway and unrelated models alone', () => {
  expect(resolveImageGatewaySize('https://ai.comfly.org', model, '1536x2048', '3:4')).toBe('1536x2048');
  expect(resolveImageGatewaySize(baseUrl, 'other', '1536x2048', '3:4')).toBe('1536x2048');
  expect(resolveImageGatewaySize('https://independent.example', model, '1536x2048', '3:4', true)).toBe('768x1024');
});
it.each(['low', 'medium', 'high', 'auto'])('quality %s does not alter size or model', quality => {
  expect(buildStandardOpenAiImagePayload({ baseUrl, model, prompt: 'original prompt', size: '768x1024', aspect: '3:4', quality })).toEqual({
    model, prompt: 'original prompt', size: '768x1024', quality, n: 1, output_format: 'png',
  });
});
it('rejects unsupported quality before sending a billable request', () => {
  expect(() => buildStandardOpenAiImagePayload({ baseUrl, model, prompt: 'test', size: 'auto', quality: 'ultra' })).toThrow();
});

it.each([[21,9],[16,9],[3,2],[4,3],[1,1],[3,4],[2,3],[9,16]])('keeps %s:%s exactly with valid pixel bounds', (w,h) => {
  const value = resolveImageGatewaySize(baseUrl, model, '4096x4096', `${w}:${h}`);
  const [width,height] = value.split('x').map(Number);
  expect(width * h).toBe(height * w);
  expect(width % 16).toBe(0);
  expect(height % 16).toBe(0);
  expect(width * height).toBeGreaterThanOrEqual(655360);
  expect(Math.max(width,height)).toBeLessThanOrEqual(1344);
});
