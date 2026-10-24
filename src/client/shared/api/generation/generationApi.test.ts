import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@client/shared/api/apiClient';
import { getGatewayClientHeaders } from '@client/shared/api/gatewayClient';
import { pollGenerationTask, pollSingleTaskResult } from './generationApi';

vi.mock('@client/shared/api/apiClient', () => ({
  apiFetch: vi.fn(), readClientStorageConfig: () => ({}), storageConfigHeaders: () => ({ 'x-storage': 'configured' }),
}));
vi.mock('@client/shared/api/gatewayClient', () => ({
  getGatewayClientHeaders: vi.fn(() => ({ 'x-custom-base-url': 'https://selected.example', 'x-custom-api-key': 'selected-key' })),
  getGatewayClientOverrides: () => ({}), getModelCredentials: () => ({}),
}));
vi.mock('./generationAbort', async original => ({
  ...await original<typeof import('./generationAbort')>(), sleepWhilePolling: async () => {},
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({
    success: true, status: 'SUCCESS', resultUrl: 'https://images.example/result.png',
  })));
});

describe('image task query routing', () => {
  it.each(['image', 'video'] as const)('preserves selected model credentials for %s tasks', async mediaType => {
    await pollGenerationTask('original/task', mediaType, 'openai/gpt-image-2');
    expect(getGatewayClientHeaders).toHaveBeenCalledWith('openai/gpt-image-2');
    expect(apiFetch).toHaveBeenCalledWith(`/api/generate/${mediaType}?taskId=original%2Ftask&model=openai%2Fgpt-image-2`, {
      headers: { 'x-custom-base-url': 'https://selected.example', 'x-custom-api-key': 'selected-key', 'x-storage': 'configured' },
    });
  });

  it('keeps the original model route throughout image polling', async () => {
    await expect(pollSingleTaskResult('original/task', () => false, undefined, 'openai/gpt-image-2'))
      .resolves.toEqual({ url: 'https://images.example/result.png', temporary: false });
    expect(apiFetch).toHaveBeenCalledWith('/api/generate/image?taskId=original%2Ftask&model=openai%2Fgpt-image-2', expect.objectContaining({
      headers: expect.objectContaining({ 'x-custom-api-key': 'selected-key' }),
    }));
  });
});
