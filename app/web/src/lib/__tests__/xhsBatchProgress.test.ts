import { expect, it, vi } from 'vitest';
import { batchParseXhsLinks, type XhsParseProgress } from '../xhsLinkBatch';
import { apiFetch } from '../apiClient';
vi.mock('../apiClient', () => ({ apiFetch: vi.fn() }));
vi.mock('../externalScraperCredentials', () => ({ getExternalScraperCredentials: async () => ({}) }));
vi.mock('../rateLimiter', () => ({ RateLimiter: class { async acquire() {} triggerBackoff() {} } }));
it('counts completions monotonically and distinguishes failures from filtered media', async () => {
  let release!: (r: Response) => void;
  vi.mocked(apiFetch).mockImplementation(async (_url, init) => {
    const {url} = JSON.parse(String(init?.body));
    if (url.endsWith('/a')) return new Promise<Response>(resolve => { release = resolve; });
    if (url.endsWith('/b')) return new Response(JSON.stringify({ success: true, data: { images: ['one.jpg'] } }));
    return new Response(JSON.stringify({ success: false, error: '两个接口均失败', attempts: [{provider:'APIA',success:false},{provider:'奇云',success:false}] }), {status:502});
  });
  const progress: XhsParseProgress[] = [];
  const promise = batchParseXhsLinks('https://xhslink.com/a\nhttps://xhslink.com/b\nhttps://xhslink.com/c', undefined, undefined, {onProgress:p => progress.push(p)});
  await vi.waitFor(() => expect(progress).toHaveLength(2));
  expect(progress.map(p => p.current)).toEqual([1,2]);
  release(new Response(JSON.stringify({success:true, data:{images:['a','b','c']}, apiUsed:'奇云'})));
  const result = await promise;
  expect(progress[2]).toMatchObject({current:3,total:3,success:1,filtered:1,failed:1});
  expect(result.skipped.map(r => r.kind).sort()).toEqual(['failed','filtered']);
  expect(result.queueItems[0].apiUsed).toBe('奇云');
});
