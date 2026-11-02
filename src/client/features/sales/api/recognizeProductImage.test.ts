import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@client/shared/api/apiClient';
import { recognizeProductImage } from './recognizeProductImage';
vi.mock('@client/shared/api/apiClient', () => ({ apiFetch: vi.fn() }));
afterEach(() => vi.clearAllMocks());
describe('product image OCR API', () => {
  it('sends original URL, force flag and cancellation signal, validates cached results', async () => {
    const result = { engine: 'rapidocr', width: 800, height: 4200, text: '棉 61.7%', lines: [], cached: true };
    vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ success: true, result })));
    const controller = new AbortController();
    expect(await recognizeProductImage('/storage/local/original.png', controller.signal, true)).toEqual(result);
    expect(apiFetch).toHaveBeenCalledWith('/api/sales/ocr', expect.objectContaining({ signal: controller.signal, body: JSON.stringify({ imageUrl: '/storage/local/original.png', force: true }) }));
  });
  it('surfaces service errors and rejects malformed results', async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ error: '识别环境未安装' }), { status: 503 }));
    await expect(recognizeProductImage('/a.png', new AbortController().signal)).rejects.toThrow('识别环境未安装');
    vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ success: true, result: {} })));
    await expect(recognizeProductImage('/a.png', new AbortController().signal)).rejects.toThrow('格式异常');
  });
});
