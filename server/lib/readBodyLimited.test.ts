import { describe, expect, it } from 'vitest';
import { readResponseBodyLimited } from '../lib/readBodyLimited';

describe('readResponseBodyLimited', () => {
  it('aborts when content-length exceeds max', async () => {
    const res = new Response('x', { headers: { 'content-length': '99999999' } });
    const result = await readResponseBodyLimited(res, 100);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('too_large');
  });

  it('reads small body', async () => {
    const res = new Response('hello');
    const result = await readResponseBodyLimited(res, 100);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.buffer.toString()).toBe('hello');
  });
});
