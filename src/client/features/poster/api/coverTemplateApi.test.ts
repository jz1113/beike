import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@client/shared/api/apiClient';
import { fetchCoverTemplates, fetchCoverTemplate, fetchCoverFeedSamples, updateCoverTemplate } from './coverTemplateApi';
vi.mock('@client/shared/api/apiClient', () => ({ apiFetch: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
describe('template library API', () => {
  it('requests a bounded page with encoded search, not the full memory graph', async () => {
    vi.mocked(apiFetch).mockResolvedValue(Response.json({ success: true, templates: [], total: 1000, offset: 24, pageSize: 24 }));
    const page = await fetchCoverTemplates('暖色 & 黑体', 'adopted', 24);
    const url = new URL(String(vi.mocked(apiFetch).mock.calls[0][0]), 'http://localhost');
    expect(url.searchParams.get('q')).toBe('暖色 & 黑体');
    expect(url.searchParams.get('offset')).toBe('24');
    expect(page.total).toBe(1000);
    expect(apiFetch).toHaveBeenCalledOnce();
  });
  it('reads a single prompt and keeps legacy provenance', async () => {
    vi.mocked(apiFetch).mockResolvedValue(Response.json({ success: true, prompt: '旧拆解整理稿', legacy: true }));
    expect(await fetchCoverTemplate('a/b')).toMatchObject({ legacy: true });
    expect(vi.mocked(apiFetch).mock.calls[0][0]).toContain('id=a%2Fb');
  });
  it('surfaces edit conflicts without silently retrying', async () => {
    vi.mocked(apiFetch).mockResolvedValue(Response.json({ success: false, error: '模板已在其他页面修改' }, { status: 409 }));
    await expect(updateCoverTemplate('id', { title: '新名称', expectedUpdatedAt: 'old' })).rejects.toThrow('其他页面');
    expect(apiFetch).toHaveBeenCalledOnce();
  });
  it('reconciles just the original feed request', async () => {
    vi.mocked(apiFetch).mockResolvedValue(Response.json({ success: true, samples: [] }));
    expect(await fetchCoverFeedSamples('request-1')).toEqual([]);
    expect(vi.mocked(apiFetch).mock.calls[0][0]).toContain('requestKey=request-1');
  });
});
