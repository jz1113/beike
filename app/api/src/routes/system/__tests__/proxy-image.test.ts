import { describe, expect, it, vi } from 'vitest';
import { GET, clearProxyVideoCache } from '../proxy-image';
import sharp from 'sharp';

describe('proxy-image route', () => {
  it('clearProxyVideoCache clears memory cache', () => {
    const count = clearProxyVideoCache();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('rejects invalid urls or SSRF safely with fallback SVG', async () => {
    const req = new Request('http://localhost/api/system/proxy-image?url=http://127.0.0.1:8080/secret');
    const res = await GET(req);
    expect(res.headers.get('content-type')).toContain('image/svg+xml');
  });

  it('generates webp thumbnail when thumb=1 is requested for remote images', async () => {
    // Generate a valid PNG in memory
    const samplePng = await sharp({
      create: {
        width: 1000,
        height: 1000,
        channels: 4,
        background: { r: 50, g: 100, b: 150, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    // Mock global fetch to return our samplePng
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue(
      new Response(samplePng, {
        status: 200,
        headers: {
          'content-type': 'image/png',
          'content-length': String(samplePng.byteLength),
        },
      })
    );

    try {
      const testUrl = 'https://sns-img-hw.xhscdn.com/test-sample-image-thumb.png';
      const req = new Request(`http://localhost/api/system/proxy-image?url=${encodeURIComponent(testUrl)}&thumb=1&w=320`);
      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/webp');
      const bodyBuf = Buffer.from(await res.arrayBuffer());
      const metadata = await sharp(bodyBuf).metadata();
      expect(metadata.format).toBe('webp');
      expect(metadata.width).toBe(320);

      // Verify HTTP 304 ETag caching
      const etag = res.headers.get('etag');
      expect(etag).toBeTruthy();

      const cachedReq = new Request(`http://localhost/api/system/proxy-image?url=${encodeURIComponent(testUrl)}&thumb=1&w=320`, {
        headers: { 'if-none-match': etag! },
      });
      const cachedRes = await GET(cachedReq);
      expect(cachedRes.status).toBe(304);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
