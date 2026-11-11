import { expect, expectTypeOf, it, vi } from 'vitest';
import { apiRequest } from './apiRequest';
import { apiFetch } from './apiClient';

vi.mock('./apiClient', () => ({ apiFetch: vi.fn(async () => new Response('{}')) }));

it('restricts each path to the methods declared by OpenAPI', async () => {
  expectTypeOf<Parameters<typeof apiRequest<'/api/assets/storage/upload'>>[0]>().toEqualTypeOf<'POST'>();
  const invalidCalls = () => {
    // @ts-expect-error The upload endpoint only accepts POST.
    void apiRequest('GET', '/api/assets/storage/upload');
    // @ts-expect-error The upload endpoint has no DELETE operation.
    void apiRequest('DELETE', '/api/assets/storage/upload');
    // @ts-expect-error Unknown paths must not widen the method parameter.
    void apiRequest('POST', '/api/nonexistent');
  };
  expectTypeOf(invalidCalls).toBeFunction();
  await apiRequest('POST', '/api/assets/storage/upload', { body: 'fixture' });
  expect(apiFetch).toHaveBeenCalledWith('/api/assets/storage/upload', { method: 'POST', body: 'fixture' });
});
