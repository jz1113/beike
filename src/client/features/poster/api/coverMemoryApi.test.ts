import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@client/shared/api/apiClient';
import { CoverDeconstructError, deconstructCoverSample, fetchCoverMemory } from './coverMemoryApi';

vi.mock('@client/shared/api/apiClient', () => ({ apiFetch: vi.fn() }));
vi.mock('@client/shared/utils/modelUsage', () => ({ recordChatTokens: vi.fn() }));
vi.mock('../model/coverVisionModels', () => ({ resolveCoverVisionRoute: () => ({ modelId: 'vision', textProtocol: 'openai' }) }));
vi.mock('../model/coverReasoning', () => ({ coverDeconstructBody: (_route: unknown, imageUrl: string, title: string) => ({ model: 'vision', imageUrls: [imageUrl], title }) }));
afterEach(() => vi.resetAllMocks());

const sample = { id: 'old', title: '旧样张', imageUrls: ['/a.png'], model: 'vision', status: 'completed', error: '', createdAt: '2026-01-01' };

describe('cover memory API recovery', () => {
  it('loads every page and deduplicates records shifted by concurrent insertions', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(Response.json({ success: true, samples: [sample], nextOffset: 100 }))
      .mockResolvedValueOnce(Response.json({ success: true, samples: [sample, { ...sample, id: 'older' }], nextOffset: null }));
    const result = await fetchCoverMemory();
    expect(result.samples.map((row) => row.id)).toEqual(['old', 'older']);
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/generate/headline-memory?offset=100');
  });

  it('rejects nonadvancing pagination instead of looping forever', async () => {
    vi.mocked(apiFetch).mockResolvedValue(Response.json({ success: true, nextOffset: 0 }));
    await expect(fetchCoverMemory()).rejects.toThrow('分页异常');
    expect(apiFetch).toHaveBeenCalledOnce();
  });

  it('replays the same operation key and keeps a running operation uncertain', async () => {
    vi.mocked(apiFetch).mockResolvedValue(Response.json({ success: false, uncertain: true, sampleId: 'running', error: '原任务执行中' }, { status: 409 }));
    await expect(deconstructCoverSample('/a.png', 'vision', '样张', undefined, 'same-key')).rejects.toMatchObject({ uncertain: true, sampleId: 'running' });
    const request = vi.mocked(apiFetch).mock.calls[0][1]!;
    expect(JSON.parse(request.body as string).requestKey).toBe('same-key');
  });

  it('treats a malformed success response as uncertain', async () => {
    vi.mocked(apiFetch).mockResolvedValue(Response.json(null));
    await expect(deconstructCoverSample('/a.png', 'vision', '样张')).rejects.toBeInstanceOf(CoverDeconstructError);
    vi.mocked(apiFetch).mockResolvedValue(Response.json({ success: true }));
    await expect(deconstructCoverSample('/a.png', 'vision', '样张')).rejects.toMatchObject({ uncertain: true });
  });
});
